/* Subscribers tab.
 *
 * The tab markup is static in index.html rather than mounted by this
 * script. An earlier feature mounted itself into a tab that did not
 * exist yet and failed silently; static markup cannot do that.
 */

(function () {
    'use strict';

    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    const badge = (status) => {
        const colour = {
            confirmed: 'var(--frozen-juniper)',
            pending: 'var(--flat-white)',
            unsubscribed: 'var(--arctic-willow)',
        }[status] || 'var(--arctic-willow)';
        return `<span style="font-family: var(--font-mono); font-size: 0.75rem;
                 border: 2px solid ${colour}; color: ${colour};
                 padding: 0.1rem 0.45rem; white-space: nowrap;">${escape(status)}</span>`;
    };

    function notify(message, isError) {
        if (typeof showAlert === 'function') {
            showAlert(message, isError ? 'error' : 'success');
        } else {
            console.log(message);
        }
    }

    window.loadSubscribers = async function loadSubscribers() {
        const target = document.getElementById('subs-table');
        if (!target) return;
        target.innerHTML = '<p style="color: var(--arctic-willow);">Loading...</p>';

        let data;
        try {
            const response = await fetch('/api/subscribers');
            if (!response.ok) throw new Error(`server said ${response.status}`);
            data = await response.json();
        } catch (e) {
            target.innerHTML = `<p style="color: #FFB4A2;">Could not load subscribers: ${escape(e.message)}</p>`;
            return;
        }

        document.getElementById('subs-confirmed').textContent = data.counts.confirmed || 0;
        document.getElementById('subs-pending').textContent = data.counts.pending || 0;
        document.getElementById('subs-unsubscribed').textContent = data.counts.unsubscribed || 0;

        if (!data.subscribers.length) {
            target.innerHTML = '<p style="color: var(--arctic-willow);">Nobody has signed up yet.</p>';
            return;
        }

        const rows = data.subscribers.map((s) => {
            const stuck = s.provider_state === 'error'
                ? `<div style="font-size: 0.7rem; color: #FFB4A2;">not sent to Buttondown: ${escape(s.provider_note)}</div>`
                : '';
            return `<tr style="border-bottom: 1px dashed var(--arctic-willow);">
                <td style="padding: 0.5rem 0.75rem 0.5rem 0;">${escape(s.email)}${stuck}</td>
                <td style="padding: 0.5rem 0.75rem 0.5rem 0;">${escape(s.name)}</td>
                <td style="padding: 0.5rem 0.75rem 0.5rem 0;">${badge(s.status)}</td>
                <td style="padding: 0.5rem 0; font-family: var(--font-mono); font-size: 0.75rem;
                           color: var(--arctic-willow); white-space: nowrap;">${escape((s.created_at || '').slice(0, 10))}</td>
            </tr>`;
        }).join('');

        target.innerHTML = `<div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead><tr style="border-bottom: 2px solid var(--frozen-juniper);
                                  font-family: var(--font-mono); font-size: 0.75rem;
                                  text-transform: uppercase; text-align: left;">
                    <th style="padding: 0 0.75rem 0.5rem 0;">Email</th>
                    <th style="padding: 0 0.75rem 0.5rem 0;">Name</th>
                    <th style="padding: 0 0.75rem 0.5rem 0;">Status</th>
                    <th style="padding: 0 0 0.5rem 0;">Joined</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`;
    };

    window.syncSubscribers = async function syncSubscribers() {
        notify('Syncing with Buttondown...', false);
        try {
            const response = await fetch('/api/subscribers/sync', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `server said ${response.status}`);
            notify(`Synced. ${data.seen} on Buttondown, ${data.updated} updated here`
                 + `${data.retried ? `, ${data.retried} resent` : ''}.`, false);
            window.loadSubscribers();
        } catch (e) {
            notify(`Sync failed: ${e.message}`, true);
        }
    };

    // Load once when the tab is first opened, not on every click.
    let loaded = false;
    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.tab-button').forEach(function (button) {
            if (!/subscribers/i.test(button.textContent)) return;
            button.addEventListener('click', function () {
                if (loaded) return;
                loaded = true;
                window.loadSubscribers();
            });
        });
    });
}());
