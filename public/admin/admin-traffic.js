/**
 * Traffic tab.
 *
 * Reads /api/analytics, which reads D1. It never talks to Cloudflare -
 * that is the nightly cron's job - so this tab stays fast and keeps
 * working even if the analytics token breaks.
 *
 * Everything here is built as ELEMENTS, not by interpolating values
 * into an innerHTML string. Nothing in this table is hand-typed today,
 * but the last three bugs of that shape on this site were all in code
 * where nothing was hand-typed "yet".
 */

(function () {
    'use strict';

    var loaded = false;

    function el(tag, text, attrs) {
        var node = document.createElement(tag);
        if (text !== undefined && text !== null) node.textContent = String(text);
        if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        return node;
    }

    function setNumber(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = Number(value || 0).toLocaleString();
    }

    function message(where, text) {
        var box = document.getElementById(where);
        if (!box) return;
        box.textContent = '';
        box.appendChild(el('p', text, { style: 'color: var(--arctic-willow); margin: 0;' }));
    }

    function renderTable(data) {
        var box = document.getElementById('traffic-table');
        if (!box) return;
        box.textContent = '';

        if (!data.rows.length) {
            box.appendChild(el('p',
                'Nothing recorded yet. Press "Fetch from Cloudflare now" to pull in '
                + 'whatever Cloudflare is still holding - it keeps the last 30 days.',
                { style: 'color: var(--arctic-willow); margin: 0;' }));
            return;
        }

        // Inline styles on purpose, matching the subscribers table.
        // Admin card colours are pinned in content-manager.css at a
        // specificity that has silently beaten three later rules; not
        // adding a stylesheet rule sidesteps that fight entirely.
        var TH = 'padding: 0 0.75rem 0.5rem 0; text-align: left;';
        var TD = 'padding: 0.5rem 0.75rem 0.5rem 0;';
        var NUM = TD + ' font-family: var(--font-mono);';

        var wrap = el('div', null, { style: 'overflow-x: auto;' });
        var table = el('table', null, {
            style: 'width: 100%; border-collapse: collapse; font-size: 0.9rem;',
        });

        var thead = el('thead');
        var hrow = el('tr', null, {
            style: 'border-bottom: 2px solid var(--frozen-juniper);',
        });
        hrow.appendChild(el('th', 'Date (UTC)', { style: TH }));
        hrow.appendChild(el('th', 'Page views', { style: TH }));
        hrow.appendChild(el('th', 'Visits', { style: TH }));
        thead.appendChild(hrow);
        table.appendChild(thead);

        var tbody = el('tbody');
        data.rows.forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('td', r.date, { style: NUM }));
            tr.appendChild(el('td', Number(r.pageViews || 0).toLocaleString(), { style: NUM }));
            tr.appendChild(el('td', Number(r.visits || 0).toLocaleString(), { style: NUM }));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        box.appendChild(wrap);
    }

    function currentRange() {
        var sel = document.getElementById('traffic-range');
        return sel ? sel.value : '90';
    }

    function loadTraffic() {
        var days = currentRange();
        message('traffic-table', 'Loading\u2026');

        return fetch('/api/analytics?days=' + encodeURIComponent(days), { credentials: 'same-origin' })
            .then(function (res) {
                if (res.status === 401) throw new Error('Your session expired. Sign in again.');
                return res.json().then(function (body) {
                    if (!res.ok) throw new Error(body && body.error ? body.error : 'Could not load traffic history');
                    return body;
                });
            })
            .then(function (data) {
                loaded = true;
                setNumber('traffic-views', data.totals.pageViews);
                setNumber('traffic-visits', data.totals.visits);
                setNumber('traffic-days', data.days);
                renderTable(data);
            })
            .catch(function (err) {
                message('traffic-table', err.message);
            });
    }

    function fetchTrafficNow() {
        message('traffic-table', 'Asking Cloudflare\u2026 this can take a few seconds.');

        return fetch('/api/analytics/refresh', { method: 'POST', credentials: 'same-origin' })
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) throw new Error(body && body.error ? body.error : 'Fetch failed');
                    return body;
                });
            })
            .then(function (result) {
                // Deliberately says what happened rather than just "done".
                // "Wrote 0 days" is a real and correct outcome when it is
                // already up to date, and looks like a failure otherwise.
                if (typeof showAlert === 'function') {
                    showAlert(result.written
                        ? 'Added ' + result.written + ' day(s) of traffic history.'
                        : 'Already up to date - nothing new to add.', 'success');
                }
                return loadTraffic();
            })
            .catch(function (err) {
                if (typeof showAlert === 'function') {
                    showAlert('Could not fetch from Cloudflare: ' + err.message, 'error');
                } else {
                    message('traffic-table', err.message);
                }
            });
    }

    // The tab is not the landing tab, so load on first open rather than
    // on page load - it saves a query on every admin visit that never
    // looks at traffic.
    var originalSwitchTab = window.switchTab;
    window.switchTab = function (tabName, clickedBtn) {
        if (typeof originalSwitchTab === 'function') originalSwitchTab(tabName, clickedBtn);
        if (tabName === 'traffic' && !loaded) loadTraffic();
    };

    window.loadTraffic = loadTraffic;
    window.fetchTrafficNow = fetchTrafficNow;
}());
