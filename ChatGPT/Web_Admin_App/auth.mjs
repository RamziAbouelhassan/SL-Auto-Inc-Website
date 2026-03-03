import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scrypt = promisify(scryptCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(USERS_DIR, "admin-users.json");
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const ROLE_CAPABILITIES = {
  head: {
    readBookings: true,
    manageBookings: true,
    manageUsers: true,
    manageHeadUsers: true,
    label: "Head admin",
  },
  access_manager: {
    readBookings: true,
    manageBookings: true,
    manageUsers: true,
    manageHeadUsers: false,
    label: "Access manager",
  },
  manager: {
    readBookings: true,
    manageBookings: true,
    manageUsers: false,
    manageHeadUsers: false,
    label: "Manager",
  },
  viewer: {
    readBookings: true,
    manageBookings: false,
    manageUsers: false,
    manageHeadUsers: false,
    label: "Viewer",
  },
};

const ROLE_SORT_ORDER = {
  head: 0,
  access_manager: 1,
  manager: 2,
  viewer: 3,
};

const sessions = new Map();

export class AdminAuthError extends Error {
  constructor(statusCode, message, details = []) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

const normalizeUsername = (value) => String(value || "").trim().toLowerCase();

const normalizeRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  return ROLE_CAPABILITIES[role] ? role : "";
};

const generateId = (prefix) => `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`;

const generateBootstrapPassword = () => randomBytes(9).toString("base64url");

const readStore = async () => {
  await fs.mkdir(USERS_DIR, { recursive: true });
  const fileContents = await fs.readFile(USERS_FILE, "utf8");
  const parsed = JSON.parse(fileContents);
  const users = Array.isArray(parsed?.users) ? parsed.users : [];
  return {
    version: 1,
    users,
  };
};

const writeStore = async (store) => {
  await fs.mkdir(USERS_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
};

const createPasswordRecord = async (password) => {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = Buffer.from(await scrypt(String(password), passwordSalt, 64)).toString("hex");
  return { passwordSalt, passwordHash };
};

const verifyPassword = async (user, password) => {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(await scrypt(String(password), user.passwordSalt, 64));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const getActiveHeadCount = (users) =>
  users.filter((user) => user?.active !== false && normalizeRole(user?.role) === "head").length;

const assertValidPassword = (password, { optional = false } = {}) => {
  const nextPassword = String(password || "");
  if (optional && !nextPassword) return;

  if (nextPassword.length < 6) {
    throw new AdminAuthError(400, "Passwords must be at least 6 characters long.");
  }
};

const sanitizeUser = (user) => {
  const role = normalizeRole(user?.role) || "viewer";
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role,
    roleLabel: ROLE_CAPABILITIES[role].label,
    active: user.active !== false,
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    lastLoginAt: user.lastLoginAt || "",
    permissions: {
      readBookings: ROLE_CAPABILITIES[role].readBookings,
      manageBookings: ROLE_CAPABILITIES[role].manageBookings,
      manageUsers: ROLE_CAPABILITIES[role].manageUsers,
      manageHeadUsers: ROLE_CAPABILITIES[role].manageHeadUsers,
    },
  };
};

const canManageRole = (actorUser, role) => {
  if (!actorUser) return true;
  if (!actorUser.permissions?.manageUsers) return false;
  if (normalizeRole(role) === "head" && !actorUser.permissions?.manageHeadUsers) return false;
  return true;
};

const assertCanManageRole = (actorUser, role) => {
  if (!canManageRole(actorUser, role)) {
    throw new AdminAuthError(403, "Only the head admin can view or change head admin access.");
  }
};

const getVisibleUsersForActor = (users, actorUser) =>
  users.filter((user) => {
    if (!actorUser) return true;
    if (normalizeRole(user?.role) === "head" && !actorUser.permissions?.manageHeadUsers) {
      return false;
    }
    return true;
  });

const sortUsersByRoleAndName = (users) =>
  [...users].sort((left, right) => {
    const leftRole = normalizeRole(left?.role) || "viewer";
    const rightRole = normalizeRole(right?.role) || "viewer";
    const roleCompare = (ROLE_SORT_ORDER[leftRole] ?? 99) - (ROLE_SORT_ORDER[rightRole] ?? 99);
    if (roleCompare !== 0) return roleCompare;

    const leftName = String(left?.displayName || left?.username || "").toLowerCase();
    const rightName = String(right?.displayName || right?.username || "").toLowerCase();
    return leftName.localeCompare(rightName);
  });

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
};

const createBootstrapHead = async ({ logger, existingUsers = [] }) => {
  const requestedUsername = normalizeUsername(process.env.ADMIN_BOOTSTRAP_USERNAME) || "head";
  let username = requestedUsername;
  let duplicateSuffix = 2;

  while (existingUsers.some((user) => user?.username === username)) {
    username = `${requestedUsername}-${duplicateSuffix}`;
    duplicateSuffix += 1;
  }

  const displayName = String(process.env.ADMIN_BOOTSTRAP_NAME || "Head Admin").trim() || "Head Admin";
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || generateBootstrapPassword());
  const timestamp = new Date().toISOString();
  const passwordRecord = await createPasswordRecord(password);

  await writeStore({
    version: 1,
    users: [
      ...existingUsers,
      {
        id: generateId("usr"),
        username,
        displayName,
        role: "head",
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: "",
        ...passwordRecord,
      },
    ],
  });

  logger.log("Admin auth bootstrapped.");
  logger.log(`Head username: ${username}`);
  logger.log(`Head password: ${password}`);

  if (!process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    logger.log("Save that password now. It will not be shown again after the first bootstrapped run.");
  }

  return {
    username,
    password,
  };
};

export const ADMIN_ROLES = Object.keys(ROLE_CAPABILITIES);

export const roleCapabilitiesFor = (role) => {
  const normalizedRole = normalizeRole(role) || "viewer";
  return {
    readBookings: ROLE_CAPABILITIES[normalizedRole].readBookings,
    manageBookings: ROLE_CAPABILITIES[normalizedRole].manageBookings,
    manageUsers: ROLE_CAPABILITIES[normalizedRole].manageUsers,
    manageHeadUsers: ROLE_CAPABILITIES[normalizedRole].manageHeadUsers,
    label: ROLE_CAPABILITIES[normalizedRole].label,
  };
};

export const getSessionTokenFromRequest = (req) => {
  const headerValue = String(req?.headers?.authorization || "");
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
};

export const ensureAdminUserStore = async ({ logger = console } = {}) => {
  try {
    const store = await readStore();
    if (store.users.length === 0 || getActiveHeadCount(store.users) === 0) {
      return createBootstrapHead({ logger, existingUsers: store.users });
    }
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createBootstrapHead({ logger });
    }
    throw error;
  }
};

export const authenticateUser = async ({ username, password }) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !String(password || "")) {
    throw new AdminAuthError(400, "Username and password are required.");
  }

  cleanupExpiredSessions();
  const store = await readStore();
  const user = store.users.find((entry) => entry.username === normalizedUsername);

  if (!user) {
    throw new AdminAuthError(401, "Invalid username or password.");
  }

  if (user.active === false) {
    throw new AdminAuthError(403, "This account has been deactivated or locked. Contact a head admin or access manager.");
  }

  if (!(await verifyPassword(user, password))) {
    throw new AdminAuthError(401, "Invalid username or password.");
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.updatedAt = now;
  await writeStore(store);

  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });

  return {
    token,
    user: sanitizeUser(user),
  };
};

export const getSessionUser = async (token) => {
  cleanupExpiredSessions();
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user || user.active === false) {
    sessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_DURATION_MS;
  return {
    token,
    user: sanitizeUser(user),
  };
};

export const revokeSession = (token) => {
  if (token) {
    sessions.delete(token);
  }
};

export const listAdminUsers = async (actorUser = null) => {
  const store = await readStore();
  return sortUsersByRoleAndName(getVisibleUsersForActor(store.users, actorUser))
    .map(sanitizeUser)
    ;
};

export const createAdminUser = async ({ username, displayName, password, role, active = true }, actorUser = null) => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRole = normalizeRole(role);

  if (!normalizedUsername) {
    throw new AdminAuthError(400, "Username is required.");
  }

  if (!normalizedRole) {
    throw new AdminAuthError(400, "Select a valid role.");
  }

  assertCanManageRole(actorUser, normalizedRole);

  assertValidPassword(password);

  const store = await readStore();
  if (store.users.some((entry) => entry.username === normalizedUsername)) {
    throw new AdminAuthError(409, "That username is already in use.");
  }

  const timestamp = new Date().toISOString();
  const passwordRecord = await createPasswordRecord(password);
  const nextUser = {
    id: generateId("usr"),
    username: normalizedUsername,
    displayName: String(displayName || normalizedUsername).trim() || normalizedUsername,
    role: normalizedRole,
    active: active !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: "",
    ...passwordRecord,
  };

  store.users.push(nextUser);
  await writeStore(store);
  return sanitizeUser(nextUser);
};

export const updateAdminUser = async (userId, updates = {}) => {
  if (!userId) {
    throw new AdminAuthError(400, "User id is required.");
  }

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new AdminAuthError(404, "Admin user not found.");
  }

  const nextUsername = normalizeUsername(updates.username ?? user.username);
  const nextRole = normalizeRole(updates.role ?? user.role) || normalizeRole(user.role);
  const nextActive = updates.active == null ? user.active !== false : Boolean(updates.active);
  const nextDisplayName = String(updates.displayName ?? user.displayName ?? user.username).trim() || nextUsername;

  if (!nextUsername) {
    throw new AdminAuthError(400, "Username is required.");
  }

  if (!nextRole) {
    throw new AdminAuthError(400, "Select a valid role.");
  }

  const actorUser = updates.actorUser || null;
  assertCanManageRole(actorUser, user.role);
  assertCanManageRole(actorUser, nextRole);

  if (
    store.users.some((entry) => entry.id !== userId && entry.username === nextUsername)
  ) {
    throw new AdminAuthError(409, "That username is already in use.");
  }

  if ((user.role === "head" || nextRole !== "head" || nextActive === false) && getActiveHeadCount(store.users) <= 1) {
    const wouldRemoveLastHead = normalizeRole(user.role) === "head" && (nextRole !== "head" || nextActive === false);
    if (wouldRemoveLastHead) {
      throw new AdminAuthError(400, "Keep at least one active head admin account.");
    }
  }

  assertValidPassword(updates.password, { optional: true });

  user.username = nextUsername;
  user.displayName = nextDisplayName;
  user.role = nextRole;
  user.active = nextActive;
  user.updatedAt = new Date().toISOString();

  if (String(updates.password || "")) {
    const passwordRecord = await createPasswordRecord(updates.password);
    user.passwordHash = passwordRecord.passwordHash;
    user.passwordSalt = passwordRecord.passwordSalt;
  }

  await writeStore(store);

  if (!nextActive) {
    for (const [token, session] of sessions.entries()) {
      if (session.userId === userId) {
        sessions.delete(token);
      }
    }
  }

  return sanitizeUser(user);
};
