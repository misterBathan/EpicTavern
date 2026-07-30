/**
 * EpicTavern — force site chrome to stay visible on every screen (especially Chat).
 * AppNav must never disappear; sheld must never leave a dead gap under the send box.
 */

const APP_NAV_H = '3.25rem';
const SCENE_H = '2.85rem';

/**
 * @param {HTMLElement} el
 * @param {Record<string, string>} props
 */
function forceStyle(el, props) {
    for (const [key, value] of Object.entries(props)) {
        el.style.setProperty(key, value, 'important');
    }
}

function ensureAppNav() {
    let nav = document.getElementById('et-app-nav');
    if (!nav) {
        nav = document.createElement('nav');
        nav.id = 'et-app-nav';
        nav.setAttribute('aria-label', 'EpicTavern');
        nav.innerHTML = `
            <div class="et-nav-brand" data-et-screen="home" title="EpicTavern Home">
                <span class="et-nav-brand-mark" aria-hidden="true"></span>
                <span class="et-nav-brand-text">EpicTavern</span>
            </div>
            <div class="et-nav-items" role="list">
                <button type="button" class="et-nav-item" data-et-screen="chats" role="listitem"><i class="fa-solid fa-comments" aria-hidden="true"></i><span>Chats</span></button>
                <button type="button" class="et-nav-item" data-et-screen="characters" role="listitem"><i class="fa-solid fa-address-card" aria-hidden="true"></i><span>Characters</span></button>
                <button type="button" class="et-nav-item" data-et-screen="world" role="listitem"><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span>World</span></button>
                <button type="button" class="et-nav-item" data-et-screen="personas" role="listitem"><i class="fa-solid fa-user" aria-hidden="true"></i><span>Personas</span></button>
                <button type="button" class="et-nav-item" data-et-screen="connect" role="listitem"><i class="fa-solid fa-plug" aria-hidden="true"></i><span>Connect</span></button>
                <button type="button" class="et-nav-item" data-et-screen="extensions" role="listitem"><i class="fa-solid fa-cubes" aria-hidden="true"></i><span>Extensions</span></button>
                <button type="button" class="et-nav-item" data-et-screen="settings" role="listitem"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Settings</span></button>
            </div>
            <div class="et-nav-meta"><small id="version_display" class="et-nav-version" title="EpicTavern version"></small></div>
        `;
        document.body.prepend(nav);
    }

    if (document.body.firstElementChild !== nav) {
        document.body.prepend(nav);
    }

    forceStyle(nav, {
        display: 'flex',
        visibility: 'visible',
        opacity: '1',
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        width: '100%',
        height: APP_NAV_H,
        'min-height': APP_NAV_H,
        'max-height': APP_NAV_H,
        'z-index': '2147483000',
        transform: 'none',
        'pointer-events': 'auto',
        'clip-path': 'none',
        overflow: 'visible',
    });

    document.documentElement.style.setProperty('--et-app-nav-height', APP_NAV_H);
    document.documentElement.style.setProperty('--et-scene-tools-height', SCENE_H);
    document.body.style.setProperty('--et-app-nav-height', APP_NAV_H);
    document.body.style.setProperty('--et-scene-tools-height', SCENE_H);
}

function pinChatSheld() {
    if (document.body.dataset.etScreen !== 'chat') {
        return;
    }

    const sheld = document.getElementById('sheld');
    if (!sheld) {
        return;
    }

    // Kill MovingUI geometry — it leaves a dead band under the send box
    ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin', 'max-height', 'min-height'].forEach((p) => {
        sheld.style.removeProperty(p);
    });

    const gutter = getComputedStyle(document.body).getPropertyValue('--et-rpg-gutter').trim() || '0px';
    const margin = getComputedStyle(document.body).getPropertyValue('--et-page-margin-x').trim() || '1.5rem';
    const chrome = `calc(${APP_NAV_H} + ${SCENE_H})`;

    forceStyle(sheld, {
        display: 'flex',
        'flex-direction': 'column',
        position: 'fixed',
        top: chrome,
        left: `calc(${margin} + ${gutter})`,
        right: `calc(${margin} + ${gutter})`,
        bottom: '0',
        width: 'auto',
        height: `calc(100dvh - ${APP_NAV_H} - ${SCENE_H})`,
        'max-height': `calc(100dvh - ${APP_NAV_H} - ${SCENE_H})`,
        'min-height': '0',
        margin: '0',
        padding: '0',
        'z-index': '1100',
        overflow: 'hidden',
    });

    const chat = document.getElementById('chat');
    if (chat) {
        forceStyle(chat, {
            flex: '1 1 auto',
            'min-height': '0',
            height: 'auto',
            'max-height': 'none',
        });
    }

    const form = document.getElementById('form_sheld');
    if (form) {
        ['height', 'min-height', 'margin', 'top', 'bottom'].forEach((p) => form.style.removeProperty(p));
        forceStyle(form, {
            flex: '0 0 auto',
            'margin-top': 'auto',
            'margin-bottom': '0',
            height: 'auto',
            'min-height': '0',
            padding: '0 0.5rem max(0.15rem, env(safe-area-inset-bottom))',
        });
    }

    const send = document.getElementById('send_form');
    if (send) {
        forceStyle(send, {
            'margin-bottom': '0',
            height: 'auto',
            'min-height': '0',
        });
    }

    const topBar = document.getElementById('etChatTopBar');
    if (topBar) {
        forceStyle(topBar, {
            display: 'flex',
            visibility: 'visible',
            opacity: '1',
            position: 'fixed',
            top: APP_NAV_H,
            left: '0',
            right: '0',
            width: '100%',
            height: SCENE_H,
            'min-height': SCENE_H,
            'z-index': '2147482900',
        });
    }
}

export function forceEtChrome() {
    ensureAppNav();
    pinChatSheld();
}

export function initEtForceChrome() {
    forceEtChrome();
    document.addEventListener('et-screen-changed', () => {
        forceEtChrome();
        // MovingUI / layout can re-apply after navigation
        requestAnimationFrame(() => forceEtChrome());
        setTimeout(forceEtChrome, 50);
        setTimeout(forceEtChrome, 250);
    });

    // Keep header alive even if something strips it later
    setInterval(() => {
        const nav = document.getElementById('et-app-nav');
        if (!nav || getComputedStyle(nav).display === 'none' || getComputedStyle(nav).visibility === 'hidden') {
            ensureAppNav();
        }
        if (document.body.dataset.etScreen === 'chat') {
            const sheld = document.getElementById('sheld');
            if (sheld) {
                const rect = sheld.getBoundingClientRect();
                const gap = window.innerHeight - rect.bottom;
                if (gap > 8) {
                    pinChatSheld();
                }
            }
        }
    }, 1000);
}
