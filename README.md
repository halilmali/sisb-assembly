# SISB Morning Assembly Booking (Firebase)

A morning-assembly slot booking app for Tuesdays & Thursdays (07:10–07:30 AM, 20-minute
daily capacity). This version runs entirely on Firebase — no PHP/MySQL server required.

## Stack

| Old (PHP/MySQL) | New (Firebase) |
| --- | --- |
| `api/bookings.php` + `api/config.php` | Cloud Firestore (`bookings` + `days` collections) |
| Google Identity Services (raw GSI) | Firebase Authentication (Google provider) |
| Apache/Nginx + MySQL | Firebase Hosting (static files) |

## Data model

- **`bookings/{autoId}`** — one document per booking:
  `user_name`, `email`, `google_id` (uid), `booking_date` (`YYYY-MM-DD`),
  `start_time` (`HH:MM`), `duration_minutes`, `topic`, `slide_link`, `created_at`
- **`days/{YYYY-MM-DD}`** — per-day capacity counter: `booked_minutes`.
  It is only mutated inside the booking/delete **transactions** in `app.js`,
  which atomically enforce the 20-minute daily cap (prevents double-booking).

The calendar and sidebar update in real time via `onSnapshot` — no polling,
no manual refresh.

## Run locally

The app uses ES modules, so **don't open `index.html` by double-clicking it** —
browsers block module scripts from `file://` (that's why the calendar and sign-in
button appear dead). Serve the folder over HTTP instead:

```bash
npm start        # zero-dependency static server (node server.js)
# then open http://localhost:8080
```

Or use any static server you already have: `python -m http.server 8080`,
XAMPP's Apache (`http://localhost/<folder>/`), or the Firebase CLI:
`firebase serve`.

`localhost` is automatically an authorized domain for Firebase Auth, so
sign-in works immediately from local testing.

## Bookings table page

`bookings-table.html` is a separate, read-only page that shows **all** bookings as
a plain table (Date, Start, Duration, Name/Department, Topic, Slide Link). It has
no sign-in, no app chrome, and updates automatically as bookings change — designed
for embedding:

- **Locally:** http://localhost:8080/bookings-table.html
- **Deployed:** `https://assembly-62eac.web.app/bookings-table.html`

### Embed in Google Sheets

Google Sheets can't render an external URL in a cell, but Apps Script can show it
in a dialog. In the sheet: **Extensions → Apps Script**, paste, then run
`showBookings` (authorize when prompted):

```js
function showBookings() {
  const html = HtmlService.createHtmlOutput(
    '<iframe src="https://assembly-62eac.web.app/bookings-table.html" ' +
    'style="width:100%;height:500px;border:0;"></iframe>'
  )
    .setTitle('Morning Assembly Bookings')
    .setWidth(900)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Morning Assembly Bookings');
}
```

It can also be embedded by URL in a Google Sites page (Insert → Embed → By URL),
or linked directly from any cell.

## Setup (one-time, in the Firebase console)

1. Open [Firebase console](https://console.firebase.google.com) → project
   **assembly-62eac**.
2. **Authentication → Sign-in method → Google** → enable it (this is what replaced
   the old Google Identity Services button).
3. **Firestore Database → Create database** (choose production mode; pick any region).
4. Copy the web app config into `firebase-config.js` if it ever changes
   (it's already filled in with this project's values).

## Deploy

Requires the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login

# First time only — link this folder to the project:
firebase use --add   # pick assembly-62eac

# Deploy security rules + static site:
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

The site is served from the project root (`"public": "."` in `firebase.json`).

## Admin accounts

Admins (`admin1@example.com`, `admin2@example.com`) see a delete button
next to each booking. The list lives in two places — keep them in sync:

- `app.js` → `ADMIN_EMAILS`
- `firestore.rules` → `isAdmin()` function

## Notes & limitations

- Firestore rules enforce sign-in, duration validity, and admin-only deletes,
  but rules **cannot** verify the 20-minute cap (no cross-document sums in rules).
  The cap is enforced by the client-side transactions and client validation.
- The old PHP API (`api/`) was removed — `api/config.php` contained a plaintext
  database password and would have been publicly served by Firebase Hosting.
- Bookings are one-way: once created they can only be removed by an admin.
