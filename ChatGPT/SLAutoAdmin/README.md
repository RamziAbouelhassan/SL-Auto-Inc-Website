# SL Auto Admin iPhone App (Xcode)

This is a simple iPhone admin app to view booking requests from the website backend.

## Open in Xcode

Open:

- `ChatGPT/SLAutoAdmin/SLAutoAdmin.xcodeproj`

## What it does

- Lists bookings from `GET /api/bookings`
- Tap a booking to view customer, vehicle, service, and issue details
- Lets you change the API URL inside the app (useful for local testing vs deployed backend)

## Backend required

Run the backend in:

- `ChatGPT/backend`

Endpoints used:

- `GET /api/bookings`
- `POST /api/bookings` (website form)

## Local testing on iPhone

`localhost` on an iPhone points to the phone itself, not your Mac.

Use your Mac's local network IP in the app, for example:

- `http://192.168.1.10:3000`

Make sure your phone and Mac are on the same Wi-Fi.
