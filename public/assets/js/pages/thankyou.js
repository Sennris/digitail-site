/* thankyou.html - page script */
/* Extracted verbatim from the old inline <script> block.
   Shared behaviour is being consolidated into site.js one
   page at a time - see README. */

// 1. Language Toggle Logic
        const langToggleBtn = document.getElementById('lang-toggle-btn');
        const body = document.body;

        langToggleBtn.addEventListener('click', () => {
            if (body.classList.contains('lang-en')) {
                body.classList.remove('lang-en');
                body.classList.add('lang-mi');
            } else {
                body.classList.remove('lang-mi');
                body.classList.add('lang-en');
            }
        });

        // 2. Countdown and Redirect Logic
        let timeLeft = 3;
        const countdownElEn = document.getElementById('countdown');
        const countdownElMi = document.getElementById('countdown-mi');

        const timer = setInterval(() => {
            timeLeft--;
            countdownElEn.innerText = timeLeft;
            countdownElMi.innerText = timeLeft;

            if (timeLeft <= 0) {
                clearInterval(timer);
                // Redirects back to the homepage
                window.location.href = 'index.html';
            }
        }, 1000); // 1000 milliseconds = 1 second
