# SL Auto Admin Web App

This folder contains a standalone browser version of the Swift booking admin app.
It also includes a small local server so the web UI and booking API can run together from this folder.

## Files

- `index.html`: app shell
- `styles.css`: UI styling
- `app.js`: booking state, API calls, rendering, and actions
- `server.mjs`: local web server plus booking API routes
- `package.json`: start scripts

## How to use it

1. Open a terminal in `/Users/ramzi/Desktop/New Coding/My Projects/SL-Auto-Inc-Website/ChatGPT/Web_Admin_App`.
2. If you want the admin app to read the same live bookings as the website, create either:
   - `ChatGPT/Web_Admin_App/.env`, or
   - `ChatGPT/backend/.env`
3. Add these values to that `.env` file:
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
   - `SUPABASE_TABLE=bookings`
4. Run the SQL in `ChatGPT/backend/supabase/schema.sql` in Supabase so both `bookings` and `admin_users` exist.
5. Run `npm start`.
6. On the first run, the server bootstraps a head admin account and prints the username/password once.
7. Open the printed URL, usually `http://localhost:4310`.
8. On iPhone, use the LAN URL printed by the server, for example `http://192.168.1.231:4310`.

At startup the server now prints whether bookings are being loaded from `Supabase` or from the local demo file.

## Admin access roles

- `head`: full booking control plus user management
- `access_manager`: booking control plus staff access management, except for head admin accounts
- `manager`: full booking control
- `viewer`: read-only booking access after login

All booking reads and admin mutations now require login. The public `POST /api/bookings` route remains open so website booking requests can still be submitted.

## Bootstrap credentials

- Optional env vars before the first run:
  - `ADMIN_BOOTSTRAP_USERNAME`
  - `ADMIN_BOOTSTRAP_PASSWORD`
  - `ADMIN_BOOTSTRAP_NAME`
  - `ADMIN_USER_STORAGE` (`supabase` or `file`)
  - `ADMIN_USER_TABLE` (defaults to `admin_users`)
- If you do not set them, the app generates a temporary head password and prints it once during startup.
- Admin passwords must be at least 6 characters long.
- When Supabase is configured, staff accounts are stored in `public.admin_users` and survive redeploys.
- Without Supabase admin storage, staff accounts fall back to `data/admin-users.json`.
- If Supabase admin storage is empty and the local file already has users, the app migrates those users into Supabase on startup.

## Supported actions

- Load all bookings
- Accept or reject pending bookings
- Archive accepted or rejected bookings
- Restore archived bookings
- Permanently delete archived bookings
- Review customer, vehicle, and concern details in the side panel

## Important

Do not use the VS Code preview server on port `3000` as the backend URL. That preview server is not the booking API.
