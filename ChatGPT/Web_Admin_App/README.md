# SL Auto Admin Web App

This folder contains a standalone browser version of the Swift booking admin app.

## Files

- `index.html`: app shell
- `styles.css`: UI styling
- `app.js`: booking state, API calls, rendering, and actions

## How to use it

1. Start the booking API from `/Users/ramzi/Desktop/New Coding/My Projects/SL-Auto-Inc-Website/ChatGPT/backend`.
2. Open `/Users/ramzi/Desktop/New Coding/My Projects/SL-Auto-Inc-Website/ChatGPT/Web_Admin_App/index.html` directly, or use the backend-served URL:
   `http://localhost:3000/Web_Admin_App/`
3. If the API is not at `http://localhost:3000`, change the backend URL in the app and reload.

## Supported actions

- Load all bookings
- Accept or reject pending bookings
- Archive accepted or rejected bookings
- Restore archived bookings
- Permanently delete archived bookings
- Review customer, vehicle, and concern details in the side panel
