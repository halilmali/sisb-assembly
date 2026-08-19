# SISB Morning Assembly Booking (Firebase)

A morning-assembly slot booking app for Mondays, Wednesdays & Thursdays. Each day has its
own schedule: Monday 2:35 PM (10-minute capacity), Wednesday 2:45 PM (1-hour capacity),
Thursday 7:10 AM (20-minute capacity). Bookings are taken in 5-minute parts up to each
day's capacity. This version runs entirely on Firebase — no PHP/MySQL server required.

## Stack

| Old (PHP/MySQL) | New (Firebase) |
| --- | --- |
| `api/bookings.php` + `api/config.php` | Cloud Firestore (`bookings` + `days` collections) |
| Google Identity Services (raw GSI) | Firebase Authentication (Google provider) |
| Apache/Nginx + MySQL | Firebase Hosting (static files) |

## Data model

- **`bookings/{autoId}`** — one document per booking:
  `user_name`, `email`, `google_id` (uid), `booking_date` (`YYYY-MM-DD`),
  `start_time` (`HH:MM`), `duration_minutes`, `topic`, `slide_link`,
  `gc_post` (bool — set when the booking should also be posted to Google
  Classroom), `created_at`
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

## Download bookings as CSV (no server needed)

The bookings table page has a **Download CSV** button that generates `bookings.csv`
in the browser from the live data — same columns as the table, no Cloud Functions
or backend required:

- Locally: http://localhost:8080/bookings-table.html
- Deployed: `https://assembly-62eac.web.app/bookings-table.html`

Open the page and click **Download CSV**; Excel/Google Sheets read the file directly
(it includes a UTF-8 BOM and quotes fields as needed).

### Auto-import into Google Sheets (no Cloud Functions)

A live CSV URL isn't possible without a server, but Google Sheets can pull the
bookings straight from Firestore's **public REST API** (the security rules already
allow read for everyone, and the web API key is meant for public clients). In your
sheet: **Extensions → Apps Script**, paste the script below, run `refreshBookings`
(authorize once).

**Usage:** select the cell where you want the table to start (e.g. `A1`), then run
`refreshBookings`. The bookings are written starting at that cell — only the block
of cells the table covers is overwritten; nothing else on the sheet is touched.
Re-run to refresh.

```js
function refreshBookings() {
  try {
    var apiKey = 'AIzaSyAru4C44JXxdrdslZRAaabcP_94bsNhJbs';
    var url = 'https://firestore.googleapis.com/v1/projects/assembly-62eac/databases/(default)/documents/bookings?key=' + apiKey;
    var data = JSON.parse(UrlFetchApp.fetch(url).getContentText());

    // Build the table: headers + one row per booking, sorted by date then time
    var headers = ['Date', 'Start Time', 'Duration (min)', 'Name / Department', 'Topic', 'Slide Link'];
    var rows = [];
    (data.documents || []).forEach(function (doc) {
      var f = doc.fields || {};
      function val(k) { return f[k] ? (f[k].stringValue || f[k].integerValue || '') : ''; }
      rows.push([val('booking_date'), val('start_time'), val('duration_minutes'), val('user_name'), val('topic'), val('slide_link')]);
    });
    rows.sort(function (a, b) {
      var ka = (a[0] || '') + ' ' + (a[1] || '');
      var kb = (b[0] || '') + ' ' + (b[1] || '');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    rows.unshift(headers);

    // Write starting at the selected cell; only this block is touched
    var sheet = SpreadsheetApp.getActiveSheet();
    var cell = sheet.getActiveCell();
    var numRows = rows.length;
    var numCols = rows[0].length;
    sheet.getRange(cell.getRow(), cell.getColumn(), numRows, numCols).setValues(rows);
  } catch (err) {
    SpreadsheetApp.getUi().alert('Failed to write bookings: ' + err.message);
  }
}
```

If a previous export was longer than the current one, the leftover cells below the
new table keep their old values — select and clear those manually if needed.

Note: if you've applied referrer restrictions to the API key, Apps Script requests
carry no referrer — remove those restrictions for this key (or create a separate
unrestricted key) for the fetch to work.

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

## Editing bookings

Signed-in users can **edit their own bookings** (name, topic, slide link,
duration, and the GC Post checkbox) by clicking the pencil icon next to a
booking in the sidebar or in the day's modal. The edit runs in a transaction that shifts the day's capacity
counter by the duration change, so the 20-minute cap is preserved (e.g.
shrinking a 10 → 5 min booking frees 5 minutes for someone else). The booking
date, owner, and start time can't be changed.

Admins (`admin1@example.com`, `admin2@example.com`) can edit **any**
booking and see a delete button next to each one. The admin list lives in two
places — keep them in sync:

- `app.js` → `ADMIN_EMAILS`
- `firestore.rules` → `isAdmin()` function

## Notes & limitations

- Firestore rules enforce sign-in, duration validity, and admin-only deletes,
  but rules **cannot** verify the 20-minute cap (no cross-document sums in rules).
  The cap is enforced by the client-side transactions and client validation.
- The old PHP API (`api/`) was removed — `api/config.php` contained a plaintext
  database password and would have been publicly served by Firebase Hosting.
- Bookings can be edited by their owner (or an admin) and removed only by an
  admin; the capacity counter is kept in sync by the app's transactions.
