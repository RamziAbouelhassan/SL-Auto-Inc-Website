# Backend (Booking API)

This folder is the backend for the `ChatGPT/` website frontend.

## What it does now

- `POST /api/bookings` validates and saves booking requests
- `GET /health` health check endpoint
- `GET /api/booking-availability` returns date counts for the public booking calendar

Admin reads, auth, and booking mutations now live in `ChatGPT/Web_Admin_App/server.mjs`.

The booking logic now has two runtime shapes:

- Local Express server in `ChatGPT/backend/src/server.js`
- Standalone admin server in `ChatGPT/Web_Admin_App/server.mjs`

## Run locally

1. Copy `.env.example` to `.env`
2. Install packages: `npm install`
3. Start server: `npm run dev`

The backend now serves the ChatGPT website pages directly.

- On the same computer: open `http://localhost:3000`
- On another phone, tablet, or laptop on the same Wi-Fi: open `http://<your-computer-ip>:3000`

By default the server binds to `0.0.0.0` so it is reachable on your local network.

## Netlify production setup

This repo now includes `netlify.toml` so Netlify can:

- publish the static frontend from `ChatGPT/`
- serve the booking API through Netlify Functions
- keep the same `/api/...` and `/health` URLs

### Storage

There are two booking storage modes:

- Local demo mode: file storage in `ChatGPT/backend/data/bookings.jsonl`
- Production Netlify mode: Supabase via `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

Production Netlify deploys intentionally reject file storage so bookings are not written to an ephemeral filesystem.

### Supabase

1. Create a Supabase project
2. Run the SQL in `ChatGPT/backend/supabase/schema.sql`
3. Add these Netlify environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_TABLE=bookings`
4. Optional: set `CORS_ORIGIN` to your production site URL

After that, the public booking routes work without changing the frontend form, and the admin app can use the same
Supabase-backed booking records from its own server.

## Where this fits in the project

- Frontend pages: `ChatGPT/index.html`, `ChatGPT/booking.html`
- Shared booking logic: `ChatGPT/backend/src/lib/booking-service.mjs`
- Public Express API: `ChatGPT/backend/src/server.js`
- Admin web app + API: `ChatGPT/Web_Admin_App/server.mjs`

## Next upgrades (for production)

- Send email notifications to shop owner
- Add rate limiting and bot protection
- Add CAPTCHA / Turnstile
- Add authentication around admin actions
- Add admin dashboard or CRM integration
