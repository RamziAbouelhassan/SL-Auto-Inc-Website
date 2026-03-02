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
2. Run `npm start`.
3. Open the printed URL, usually `http://localhost:4310`.
4. On iPhone, use the LAN URL printed by the server, for example `http://192.168.1.231:4310`.

## Supported actions

- Load all bookings
- Accept or reject pending bookings
- Archive accepted or rejected bookings
- Restore archived bookings
- Permanently delete archived bookings
- Review customer, vehicle, and concern details in the side panel

## Important

Do not use the VS Code preview server on port `3000` as the backend URL. That preview server is not the booking API.
