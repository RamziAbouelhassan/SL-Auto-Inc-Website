const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");

if (menuBtn && menu) {
  menuBtn.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  // Close menu after clicking a link (mobile)
  menu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      menu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

// This makes sure the HTML is fully loaded before the script runs
document.addEventListener("DOMContentLoaded", function() {
    
    // Find the button using the class we gave it in the HTML
    const bookButton = document.querySelector(".btn.primary");

    // Tell the button what to do when it gets clicked
    bookButton.addEventListener("click", function(e) {
        e.preventDefault();
        alert("Thanks for your interest! Since they don't have an online booking system yet, please visit us at 4400 Elgin Ave to schedule an appointment.");
    });

});