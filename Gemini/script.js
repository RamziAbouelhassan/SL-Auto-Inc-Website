// --- Mobile Menu ---
const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");

if (menuBtn && menu) {
  menuBtn.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  menu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      // Allow external links (like booking.html) to navigate away
      if (!a.href.includes('#')) {
        return;
      }
      // For internal links, close the menu
      menu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

// --- Footer Year ---
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const footerYearEl = document.getElementById("footer-year");
if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();


// --- Form Handling ---
document.addEventListener("DOMContentLoaded", function() {
    
    const quoteForm = document.getElementById('quoteForm');
    if (quoteForm) {
        quoteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Thank you for your request! We will get back to you with a quote within 24 hours.');
            quoteForm.reset();
        });
    }

    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Thank you for your booking request! We will call you to confirm your appointment details shortly.');
            bookingForm.reset();
        });
    }

});