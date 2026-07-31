/**
 * EpicTavern — force site chrome to stay visible on every screen (especially Chat).
 * AppNav must never disappear; Chat Top Bar must stay under it on chat;
 * sheld must never leave a dead gap under the send box (non-VN).
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

    // Permanent CSS override — survives theme / MovingUI / VN fights
    let lock = document.getElementById('et-force-app-nav-css');
    if (!lock) {
        lock = document.createElement('style');
        lock.id = 'et-force-app-nav-css';
        document.head.appendChild(lock);
    }
    lock.textContent = `
        #et-app-nav {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: ${APP_NAV_H} !important;
            min-height: ${APP_NAV_H} !important;
            max-height: ${APP_NAV_H} !important;
            z-index: 2147483000 !important;
            transform: none !important;
            pointer-events: auto !important;
            clip-path: none !important;
            overflow: visible !important;
            background: linear-gradient(180deg, rgba(28, 24, 20, 0.98), rgba(18, 16, 14, 0.96)) !important;
            border-bottom: 1px solid rgba(196, 163, 90, 0.28) !important;
            color: #e8dfd0 !important;
        }
        #et-app-nav .et-nav-brand,
        #et-app-nav .et-nav-items,
        #et-app-nav .et-nav-item {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            color: #e8dfd0 !important;
        }
        #et-app-nav .et-nav-brand-text {
            display: inline !important;
            visibility: visible !important;
            opacity: 1 !important;
            color: #e8dfd0 !important;
            font-weight: 700 !important;
        }
        #et-app-nav .et-nav-items {
            display: flex !important;
            flex: 1 1 auto !important;
            gap: 0.15rem !important;
        }
        body.et-shell[data-et-screen='chat'] #etChatTopBar {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: fixed !important;
            top: ${APP_NAV_H} !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: ${SCENE_H} !important;
            min-height: ${SCENE_H} !important;
            z-index: 2147482900 !important;
            transform: none !important;
            pointer-events: auto !important;
        }
        body.et-shell.waifuMode[data-et-screen='chat'] #sheld,
        body.waifuMode #sheld {
            height: auto !important;
            max-height: none !important;
            top: calc(${APP_NAV_H} + ${SCENE_H}) !important;
            bottom: 0 !important;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
            transform: none !important;
        }
        body.et-shell.waifuMode[data-et-screen='chat']:not(.et-vn-history-open) #form_sheld {
            position: fixed !important;
            bottom: 0 !important;
            top: auto !important;
            margin: 0 !important;
            padding: 0 0.35rem 0 !important;
            z-index: 1140 !important;
            transform: none !important;
        }
        body.et-shell.waifuMode[data-et-screen='chat'] #send_form {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }
        body.et-shell.et-vn-history-open #et-vn-dialogue,
        body.et-shell.et-vn-history-open #et-vn-dialogue.is-active {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
        }
    `;

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

function pinChatTopBar() {
    if (document.body.dataset.etScreen !== 'chat') {
        return;
    }
    const topBar = document.getElementById('etChatTopBar');
    if (!topBar) {
        return;
    }
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
        transform: 'none',
        'pointer-events': 'auto',
    });
}

function pinChatSheld() {
    if (document.body.dataset.etScreen !== 'chat') {
        return;
    }

    // Always keep AppNav + Chat Top Bar — including Visual Novel
    pinChatTopBar();

    // Chat screen without a loaded conversation → bounce to library
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        if (ctx && typeof ctx.getCurrentChatId === 'function' && !ctx.getCurrentChatId()) {
            import('./app-nav.js').then(({ navigate }) => {
                if (document.body.dataset.etScreen === 'chat' && !ctx.getCurrentChatId()) {
                    navigate('chats');
                }
            }).catch(() => { /* ignore */ });
            return;
        }
    } catch {
        // ignore
    }

    // Keep send-dock height var fresh for weather / VN fallback positioning
    const formSheldEl = document.getElementById('form_sheld');
    if (formSheldEl instanceof HTMLElement) {
        const h = Math.ceil(formSheldEl.getBoundingClientRect().height);
        if (h > 0) {
            document.documentElement.style.setProperty('--et-vn-send-dock-h', `${h}px`);
            document.body.style.setProperty('--et-vn-send-dock-h', `${h}px`);
        }
    }

    // Visual Novel: glue send dock to the viewport bottom; kill stock 40vh waifu sheld.
    if (document.body.classList.contains('waifuMode')) {
        const margin = getComputedStyle(document.body).getPropertyValue('--et-page-margin-x').trim() || '1.5rem';
        const gutter = getComputedStyle(document.body).getPropertyValue('--et-rpg-gutter').trim() || '0px';
        const inset = `calc(${margin} + ${gutter})`;

        const sheld = document.getElementById('sheld');
        if (sheld) {
            ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin', 'max-height', 'min-height'].forEach((p) => {
                sheld.style.removeProperty(p);
            });
            forceStyle(sheld, {
                position: 'fixed',
                top: `calc(${APP_NAV_H} + ${SCENE_H})`,
                bottom: '0',
                left: inset,
                right: inset,
                height: 'auto',
                'max-height': 'none',
                'min-height': '0',
                margin: '0',
                padding: '0',
                'z-index': '1120',
                transform: 'none',
            });
        }

        const form = document.getElementById('form_sheld');
        if (form && !document.body.classList.contains('et-vn-history-open')) {
            ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin', 'max-height', 'min-height'].forEach((p) => {
                form.style.removeProperty(p);
            });
            forceStyle(form, {
                position: 'fixed',
                left: inset,
                right: inset,
                bottom: '0',
                top: 'auto',
                width: 'auto',
                height: 'auto',
                'min-height': '0',
                'max-height': 'none',
                margin: '0',
                padding: '0 0.35rem 0',
                'z-index': '1140',
                transform: 'none',
            });
            const h = Math.ceil(form.getBoundingClientRect().height);
            if (h > 0) {
                document.documentElement.style.setProperty('--et-vn-send-dock-h', `${h}px`);
                document.body.style.setProperty('--et-vn-send-dock-h', `${h}px`);
            }
        }

        const send = document.getElementById('send_form');
        if (send) {
            forceStyle(send, {
                'margin-bottom': '0',
                'padding-bottom': '0',
                height: 'auto',
                'min-height': '0',
            });
        }
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
}

export function forceEtChrome() {
    ensureAppNav();
    pinChatSheld();
}

export function initEtForceChrome() {
    forceEtChrome();
    document.addEventListener('et-screen-changed', () => {
        forceEtChrome();
        requestAnimationFrame(() => forceEtChrome());
        setTimeout(forceEtChrome, 50);
        setTimeout(forceEtChrome, 250);
    });

    // Keep header + chat top bar alive even if something strips them later
    setInterval(() => {
        const nav = document.getElementById('et-app-nav');
        const navCs = nav ? getComputedStyle(nav) : null;
        const navRect = nav?.getBoundingClientRect();
        if (!nav
            || navCs.display === 'none'
            || navCs.visibility === 'hidden'
            || Number(navCs.opacity) === 0
            || (navRect && (navRect.height < 8 || navRect.top < -1 || navRect.top > 2))) {
            ensureAppNav();
        }
        if (document.body.firstElementChild !== document.getElementById('et-app-nav')) {
            ensureAppNav();
        }
        if (document.body.dataset.etScreen === 'chat') {
            pinChatTopBar();
            const topBar = document.getElementById('etChatTopBar');
            const tbCs = topBar ? getComputedStyle(topBar) : null;
            if (!topBar || tbCs.display === 'none' || tbCs.visibility === 'hidden') {
                pinChatTopBar();
            }
            pinChatSheld();
        }
    }, 500);
}
