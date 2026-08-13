import { db } from './firebase-config.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const tbody = document.getElementById('bookingsBody');
const metaEl = document.getElementById('meta');

let latestSlots = [];

// Only render links that are safe http(s) URLs
function safeLink(url) {
    return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
}

// RFC 4180-style escaping, plus a guard that neutralizes spreadsheet
// formulas (=, +, -, @) to prevent CSV formula injection.
function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function render(slots) {
    latestSlots = slots;

    // Sort by date, then start time
    slots.sort((a, b) => {
        const keyA = (a.booking_date || '') + ' ' + (a.start_time || '');
        const keyB = (b.booking_date || '') + ' ' + (b.start_time || '');
        return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });

    if (slots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#6b7280; padding:16px;">No bookings yet.</td></tr>';
        metaEl.textContent = '';
        return;
    }

    tbody.innerHTML = '';
    slots.forEach(s => {
        const slideUrl = safeLink(s.slide_link);
        const slideCell = slideUrl
            ? `<a href="${slideUrl}" target="_blank" rel="noopener">View</a>`
            : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(s.booking_date)}</td>
            <td>${(s.start_time || '').substring(0, 5)}</td>
            <td>${s.duration_minutes}m</td>
            <td>${s.user_name || ''}</td>
            <td class="topic">${s.topic || ''}</td>
            <td>${slideCell}</td>
        `;
        tbody.appendChild(tr);
    });

    metaEl.textContent = `${slots.length} booking${slots.length === 1 ? '' : 's'} • updates automatically`;
}

// Download the current bookings as a CSV file (generated entirely in the browser)
function downloadCsv() {
    const headers = ['Date', 'Start Time', 'Duration (min)', 'Name / Department', 'Topic', 'Slide Link'];
    const rows = latestSlots.map(s => [
        s.booking_date || '',
        (s.start_time || '').substring(0, 5),
        s.duration_minutes ?? '',
        s.user_name || '',
        s.topic || '',
        s.slide_link || ''
    ]);

    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');

    // UTF-8 BOM so Excel / Google Sheets detect the encoding correctly
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookings.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('downloadCsv').addEventListener('click', downloadCsv);

// Live subscription — the table refreshes itself whenever a booking changes
onSnapshot(collection(db, 'bookings'), (snapshot) => {
    const slots = [];
    snapshot.forEach(doc => slots.push(doc.data()));
    render(slots);
}, (error) => {
    console.error('Failed to load bookings:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="error" style="padding:12px;">Error loading bookings: ${error.message}</td></tr>`;
    metaEl.textContent = '';
});
