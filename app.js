import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { collection, query, where, onSnapshot, doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const ADMIN_EMAILS = ['admin1@example.com', 'admin2@example.com'];
const MAX_MINUTES = 20; // Total assembly capacity per day
const BASE_TIME = { hours: 7, minutes: 10 }; // First slot starts at 07:10 AM

let currentDate = new Date();
let bookingsCache = {};
let currentUser = null;
let unsubscribeBookings = null;
let editingBookingId = null; // set while the modal is editing an existing booking

// DOM Elements
const calendarGrid = document.getElementById('calendarGrid');
const allBookingsList = document.getElementById('allBookingsList');
const currentMonthDisplay = document.getElementById('currentMonthDisplay');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const bookingModal = document.getElementById('bookingModal');
const closeModalBtn = document.querySelector('.close-modal');
const bookingForm = document.getElementById('bookingForm');
const formFeedback = document.getElementById('formFeedback');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfoDiv = document.getElementById('userInfo');
const userEmailEl = document.getElementById('userEmail');
const userNameInput = document.getElementById('userName');

// Modal Elements
const modalDateTitle = document.getElementById('modalDateTitle');
const remainingTimeEl = document.getElementById('remainingTime');
const selectedDateInput = document.getElementById('selectedDate');
const bookingListEl = document.getElementById('bookingList');
const durationSelect = document.getElementById('duration');
const circleChart = document.querySelector('.circle');
const percentageText = document.querySelector('.percentage');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    subscribeToBookings();
});

prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
    subscribeToBookings();
});

nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
    subscribeToBookings();
});

closeModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target == bookingModal) closeModal();
});

bookingForm.addEventListener('submit', handleBookingSubmit);

function closeModal() {
    bookingModal.style.display = 'none';
}

// ============ Firebase Auth (Google Sign-In) ============

googleSignInBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
        if (err.code === 'auth/popup-blocked') {
            alert('Popup blocked. Please allow popups for this site and try again.');
        } else if (err.code === 'auth/popup-closed-by-user') {
            // User closed the popup — no action needed
        } else {
            console.error('Sign-in error:', err);
            alert('Sign-in failed: ' + err.message);
        }
    }
});

signOutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (err) {
        console.error('Sign-out error:', err);
    }
});

onAuthStateChanged(auth, (user) => {
    const signedIn = !!user;

    currentUser = signedIn
        ? { email: user.email, name: user.displayName, picture: user.photoURL, google_id: user.uid }
        : null;

    googleSignInBtn.style.display = signedIn ? 'none' : 'flex';
    userInfoDiv.style.display = signedIn ? 'block' : 'none';

    if (signedIn) {
        const isAdmin = ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
        console.log(`Login: ${currentUser.email}, Is Admin: ${isAdmin}`);
        userEmailEl.innerHTML = `Signed in as: ${currentUser.email} ${isAdmin ? '<b style="color:var(--accent-color)">(Admin)</b>' : ''}`;
        userNameInput.value = currentUser.name; // Auto-fill form
    } else {
        userNameInput.value = '';
    }

    renderSidebarList(); // Refresh list to show delete buttons if admin
});

// ============ Firestore (Bookings) ============

function getMonthRange() {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    // ISO date strings compare correctly, so the range works for any month length
    return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-31`
    };
}

// Live subscription — the calendar & sidebar update automatically on any change
function subscribeToBookings() {
    if (unsubscribeBookings) unsubscribeBookings();

    const { start, end } = getMonthRange();
    const q = query(
        collection(db, 'bookings'),
        where('booking_date', '>=', start),
        where('booking_date', '<=', end)
    );

    unsubscribeBookings = onSnapshot(q, (snapshot) => {
        bookingsCache = {};
        snapshot.forEach((docSnap) => {
            const b = docSnap.data();
            if (!bookingsCache[b.booking_date]) {
                bookingsCache[b.booking_date] = { total_booked: 0, slots: [] };
            }
            bookingsCache[b.booking_date].total_booked += b.duration_minutes;
            bookingsCache[b.booking_date].slots.push({ ...b, id: docSnap.id });
        });
        updateCalendarStatus();
    }, (error) => {
        console.error('Failed to load bookings:', error);
        allBookingsList.innerHTML = `<li style="color:red; padding:1rem;">Error: ${error.message}</li>`;
    });
}

// Render Calendar
function renderCalendar() {
    calendarGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthDisplay.textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('day', 'disabled');
        calendarGrid.appendChild(emptyCell);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayOfWeek = dateObj.getDay(); // 0Sun, 1Mon, 2Tue, 3Wed, 4Thu, 5Fri, 6Sat
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayEl = document.createElement('div');
        dayEl.classList.add('day');
        dayEl.dataset.date = dateStr;

        dayEl.innerHTML = `<span class="day-number">${day}</span>`;

        // Tuesday (2) or Thursday (4) Check
        if (dayOfWeek === 2 || dayOfWeek === 4) {
            dayEl.classList.add('active-day');
            dayEl.addEventListener('click', () => openModal(dateStr));

            // Status placeholder (will be filled by updateCalendarStatus)
            const statusEl = document.createElement('div');
            statusEl.classList.add('day-status');
            statusEl.textContent = 'Free';
            dayEl.appendChild(statusEl);
        } else {
            dayEl.classList.add('disabled');
        }

        if (dateStr === todayStr) {
            dayEl.classList.add('today');
        }

        calendarGrid.appendChild(dayEl);
    }
}

// Update Calendar Status based on Cache
function updateCalendarStatus() {
    const days = document.querySelectorAll('.day.active-day');
    days.forEach(dayEl => {
        const date = dayEl.dataset.date;
        const statusEl = dayEl.querySelector('.day-status');

        if (bookingsCache[date]) {
            const used = bookingsCache[date].total_booked;
            const remaining = MAX_MINUTES - used;

            if (remaining === 0) {
                statusEl.innerHTML = '<i class="fa-solid fa-lock"></i> Full';
                dayEl.classList.add('full');
            } else {
                statusEl.innerHTML = `${remaining}m left`;
                dayEl.classList.remove('full');
            }
        } else {
            statusEl.innerHTML = '20m left';
            dayEl.classList.remove('full');
        }
    });

    renderSidebarList();
}

function renderSidebarList() {
    try {
        allBookingsList.innerHTML = '';

        // Flatten bookings from cache
        let allBookingsFragment = [];
        Object.keys(bookingsCache).forEach(date => {
            if (bookingsCache[date].slots) {
                bookingsCache[date].slots.forEach(slot => {
                    allBookingsFragment.push(slot);
                });
            }
        });

        // Sort by date and time
        allBookingsFragment.sort((a, b) => {
            const dateA = new Date(a.booking_date + 'T' + a.start_time);
            const dateB = new Date(b.booking_date + 'T' + b.start_time);
            return dateA - dateB;
        });

        if (allBookingsFragment.length === 0) {
            allBookingsList.innerHTML = '<li style="text-align:center; padding:1rem; color:var(--text-muted)">No bookings this month</li>';
            return;
        }

        allBookingsFragment.forEach(booking => {
            const dateObj = new Date(booking.booking_date);
            const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = booking.start_time.substring(0, 5);

            const li = document.createElement('li');

            // Owners (and admins) get an edit button; admins also get delete.
            let actions = '';
            const isOwner = currentUser && booking.email && currentUser.email.toLowerCase() === booking.email.toLowerCase();
            const isAdmin = currentUser && ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
            if (isOwner || isAdmin) {
                actions += `<button onclick="window.editBooking('${booking.id}')" title="Edit Booking" style="background:none; border:none; color:var(--secondary); cursor:pointer; padding:4px;"><i class="fa-solid fa-pen"></i></button>`;
            }
            if (isAdmin) {
                actions += `<button onclick="window.deleteBooking('${booking.id}')" title="Delete Booking" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:4px;"><i class="fa-solid fa-trash"></i></button>`;
            }
            if (actions) {
                actions = `<div style="display:flex; gap:2px; margin-left:auto;">${actions}</div>`;
            }

            li.innerHTML = `
            <div style="display:flex; flex-direction:column; width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="booking-item-date"><i class="fa-regular fa-clock"></i> ${dateStr}</div>
                    ${actions}
                </div>
                <div class="booking-item-name">${booking.user_name}</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.2rem;">${booking.topic || ''}</div>
                ${safeSlideLink(booking.slide_link) ? `<div style="font-size:0.85rem; margin-bottom:0.2rem;"><a href="${safeSlideLink(booking.slide_link)}" target="_blank" rel="noopener" style="color:var(--secondary); text-decoration:none;"><i class="fa-solid fa-link"></i> Slide Link</a></div>` : ''}
                <span class="booking-item-time">${timeStr} (${booking.duration_minutes}m)</span>
                ${booking.gc_post ? '<div style="margin-top:0.25rem;"><span class="gc-post-badge"><i class="fa-solid fa-chalkboard"></i> GC Post</span></div>' : ''}
            </div>
        `;
            allBookingsList.appendChild(li);
        });
    } catch (err) {
        console.error("Render Error:", err);
        allBookingsList.innerHTML += `<li style="color:red">Render Error: ${err.message}</li>`;
    }
}

// Global Delete Function for Admins (transaction keeps the daily counter in sync)
window.deleteBooking = async function (id) {
    if (!currentUser) return;
    if (!ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
        alert('Unauthorized: Admins only');
        return;
    }
    if (!confirm('Are you sure you want to delete this booking?')) return;

    const bookingRef = doc(db, 'bookings', id);

    try {
        await runTransaction(db, async (transaction) => {
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists()) return; // Already deleted

            const b = bookingDoc.data();
            const dayRef = doc(db, 'days', b.booking_date);
            const dayDoc = await transaction.get(dayRef);
            const current = dayDoc.exists() ? (dayDoc.data().booked_minutes || 0) : 0;

            transaction.set(dayRef, { booked_minutes: Math.max(0, current - b.duration_minutes) }, { merge: true });
            transaction.delete(bookingRef);
        });
        // Calendar & sidebar refresh automatically via onSnapshot
    } catch (e) {
        console.error(e);
        alert('Failed to delete: ' + e.message);
    }
};

// Global Edit Function — owners (and admins) can edit a booking.
// Opens the modal pre-filled with the booking's data; saving runs a
// transaction that adjusts the day's capacity by the duration change.
window.editBooking = function (id) {
    if (!currentUser) {
        alert('Please sign in to edit bookings.');
        return;
    }

    // Find the booking in the cache
    let booking = null;
    Object.keys(bookingsCache).forEach(date => {
        bookingsCache[date].slots.forEach(slot => {
            if (slot.id === id) booking = slot;
        });
    });
    if (!booking) return;

    const isOwner = booking.email && currentUser.email.toLowerCase() === booking.email.toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    if (!isOwner && !isAdmin) {
        alert('You can only edit your own bookings.');
        return;
    }

    openModal(booking.booking_date, booking);
};

function openModal(dateStr, editBooking = null) {
    const dateObj = new Date(dateStr);
    modalDateTitle.textContent = `Booking for ${dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
    selectedDateInput.value = dateStr;
    bookingModal.style.display = 'flex'; // Show the modal!

    // Ensure cache entry exists
    const dayData = bookingsCache[dateStr] || { total_booked: 0, slots: [] };
    const remaining = MAX_MINUTES - dayData.total_booked;

    remainingTimeEl.textContent = `${remaining} mins`;

    // Update Chart
    const percent = (remaining / MAX_MINUTES) * 100;
    const dashArray = `${percent}, 100`;
    circleChart.setAttribute('stroke-dasharray', dashArray);
    percentageText.textContent = `${remaining}m`;

    // When editing, the user's own minutes are already counted in `remaining`,
    // so they can grow back into them — cap options at old duration + remaining.
    const editAllowance = editBooking ? editBooking.duration_minutes : 0;
    Array.from(durationSelect.options).forEach(opt => {
        if (opt.value) {
            opt.disabled = parseInt(opt.value) > remaining + editAllowance;
        }
    });

    formFeedback.textContent = '';
    formFeedback.className = 'feedback';

    if (editBooking) {
        // Edit mode: pre-fill the form with the booking's current values.
        editingBookingId = editBooking.id;
        userNameInput.value = editBooking.user_name || '';
        document.getElementById('topic').value = editBooking.topic || '';
        document.getElementById('slideLink').value = editBooking.slide_link || '';
        document.getElementById('gcPost').checked = !!editBooking.gc_post;
        durationSelect.value = String(editBooking.duration_minutes);
        bookingForm.querySelector('button').disabled = false;
        bookingForm.querySelector('button').textContent = 'Save Changes';
    } else {
        // New booking mode: reset the form.
        editingBookingId = null;
        bookingForm.reset();
        selectedDateInput.value = dateStr;

        if (currentUser) {
            userNameInput.value = currentUser.name;
        }

        if (remaining === 0) {
            // Disable form if full
            bookingForm.querySelector('button').disabled = true;
            bookingForm.querySelector('button').textContent = "Fully Booked";
            formFeedback.textContent = "No slots available for this day.";
            formFeedback.classList.add('error');
        } else {
            bookingForm.querySelector('button').disabled = false;
            bookingForm.querySelector('button').textContent = "Confirm Booking";
        }
    }

    // List Existing (owners/admins get an edit button on their bookings)
    bookingListEl.innerHTML = '';
    if (dayData.slots.length > 0) {
        dayData.slots.forEach(slot => {
            const li = document.createElement('li');
            const startTime = slot.start_time.substring(0, 5);
            const isOwner = currentUser && slot.email && currentUser.email.toLowerCase() === slot.email.toLowerCase();
            const isAdmin = currentUser && ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
            let editBtn = '';
            if (isOwner || isAdmin) {
                editBtn = `<button onclick="window.editBooking('${slot.id}')" title="Edit Booking" style="background:none; border:none; color:var(--secondary); cursor:pointer; padding:4px;"><i class="fa-solid fa-pen"></i></button>`;
            }
            li.innerHTML = `
                <div>${slot.user_name}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${slot.topic || ''}</div>
                ${safeSlideLink(slot.slide_link) ? `<div style="font-size:0.8rem;"><a href="${safeSlideLink(slot.slide_link)}" target="_blank" rel="noopener" style="color:var(--secondary); text-decoration:none;"><i class="fa-solid fa-link"></i> Slide Link</a></div>` : ''}
                <div class="time">${startTime} (${slot.duration_minutes}m)</div>
                ${slot.gc_post ? '<span class="gc-post-badge"><i class="fa-solid fa-chalkboard"></i> GC Post</span>' : ''}
                ${editBtn}
            `;
            bookingListEl.appendChild(li);
        });
    }
}

// Only render links that are safe http(s) URLs
function safeSlideLink(url) {
    return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
}

// Compute start time: 07:10 AM + minutes already booked for that day
function calcStartTime(totalUsedMinutes) {
    const base = new Date(1970, 0, 1, BASE_TIME.hours, BASE_TIME.minutes, 0);
    base.setMinutes(base.getMinutes() + totalUsedMinutes);
    return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
}

async function handleBookingSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        formFeedback.textContent = 'Please Sign In with Google to book a slot.';
        formFeedback.className = 'feedback error';
        return;
    }

    const submitBtn = bookingForm.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    formFeedback.textContent = '';

    // Editing an existing booking follows a different (transactional) path
    if (editingBookingId) {
        await saveBookingEdit(submitBtn);
        return;
    }

    const name = userNameInput.value.trim();
    const dateStr = selectedDateInput.value;
    const duration = parseInt(document.getElementById('duration').value, 10);
    const topic = document.getElementById('topic').value.trim();
    const slideLink = document.getElementById('slideLink').value.trim();

    // Validate day of week (Tuesdays & Thursdays only)
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    if (dayOfWeek !== 2 && dayOfWeek !== 4) {
        formFeedback.textContent = 'Bookings allowed only on Tuesdays and Thursdays.';
        formFeedback.className = 'feedback error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
        return;
    }

    // Validate duration
    if (![5, 10, 15, 20].includes(duration)) {
        formFeedback.textContent = 'Invalid duration.';
        formFeedback.className = 'feedback error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
        return;
    }

    const dayRef = doc(db, 'days', dateStr);

    try {
        // Transaction: re-reads the day's counter atomically, so two people
        // booking at once can never exceed the 20-minute capacity.
        await runTransaction(db, async (transaction) => {
            const dayDoc = await transaction.get(dayRef);
            const totalUsed = dayDoc.exists() ? (dayDoc.data().booked_minutes || 0) : 0;

            if (totalUsed + duration > MAX_MINUTES) {
                throw new Error(`Not enough time remaining in this slot (${MAX_MINUTES - totalUsed} min left).`);
            }

            transaction.set(dayRef, { booked_minutes: totalUsed + duration }, { merge: true });

            transaction.set(doc(collection(db, 'bookings')), {
                user_name: name,
                email: currentUser.email,
                google_id: currentUser.google_id,
                booking_date: dateStr,
                start_time: calcStartTime(totalUsed),
                duration_minutes: duration,
                topic,
                slide_link: slideLink,
                gc_post: document.getElementById('gcPost').checked,
                created_at: serverTimestamp()
            });
        });

        formFeedback.textContent = 'Booking Confirmed!';
        formFeedback.className = 'feedback success';
        setTimeout(() => {
            closeModal();
            // Calendar & sidebar update automatically via onSnapshot
        }, 1000);
    } catch (err) {
        console.error(err);
        formFeedback.textContent = err.message;
        formFeedback.className = 'feedback error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
    }
}

// Save changes to an existing booking. Runs in a transaction so the day's
// capacity counter is adjusted atomically with the update (no double-booking).
async function saveBookingEdit(submitBtn) {
    const name = userNameInput.value.trim();
    const duration = parseInt(document.getElementById('duration').value, 10);
    const topic = document.getElementById('topic').value.trim();
    const slideLink = document.getElementById('slideLink').value.trim();

    // Validate duration
    if (![5, 10, 15, 20].includes(duration)) {
        formFeedback.textContent = 'Invalid duration.';
        formFeedback.className = 'feedback error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
        return;
    }

    const bookingRef = doc(db, 'bookings', editingBookingId);

    try {
        await runTransaction(db, async (transaction) => {
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists()) {
                throw new Error('This booking no longer exists — it may have been deleted.');
            }

            const existing = bookingDoc.data();

            // Client-side ownership guard (the rules enforce this too)
            const isOwner = existing.email && currentUser.email.toLowerCase() === existing.email.toLowerCase();
            const isAdmin = ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
            if (!isOwner && !isAdmin) {
                throw new Error('You can only edit your own bookings.');
            }

            // Re-read the day's counter and shift it by the duration change,
            // still honoring the 20-minute cap.
            const dayRef = doc(db, 'days', existing.booking_date);
            const dayDoc = await transaction.get(dayRef);
            const current = dayDoc.exists() ? (dayDoc.data().booked_minutes || 0) : 0;

            const newTotal = current - existing.duration_minutes + duration;
            if (newTotal > MAX_MINUTES) {
                throw new Error(`Not enough time remaining in this slot (${MAX_MINUTES - (current - existing.duration_minutes)} min left).`);
            }

            transaction.set(dayRef, { booked_minutes: newTotal }, { merge: true });
            transaction.update(bookingRef, {
                user_name: name,
                topic,
                slide_link: slideLink,
                duration_minutes: duration,
                gc_post: document.getElementById('gcPost').checked
            });
        });

        editingBookingId = null;
        formFeedback.textContent = 'Changes saved!';
        formFeedback.className = 'feedback success';
        setTimeout(() => {
            closeModal();
            // Calendar & sidebar update automatically via onSnapshot
        }, 1000);
    } catch (err) {
        console.error(err);
        formFeedback.textContent = err.message;
        formFeedback.className = 'feedback error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
    }
}
