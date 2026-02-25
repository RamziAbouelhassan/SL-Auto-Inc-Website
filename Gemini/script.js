// This makes sure the HTML is fully loaded before the script runs
document.addEventListener("DOMContentLoaded", function() {
    
    // Find the button using the ID we gave it in the HTML
    const bookButton = document.getElementById("bookBtn");

    // Tell the button what to do when it gets clicked
    bookButton.addEventListener("click", function() {
        alert("Thanks for your interest! Since they don't have an online booking system yet, please visit us at 4400 Elgin Ave to schedule an appointment.");
    });

});

