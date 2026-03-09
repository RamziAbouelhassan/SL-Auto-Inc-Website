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
const RENDER_USERS_FILE = "/var/data/admin-users.json";
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
let adminStorageModeOverride = "";
let adminStorageFallbackLogged = false;

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

const clean = (value) => String(value || "").trim();

const cleanNullable = (value) => {
  const cleaned = clean(value);
  return cleaned || null;
};

const getAdminUserStorageSetting = () => clean(process.env.ADMIN_USER_STORAGE).toLowerCase();

const isRenderEnvironment = () =>
  clean(process.env.RENDER).toLowerCase() === "true" || Boolean(clean(process.env.RENDER_SERVICE_ID));

const getAdminUsersFilePath = () => {
  const configuredPath = clean(process.env.ADMIN_USERS_FILE);
  if (configuredPath) {
    return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(__dirname, configuredPath);
  }

  return isRenderEnvironment() ? RENDER_USERS_FILE : USERS_FILE;
};

const getSupabaseConfig = () => ({
  url: clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
  serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  table: clean(process.env.ADMIN_USER_TABLE || process.env.SUPABASE_ADMIN_USERS_TABLE || "admin_users"),
});

const isAdminStorageModeExplicit = () => Boolean(getAdminUserStorageSetting());

const resolveAdminStorageMode = () => {
  if (adminStorageModeOverride) {
    return adminStorageModeOverride;
  }

  const configuredMode = getAdminUserStorageSetting();
  const supabaseConfig = getSupabaseConfig();

  if (configuredMode && configuredMode !== "file" && configuredMode !== "supabase") {
    throw new AdminAuthError(500, `Unsupported ADMIN_USER_STORAGE value: ${configuredMode}`);
  }

  if (configuredMode === "supabase") {
    ensureSupabaseConfigured();
    return "supabase";
  }

  if (configuredMode === "file") {
    return "file";
  }

  if (supabaseConfig.url && supabaseConfig.serviceRoleKey) {
    return "supabase";
  }

  return "file";
};

const logAdminStorageFallback = (error) => {
  if (adminStorageFallbackLogged) return;
  adminStorageFallbackLogged = true;
  console.warn(
    `Admin user storage fell back to file mode at ${getAdminUsersFilePath()}. ${error?.message || "Supabase admin storage is unavailable."}`
  );
  if (isRenderEnvironment()) {
    console.warn("On Render, attach a persistent disk at /var/data or configure ADMIN_USERS_FILE to a mounted disk path.");
  }
};

const shouldFallbackToFileStorage = (error) => {
  if (isAdminStorageModeExplicit()) return false;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("admin_users") ||
    message.includes("does not exist") ||
    message.includes("42p01") ||
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("permission denied")
  );
};

const withAdminStoreFallback = async (operation) => {
  const mode = resolveAdminStorageMode();
  if (mode === "file") {
    return operation("file");
  }

  try {
    return await operation("supabase");
  } catch (error) {
    if (!shouldFallbackToFileStorage(error)) {
      throw error;
    }

    adminStorageModeOverride = "file";
    logAdminStorageFallback(error);
    return operation("file");
  }
};

const ensureSupabaseConfigured = () => {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new AdminAuthError(
      500,
      "Supabase admin storage is selected, but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }
};

const buildStore = (users = []) => ({
  version: 1,
  users: Array.isArray(users) ? users : [],
});

const readFileStore = async () => {
  const usersFile = getAdminUsersFilePath();
  await fs.mkdir(path.dirname(usersFile), { recursive: true });
  const fileContents = await fs.readFile(usersFile, "utf8");
  const parsed = JSON.parse(fileContents);
  return buildStore(parsed?.users);
};

const writeFileStore = async (store) => {
  const usersFile = getAdminUsersFilePath();
  await fs.mkdir(path.dirname(usersFile), { recursive: true });
  await fs.writeFile(usersFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
};

const mapSupabaseRowToUser = (row) => ({
  id: clean(row.id),
  username: normalizeUsername(row.username),
  displayName: clean(row.display_name || row.displayName || row.username),
  role: normalizeRole(row.role) || "viewer",
  active: row.active !== false,
  createdAt: clean(row.created_at || row.createdAt),
  updatedAt: clean(row.updated_at || row.updatedAt),
  lastLoginAt: clean(row.last_login_at || row.lastLoginAt),
  passwordSalt: clean(row.password_salt || row.passwordSalt),
  passwordHash: clean(row.password_hash || row.passwordHash),
});

const mapUserToSupabaseRow = (user) => ({
  id: user.id,
  username: normalizeUsername(user.username),
  display_name: clean(user.displayName || user.username),
  role: normalizeRole(user.role) || "viewer",
  active: user.active !== false,
  created_at: clean(user.createdAt),
  updated_at: cleanNullable(user.updatedAt),
  last_login_at: cleanNullable(user.lastLoginAt),
  password_salt: clean(user.passwordSalt),
  password_hash: clean(user.passwordHash),
});

const supabaseAdminRequest = async (query, { method = "GET", body, prefer } = {}) => {
  ensureSupabaseConfigured();
  const supabaseConfig = getSupabaseConfig();
  const headers = {
    apikey: supabaseConfig.serviceRoleKey,
    Authorization: `Bearer ${supabaseConfig.serviceRoleKey}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  const endpoint = `${supabaseConfig.url}/rest/v1/${query}`;
  let response;

  try {
    response = await fetch(endpoint, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new AdminAuthError(500, `Could not reach Supabase. ${error?.message || "Network request failed."}`);
  }

  const rawText = await response.text();
  const payload = rawText ? tryParseJson(rawText) : null;

  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error_description || payload.error)) ||
      rawText ||
      "Supabase request failed.";
    throw new AdminAuthError(500, message);
  }

  return payload;
};

const readSupabaseStore = async () => {
  const supabaseConfig = getSupabaseConfig();
  const rows = await supabaseAdminRequest(
    `${encodeURIComponent(supabaseConfig.table)}?select=*&order=created_at.asc`
  );
  const users = Array.isArray(rows) ? rows.map(mapSupabaseRowToUser) : [];
  return buildStore(users);
};

const writeSupabaseStore = async (store) => {
  const users = Array.isArray(store?.users) ? store.users : [];
  if (users.length === 0) {
    return buildStore([]);
  }

  const supabaseConfig = getSupabaseConfig();
  const rows = await supabaseAdminRequest(encodeURIComponent(supabaseConfig.table), {
    method: "POST",
    body: users.map(mapUserToSupabaseRow),
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return buildStore(Array.isArray(rows) ? rows.map(mapSupabaseRowToUser) : users);
};

const readStore = async () => {
  return withAdminStoreFallback((mode) => (mode === "supabase" ? readSupabaseStore() : readFileStore()));
};

const writeStore = async (store) => {
  return withAdminStoreFallback((mode) => (mode === "supabase" ? writeSupabaseStore(store) : writeFileStore(store)));
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

const isAccessManager = (user) => normalizeRole(user?.role) === "access_manager";

const assertCanManageTargetUser = (actorUser, targetUser) => {
  if (!actorUser || !targetUser) return;

  if (isAccessManager(actorUser) && isAccessManager(targetUser) && actorUser.id !== targetUser.id) {
    throw new AdminAuthError(403, "Access managers cannot edit other access manager accounts.");
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

const tryReadLegacyFileStore = async () => {
  try {
    return await readFileStore();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return buildStore([]);
    }
    throw error;
  }
};

const maybeMigrateFileUsersToSupabase = async ({ logger = console } = {}) => {
  if (resolveAdminStorageMode() !== "supabase") {
    return false;
  }

  let store;
  try {
    store = await readSupabaseStore();
  } catch (error) {
    if (!shouldFallbackToFileStorage(error)) {
      throw error;
    }

    adminStorageModeOverride = "file";
    logAdminStorageFallback(error);
    return false;
  }

  if (store.users.length) {
    return false;
  }

  const legacyStore = await tryReadLegacyFileStore();
  if (!legacyStore.users.length) {
    return false;
  }

  await writeSupabaseStore(legacyStore);
  logger.log(`Migrated ${legacyStore.users.length} admin user(s) from file storage to Supabase.`);
  return true;
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

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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

export const getAdminUserStorageDetails = () => {
  const supabaseConfig = getSupabaseConfig();
  const mode = resolveAdminStorageMode();
  return {
    mode,
    usersFile: getAdminUsersFilePath(),
    table: supabaseConfig.table,
    usingSupabase: mode === "supabase",
  };
};

export const getSessionTokenFromRequest = (req) => {
  const headerValue = String(req?.headers?.authorization || "");
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
};

export const ensureAdminUserStore = async ({ logger = console } = {}) => {
  if (resolveAdminStorageMode() === "supabase") {
    await maybeMigrateFileUsersToSupabase({ logger });
  }

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
  return sortUsersByRoleAndName(getVisibleUsersForActor(store.users, actorUser)).map(sanitizeUser);
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
  assertCanManageTargetUser(actorUser, user);
  assertCanManageRole(actorUser, user.role);
  assertCanManageRole(actorUser, nextRole);

  if (actorUser?.id === userId && nextActive === false) {
    throw new AdminAuthError(400, "You cannot deactivate your own account.");
  }

  if (store.users.some((entry) => entry.id !== userId && entry.username === nextUsername)) {
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

export const changeOwnPassword = async ({ userId, currentPassword, newPassword }) => {
  if (!userId) {
    throw new AdminAuthError(400, "User id is required.");
  }

  if (!String(currentPassword || "")) {
    throw new AdminAuthError(400, "Current password is required.");
  }

  assertValidPassword(newPassword);

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new AdminAuthError(404, "Admin user not found.");
  }

  if (user.active === false) {
    throw new AdminAuthError(403, "This account has been deactivated.");
  }

  if (!(await verifyPassword(user, currentPassword))) {
    throw new AdminAuthError(401, "Current password is incorrect.");
  }

  const passwordRecord = await createPasswordRecord(newPassword);
  user.passwordHash = passwordRecord.passwordHash;
  user.passwordSalt = passwordRecord.passwordSalt;
  user.updatedAt = new Date().toISOString();

  await writeStore(store);
  return sanitizeUser(user);
};

export const resetUserPassword = async (userId, actorUser = null) => {
  if (!userId) {
    throw new AdminAuthError(400, "User id is required.");
  }

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new AdminAuthError(404, "Admin user not found.");
  }

  assertCanManageTargetUser(actorUser, user);
  assertCanManageRole(actorUser, user.role);

  const temporaryPassword = generateBootstrapPassword();
  const passwordRecord = await createPasswordRecord(temporaryPassword);
  user.passwordHash = passwordRecord.passwordHash;
  user.passwordSalt = passwordRecord.passwordSalt;
  user.updatedAt = new Date().toISOString();

  await writeStore(store);

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
};
