/**
 * EpicTavern send-control + connection status helpers.
 * ST hides #send_but while disconnected; Phase 1 also hid the old API status icon.
 * Keep send visible and surface connection state on AppNav.
 */

import { eventSource, event_types } from './events.js';
import { online_status } from '../script.js';
import { navigate } from './app-nav.js';

function isConnected() {
    return online_status !== undefined && online_status !== 'no_connection';
}

export function syncEtConnectionUi() {
    const connected = isConnected();
    const $send = $('#send_but');
    const $form = $('#send_form');
    const $connectNav = $('#et-app-nav .et-nav-item[data-et-screen="connect"]');

    // Always keep the paper-plane in layout so the input isn't missing a control.
    $send.removeClass('displayNone');
    $send.toggleClass('et-send-disconnected', !connected);
    $send.attr('title', connected ? 'Send a message' : 'Not connected — click to open Connect');

    $form.toggleClass('no-connection', !connected);
    $connectNav.toggleClass('et-nav-disconnected', !connected);
    $connectNav.toggleClass('et-nav-connected', connected);
    $connectNav.attr('title', connected ? `Connected: ${online_status}` : 'No API connection — click to connect');
}

export function initEtSendFix() {
    syncEtConnectionUi();

    eventSource.on(event_types.ONLINE_STATUS_CHANGED, () => {
        syncEtConnectionUi();
    });

    // Keep in sync if ST toggles classes later
    const sendBtn = document.getElementById('send_but');
    if (sendBtn && typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => {
            if (sendBtn.classList.contains('displayNone')) {
                sendBtn.classList.remove('displayNone');
            }
            sendBtn.classList.toggle('et-send-disconnected', !isConnected());
        });
        obs.observe(sendBtn, { attributes: true, attributeFilter: ['class'] });
    }

    // If disconnected, intercept send before ST's handler runs
    const sendEl = document.getElementById('send_but');
    if (sendEl) {
        sendEl.addEventListener('click', (e) => {
            if (isConnected()) {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            toastr.warning('Connect to an API first.', 'Not connected');
            navigate('connect');
        }, true);
    }

    // Ensure Enter still attempts send; if disconnected, guide the user
    const textarea = document.getElementById('send_textarea');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.isComposing) {
                return;
            }
            if (!isConnected()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                toastr.warning('Connect to an API first.', 'Not connected');
                navigate('connect');
            }
        }, true);
    }

    // Periodic light sync (status can change without a useful event in some backends)
    setInterval(syncEtConnectionUi, 2000);
}
