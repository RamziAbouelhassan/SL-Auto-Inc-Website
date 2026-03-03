const API_URL = 'http://localhost:4310/api/bookings';
let currentTab = 'pending';
let bookingsData = [];

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked
            item.classList.add('active');

            currentTab = item.dataset.tab;

            // Update Title
            const titles = {
                'pending': 'Pending Requests',
                'accepted': 'Accepted Bookings',
                'archived': 'Archived & Rejected'
            };
            document.getElementById('pageTitle').textContent = titles[currentTab];

            renderBookings();
        });
    });

    fetchBookings();
});

async function fetchBookings() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch bookings');

        bookingsData = await response.json();
        updateCounts();
        renderBookings();
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('bookingList').innerHTML = `<div class="empty-state" style="color: #ef4444;">Error loading bookings. Ensure backend is running.</div>`;
    }
}

function updateCounts() {
    const pendingCount = bookingsData.filter(b => b.status === 'pending').length;
    document.getElementById('pendingCount').textContent = pendingCount;
}

function renderBookings() {
    const listContainer = document.getElementById('bookingList');

    // Filter bookings based on tab
    let filteredBookings = [];
    if (currentTab === 'pending') {
        filteredBookings = bookingsData.filter(b => b.status === 'pending');
    } else if (currentTab === 'accepted') {
        filteredBookings = bookingsData.filter(b => b.status === 'accepted');
    } else if (currentTab === 'archived') {
        filteredBookings = bookingsData.filter(b => b.status === 'archived' || b.status === 'rejected');
    }

    if (currentTab === 'calendar') {
        renderCalendar(bookingsData);
        return;
    }

    if (filteredBookings.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">No ${currentTab} bookings found.</div>`;
        return;
    }

    listContainer.innerHTML = filteredBookings.map(booking => `
    <div class="booking-card">
      <div class="booking-details">
        <span class="status-badge status-${booking.status}">${booking.status}</span>
        
        <div class="booking-header">
          <div class="customer-name">${escapeHTML(booking.firstName)} ${escapeHTML(booking.lastName)}</div>
          <div class="date-text">${formatDate(booking.created_at)}</div>
        </div>
        
        <div class="contact-info">
          <span>📞 ${escapeHTML(booking.phone)}</span>
          <span>✉️ ${escapeHTML(booking.email)}</span>
        </div>
        
        <div class="vehicle-info">
          🚗 ${escapeHTML(booking.year)} ${escapeHTML(booking.make)} ${escapeHTML(booking.model)}
        </div>
        
        <div class="concern-box">
          <strong>Concern:</strong><br/>
          ${escapeHTML(booking.concern)}
        </div>
      </div>
      
      <div class="booking-actions">
        ${getActionsForStatus(booking.status, booking.id)}
      </div>
    </div>
  `).join('');

    renderCalendar(bookingsData);
}

function renderCalendar(bookings) {
    const calendarEl = document.getElementById('calendar');
    const calendarView = document.getElementById('calendarView');
    const bookingList = document.getElementById('bookingList');

    if (currentTab === 'calendar') {
        bookingList.style.display = 'none';
        calendarView.style.display = 'block';

        const events = bookings.map(b => {
            // Use created_at as display date for MVP
            let eventColor = '#38bdf8'; // padding
            if (b.status === 'accepted') eventColor = '#10b981';
            if (b.status === 'rejected') eventColor = '#ef4444';
            if (b.status === 'archived') eventColor = '#94a3b8';

            return {
                title: `${b.firstName} ${b.lastName} - ${b.year} ${b.model}`,
                start: b.created_at,
                color: eventColor,
                extendedProps: { status: b.status }
            };
        });

        if (!window.adminCalendar) {
            window.adminCalendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek'
                },
                events: events,
                height: '100%'
            });
            window.adminCalendar.render();
        } else {
            // Update events if it already exists
            window.adminCalendar.removeAllEvents();
            window.adminCalendar.addEventSource(events);
            window.adminCalendar.render();
        }
    } else {
        bookingList.style.display = 'flex';
        calendarView.style.display = 'none';
    }
}

function getActionsForStatus(status, id) {
    if (status === 'pending') {
        return `
      <button class="btn btn-accept" onclick="updateStatus(${id}, 'accepted')">Accept</button>
      <button class="btn btn-reject" onclick="updateStatus(${id}, 'rejected')">Reject</button>
    `;
    } else if (status === 'accepted') {
        return `
      <button class="btn btn-archive" onclick="updateStatus(${id}, 'archived')">Archive</button>
    `;
    } else if (status === 'rejected' || status === 'archived') {
        return `
      <button class="btn btn-accept" onclick="updateStatus(${id}, 'pending')">Restore (Pending)</button>
      <button class="btn btn-delete" onclick="updateStatus(${id}, 'deleted')">Delete Forever</button>
    `;
    }
    return '';
}

async function updateStatus(id, newStatus) {
    try {
        const response = await fetch(`${API_URL}/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) throw new Error('Failed to update status');

        // Refresh data
        fetchBookings();
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update booking status.');
    }
}

// Utils
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// Modal Logic
const addModal = document.getElementById('addBookingModal');
const addBtn = document.getElementById('addBookingBtn');
const closeBtn = document.querySelector('.close-modal');
const adminAddForm = document.getElementById('adminBookingForm');

if (addBtn) {
    addBtn.addEventListener('click', () => {
        addModal.classList.add('show');
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        addModal.classList.remove('show');
        if (adminAddForm) adminAddForm.reset();
    });
}

window.addEventListener('click', (e) => {
    if (e.target === addModal) {
        addModal.classList.remove('show');
        if (adminAddForm) adminAddForm.reset();
    }
});

if (adminAddForm) {
    adminAddForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(adminAddForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error('Failed to create booking');

            // Auto-accept manually entered bookings
            const result = await response.json();
            await fetch(`${API_URL}/${result.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'accepted' })
            });

            addModal.classList.remove('show');
            adminAddForm.reset();

            // Navigate to Accepted tab automatically
            document.querySelector('.nav-item[data-tab="accepted"]').click();
            fetchBookings();
        } catch (err) {
            console.error('Error creating admin booking:', err);
            alert('Failed to create booking.');
        }
    });
}
