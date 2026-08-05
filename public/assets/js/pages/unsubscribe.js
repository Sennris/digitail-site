/* unsubscribe.html
 *
 * Posts to /api/unsubscribe, which checks the Turnstile token first.
 * The server gives the same answer whether or not the address was on
 * the list, so this page cannot be used to find out who is subscribed.
 */

document.addEventListener('DOMContentLoaded', function () {
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
        langBtn.addEventListener('click', function () {
            document.body.classList.toggle('lang-en');
            document.body.classList.toggle('lang-mi');
        });
    }

    const form = document.getElementById('unsub-form');
    const emailInput = document.getElementById('unsub-email');
    const statusBox = document.getElementById('unsub-status');
    const submitBtn = document.getElementById('unsub-submit');
    if (!form) return;

    const say = function (en, mi, isError) {
        statusBox.innerHTML = '';
        const enSpan = document.createElement('span');
        enSpan.className = 'en';
        enSpan.textContent = en;
        const miSpan = document.createElement('span');
        miSpan.className = 'mi';
        miSpan.textContent = mi;
        statusBox.appendChild(enSpan);
        statusBox.appendChild(miSpan);
        statusBox.classList.toggle('is-error', !!isError);
    };

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const tokenField = form.querySelector('[name="cf-turnstile-response"]');
        const token = tokenField ? tokenField.value : '';
        if (!token) {
            say('Please wait a moment for the "not a robot" check to finish, then try again.',
                'Taria mō te wā poto kia oti te arowhai "ehara i te karetao", kātahi ka ngana anō.', true);
            return;
        }

        submitBtn.disabled = true;
        say('Working on it...', 'Kei te mahi...', false);

        fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value,
                'cf-turnstile-response': token
            })
        })
        .then(function (response) {
            return response.json().then(function (data) {
                return { ok: response.ok, data: data };
            });
        })
        .then(function (result) {
            if (result.ok && result.data.ok) {
                say('Done. If that address was on the list, it has been removed.',
                    'Kua oti. Mēnā i runga i te rārangi taua wāhitau, kua tangohia.', false);
                form.querySelector('input[type="email"]').value = '';
                return;
            }
            say(result.data.error || 'Something went wrong. Please try again.',
                result.data.error || 'I raru tētahi mea. Tēnā koa ngana anō.', true);
            submitBtn.disabled = false;
            // Tokens are single use; without this a retry always fails.
            if (window.turnstile) window.turnstile.reset();
        })
        .catch(function () {
            say('We could not reach the server. Please check your connection and try again.',
                'Kāore i taea te toro atu ki te tūmau. Tirohia tō hononga, ka ngana anō.', true);
            submitBtn.disabled = false;
            if (window.turnstile) window.turnstile.reset();
        });
    });
});
