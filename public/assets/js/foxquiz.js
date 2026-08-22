/**
 * "Which fox are you?" Foxes page only.
 *
 * ⚠️ THE ANSWERS ARE THE STUDIO'S REAL FOXES, PULLED FROM /api/content/foxes.
 * Not a hard-coded list. A quiz with its own private set of foxes goes
 * stale the first time somebody adds one in the admin, and then the site
 * is telling people they are a fox that no longer exists. The page
 * already fetches this endpoint for the fox cards; this is the same data
 * read a second time rather than a second idea of what a fox is.
 *
 * ⚠️ IF THE FETCH FAILS, THE QUIZ DOES NOT APPEAR AT ALL.
 * A broken toy on a page is worse than no toy. There is no fallback list
 * for the same reason there is no hard-coded one.
 *
 * The result is deliberately a nudge towards adopting - that is what the
 * foxes page is for - but it never claims a fox is available. It links to
 * the fox's own card and lets the page say the rest.
 */
(function () {
    'use strict';

    var HOST_ID = 'fox-quiz';

    function inEnglish() {
        return document.body.classList.contains('lang-en');
    }

    function say(en, mi) {
        return inEnglish() ? en : mi;
    }

    /**
     * Five questions, four answers each.
     *
     * Each answer carries a WEIGHT rather than naming a fox, because the
     * quiz cannot know which foxes exist until the fetch comes back. The
     * weights are simple traits; the fox is chosen by whichever one sits
     * closest in the list once the traits are totted up. That keeps the
     * quiz working with three foxes or thirty.
     */
    var QUESTIONS = [
        {
            en: 'It is the middle of the night. You are\u2026',
            mi: 'Kei waenganui p\u014d. Kei te\u2026',
            answers: [
                { en: 'Still working. One more thing.', mi: 'Mahi tonu. Kotahi atu mea.', w: 3 },
                { en: 'Out walking in the cold.', mi: 'Hikoi ana i te makariri.', w: 2 },
                { en: 'Asleep like a sensible creature.', mi: 'Moe ana, he mea whai whakaaro.', w: 0 },
                { en: 'Reading something with no plot.', mi: 'P\u0101nui ana i t\u0113tahi mea kore k\u014drero.', w: 1 },
            ],
        },
        {
            en: 'Someone hands you a blank sheet of paper.',
            mi: 'Ka hoatu e t\u0113tahi he pepa m\u0101 ki a koe.',
            answers: [
                { en: 'Fold it into something.', mi: 'Whakakopa hei mea k\u0113.', w: 3 },
                { en: 'Draw in the corner.', mi: 'T\u0101 i te kokonga.', w: 2 },
                { en: 'Make a list.', mi: 'Hanga r\u0101rangi.', w: 1 },
                { en: 'Give it back.', mi: 'Whakahoki atu.', w: 0 },
            ],
        },
        {
            en: 'Your favourite kind of weather?',
            mi: 'He aha t\u014d momo huarere pai?',
            answers: [
                { en: 'Hard frost, clear sky.', mi: 'Huka p\u0101keke, rangi m\u0101rama.', w: 3 },
                { en: 'Heavy rain, indoors.', mi: 'Ua nui, kei roto.', w: 1 },
                { en: 'Wind that moves the trees.', mi: 'Hau e n\u0113ke ana i ng\u0101 r\u0101kau.', w: 2 },
                { en: 'Warm and still.', mi: 'Mahana, marino.', w: 0 },
            ],
        },
        {
            en: 'A stranger asks what you do.',
            mi: 'Ka p\u0101tai mai he tauhou he aha t\u0101u mahi.',
            answers: [
                { en: 'Tell them the whole thing.', mi: 'K\u014drerotia te katoa.', w: 3 },
                { en: 'Undersell it, badly.', mi: 'Whakaiti, k\u0101ore i te pai.', w: 1 },
                { en: 'Show them instead.', mi: 'Whakaatu k\u0113.', w: 2 },
                { en: 'Change the subject.', mi: 'Panoni i te kaupapa.', w: 0 },
            ],
        },
        {
            en: 'The best part of finishing something is\u2026',
            mi: 'Ko te w\u0101hi pai o te whakaoti\u2026',
            answers: [
                { en: 'Showing the pack.', mi: 'Te whakaatu ki te r\u014dp\u016b.', w: 3 },
                { en: 'The quiet afterwards.', mi: 'Te \u0101ta noho i muri.', w: 0 },
                { en: 'Starting the next one.', mi: 'Te t\u012bmata i te mea e whai ake.', w: 2 },
                { en: 'Crossing it off.', mi: 'Te whakakore i te r\u0101rangi.', w: 1 },
            ],
        },
    ];

    function build(host, foxes) {
        var step = 0;
        var score = 0;

        var card = document.createElement('div');
        card.className = 'quiz-card';
        /* Announced politely as the questions change, so somebody using a
           screen reader is not left on a card that silently rewrote
           itself. */
        card.setAttribute('role', 'group');
        host.appendChild(card);

        var live = document.createElement('p');
        live.className = 'quiz-progress';
        live.setAttribute('role', 'status');
        card.appendChild(live);

        var question = document.createElement('p');
        question.className = 'quiz-question';
        card.appendChild(question);

        var answers = document.createElement('div');
        answers.className = 'quiz-answers';
        card.appendChild(answers);

        function clear(node) {
            while (node.firstChild) node.removeChild(node.firstChild);
        }

        function finish() {
            clear(answers);
            /* The highest possible score maps to the last fox in the
               list, the lowest to the first. Whatever foxes exist, every
               score lands on one of them. */
            var most = QUESTIONS.length * 3;
            var index = Math.min(
                foxes.length - 1,
                Math.round((score / most) * (foxes.length - 1)),
            );
            var fox = foxes[index];

            live.textContent = say('Done.', 'Kua oti.');
            question.textContent = say(
                'You are ' + (fox.nameEn || 'a fox') + '.',
                'Ko ' + (fox.nameMi || fox.nameEn || 'he p\u014dkiha') + ' koe.',
            );

            var blurb = document.createElement('p');
            blurb.className = 'quiz-result';
            blurb.textContent = say(fox.descEn || '', fox.descMi || '');
            answers.appendChild(blurb);

            var again = document.createElement('button');
            again.type = 'button';
            again.className = 'quiz-answer';
            again.textContent = say('Go again', 'An\u014d');
            again.addEventListener('click', function () {
                step = 0;
                score = 0;
                render();
            });
            answers.appendChild(again);
        }

        function render() {
            if (step >= QUESTIONS.length) { finish(); return; }

            var q = QUESTIONS[step];
            live.textContent = say(
                'Question ' + (step + 1) + ' of ' + QUESTIONS.length,
                'P\u0101tai ' + (step + 1) + ' o ' + QUESTIONS.length,
            );
            question.textContent = say(q.en, q.mi);

            clear(answers);
            q.answers.forEach(function (a) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'quiz-answer';
                button.textContent = say(a.en, a.mi);
                button.addEventListener('click', function () {
                    score += a.w;
                    step += 1;
                    render();
                    // Focus follows the question, or a keyboard user is
                    // left at the top of the page after every answer.
                    var first = answers.querySelector('button');
                    if (first) first.focus();
                });
                answers.appendChild(button);
            });
        }

        render();
    }

    function start() {
        var host = document.getElementById(HOST_ID);
        if (!host) return;

        window.fetch('/api/content/foxes')
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('no foxes')); })
            .then(function (data) {
                var foxes = (data && data.foxes) || data || [];
                if (!Array.isArray(foxes) || foxes.length < 2) return;
                host.removeAttribute('hidden');
                build(host, foxes);
            })
            .catch(function () {
                /* Deliberately silent, and deliberately leaves the section
                   hidden. A quiz that cannot name a fox has nothing to
                   say, and an error message about an easter egg is worse
                   than the easter egg not being there. */
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
}());
