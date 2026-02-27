# Backend (Booking API)

This folder is the backend for the `ChatGPT/` website frontend.

## What it does right now

- `POST /api/bookings` validates and saves booking requests
- `GET /health` health check endpoint
- Stores demo bookings in `ChatGPT/backend/data/bookings.jsonl`

## Run locally

1. Copy `.env.example` to `.env`
2. Install packages: `npm install`
3. Start server: `npm run dev`

Server runs on `http://localhost:3000` by default.

## Where this fits in the project

- Frontend pages: `ChatGPT/index.html`, `ChatGPT/booking.html`
- Backend API: `ChatGPT/backend/src/server.js`

## Next upgrades (for production)

- Send email notifications to shop owner
- Add rate limiting and IP throttling
- Add CAPTCHA / Turnstile
- Store bookings in SQLite/Postgres
- Add admin dashboard or CRM integration
