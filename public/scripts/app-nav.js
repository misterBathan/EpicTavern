/**
 * EpicTavern screen router (Phase 1–2).
 * Exclusive full-viewport screens replace primary overlay drawers.
 */

import { eventSource, event_types } from './events.js';
import { ensureChatsScreen, initEtChatsScreen, refreshChatsScreen } from './et-chats-screen.js';

/** @typedef {'home' | 'chats' | 'chat' | 'connect' | 'characters' | 'world' | 'personas' | 'extensions' | 'timeline' | 'journal' | 'memory' | 'settings'} EtScreen */
/** @typedef {'general' | 'ai' | 'formatting' | 'backgrounds'} EtSettingsSection */

/**
 * @type {Record<EtScreen, { title: string, panelId: string | null, drawerId: string | null }>}
 */
export const ET_SCREENS = {
    home: {
        title: 'Home',
        panelId: null,
        drawerId: null,
    },
    chats: {
        title: 'Chats',
        panelId: 'et-chats-screen',
        drawerId: null,
    },
    chat: {
        title: 'Chat',
        panelId: null,
        drawerId: null,
    },
    connect: {
        title: 'Connect',
        panelId: 'rm_api_block',
        drawerId: 'sys-settings-button',
    },
    characters: {
        title: 'Characters',
        panelId: 'right-nav-panel',
        drawerId: 'rightNavHolder',
    },
    world: {
        title: 'World',
        panelId: 'WorldInfo',
        drawerId: 'WI-SP-button',
    },
    personas: {
        title: 'Personas',
        panelId: 'PersonaManagement',
        drawerId: 'persona-management-button',
    },
    extensions: {
        title: 'Extensions',
        panelId: 'rm_extensions_block',
        drawerId: 'extensions-settings-button',
    },
    timeline: {
        title: 'Timeline',
        panelId: 'et-timeline-screen',
        drawerId: null,
    },
    journal: {
        title: 'Journal',
        panelId: 'et-journal-screen',
        drawerId: null,
    },
    memory: {
        title: 'Memory',
        panelId: 'et-memory-screen',
        drawerId: null,
    },
    settings: {
        title: 'Settings',
        panelId: 'user-settings-block',
        drawerId: 'user-settings-button',
    },
};

/**
 * Settings hub sections → existing drawer panels (IDs preserved).
 * @type {Record<EtSettingsSection, { label: string, panelId: string, drawerId: string }>}
 */
export const ET_SETTINGS_SECTIONS = {
    general: {
        label: 'General',
        panelId: 'user-settings-block',
        drawerId: 'user-settings-button',
    },
    ai: {
        label: 'AI',
        panelId: 'left-nav-panel',
        drawerId: 'ai-config-button',
    },
    formatting: {
        label: 'Formatting',
        panelId: 'AdvancedFormatting',
        drawerId: 'advanced-formatting-button',
    },
    backgrounds: {
        label: 'Backgrounds',
        panelId: 'Backgrounds',
        drawerId: 'backgrounds-button',
    },
};

/** All panel IDs owned by the router (screens + settings sections). */
const SCREEN_PANEL_IDS = new Set([
    ...Object.values(ET_SCREENS).map(s => s.panelId).filter(Boolean),
    ...Object.values(ET_SETTINGS_SECTIONS).map(s => s.panelId),
]);

/** Drawer wrappers owned by the router. */
const SCREEN_DRAWER_IDS = new Set([
    ...Object.values(ET_SCREENS).map(s => s.drawerId).filter(Boolean),
    ...Object.values(ET_SETTINGS_SECTIONS).map(s => s.drawerId),
]);

/** @type {EtScreen} */
let currentScreen = 'home';
/** @type {EtSettingsSection} */
let currentSettingsSection = 'general';

/**
 * @param {string} [hash]
 * @returns {{ screen: EtScreen, settingsSection: EtSettingsSection }}
 */
export function parseRouteFromHash(hash = window.location.hash) {
    const raw = String(hash || '').replace(/^#\/?/, '');
    const parts = raw.split(/[/?#]/).filter(Boolean).map(p => p.toLowerCase());
    const screenPart = parts[0] || 'home';
    /** @type {EtScreen} */
    let screen = 'home';
    if (Object.prototype.hasOwnProperty.call(ET_SCREENS, screenPart)) {
        screen = /** @type {EtScreen} */ (screenPart);
    } else if (screenPart === 'extension') {
        screen = 'extensions';
    }
    // Legacy: #/chat without an active conversation meant the library
    if (screenPart === 'chat' && parts[1] === 'library') {
        screen = 'chats';
    }

    /** @type {EtSettingsSection} */
    let settingsSection = 'general';
    if (screen === 'settings' && parts[1] && Object.prototype.hasOwnProperty.call(ET_SETTINGS_SECTIONS, parts[1])) {
        settingsSection = /** @type {EtSettingsSection} */ (parts[1]);
    } else if (screen === 'settings' && parts[1] === 'extensions') {
        screen = 'extensions';
    }

    return { screen, settingsSection };
}

/** @deprecated use parseRouteFromHash */
export function parseScreenFromHash(hash = window.location.hash) {
    return parseRouteFromHash(hash).screen;
}

export function getCurrentScreen() {
    return currentScreen;
}

export function getCurrentSettingsSection() {
    return currentSettingsSection;
}

/**
 * @param {string | null | undefined} drawerOrPanelId
 * @returns {EtScreen | null}
 */
export function screenForDrawer(drawerOrPanelId) {
    if (!drawerOrPanelId) {
        return null;
    }
    for (const [name, meta] of Object.entries(ET_SCREENS)) {
        if (meta.drawerId === drawerOrPanelId || meta.panelId === drawerOrPanelId) {
            return /** @type {EtScreen} */ (name);
        }
    }
    for (const meta of Object.values(ET_SETTINGS_SECTIONS)) {
        if (meta.drawerId === drawerOrPanelId || meta.panelId === drawerOrPanelId) {
            return 'settings';
        }
    }
    return null;
}

/**
 * @param {string | null | undefined} drawerOrPanelId
 * @returns {EtSettingsSection | null}
 */
export function settingsSectionForDrawer(drawerOrPanelId) {
    if (!drawerOrPanelId) {
        return null;
    }
    for (const [name, meta] of Object.entries(ET_SETTINGS_SECTIONS)) {
        if (meta.drawerId === drawerOrPanelId || meta.panelId === drawerOrPanelId) {
            return /** @type {EtSettingsSection} */ (name);
        }
    }
    return null;
}

export function isScreenDrawer(drawerId) {
    return SCREEN_DRAWER_IDS.has(drawerId);
}

export function isScreenPanel(panelId) {
    return SCREEN_PANEL_IDS.has(panelId);
}

function closeLegacyDrawers() {
    $('.openDrawer:not(.pinnedOpen)').each(function () {
        if (!isScreenPanel(this.id)) {
            $(this).removeClass('openDrawer').addClass('closedDrawer');
        }
    });
    $('.openIcon:not(.drawerPinnedOpen)').each(function () {
        const panelId = $(this).closest('.drawer').find('.drawer-content').attr('id');
        if (!isScreenPanel(panelId)) {
            $(this).removeClass('openIcon').addClass('closedIcon');
        }
    });
}

function syncPanelOpenState(panelId, open) {
    const $panel = $(`#${panelId}`);
    const $drawer = $panel.closest('.drawer');
    const $icon = $drawer.length ? $drawer.find('.drawer-icon') : $();
    if (open) {
        $panel.removeClass('closedDrawer').addClass('openDrawer et-screen-active');
        $icon.removeClass('closedIcon').addClass('openIcon');
    } else {
        $panel.removeClass('openDrawer et-screen-active').addClass('closedDrawer');
        $icon.removeClass('openIcon').addClass('closedIcon');
    }
}

function ensureSettingsTabs() {
    let tabs = document.getElementById('et-settings-tabs');
    if (!tabs) {
        tabs = document.createElement('div');
        tabs.id = 'et-settings-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Settings sections');
        tabs.innerHTML = Object.entries(ET_SETTINGS_SECTIONS).map(([id, meta]) => `
            <button type="button" class="et-settings-tab" role="tab" data-et-settings-section="${id}">
                ${meta.label}
            </button>
        `).join('');
        document.body.appendChild(tabs);
    }
    return tabs;
}

/**
 * @param {EtScreen} screen
 * @param {{ updateHash?: boolean, settingsSection?: EtSettingsSection }} [options]
 */
export function navigate(screen, { updateHash = true, settingsSection } = {}) {
    if (!Object.prototype.hasOwnProperty.call(ET_SCREENS, screen)) {
        screen = 'home';
    }

    if (screen === 'settings') {
        if (settingsSection && Object.prototype.hasOwnProperty.call(ET_SETTINGS_SECTIONS, settingsSection)) {
            currentSettingsSection = settingsSection;
        }
        if (!Object.prototype.hasOwnProperty.call(ET_SETTINGS_SECTIONS, currentSettingsSection)) {
            currentSettingsSection = 'general';
        }
        // Extensions moved to AppNav — bounce legacy hash
        if (settingsSection === 'extensions' || /** @type {string} */ (currentSettingsSection) === 'extensions') {
            screen = 'extensions';
            currentSettingsSection = 'general';
        }
    }

    const previous = currentScreen;
    const previousSection = currentSettingsSection;
    currentScreen = screen;

    document.body.classList.add('et-shell');
    document.body.dataset.etScreen = screen;

    if (screen === 'settings') {
        document.body.dataset.etSettingsSection = currentSettingsSection;
        ensureSettingsTabs();
    } else {
        delete document.body.dataset.etSettingsSection;
    }

    if (screen !== 'chat' && screen !== 'home' && screen !== 'chats') {
        closeLegacyDrawers();
    }

    if (screen === 'chats') {
        ensureChatsScreen();
    }

    // Primary screen panels (excluding settings sections handled below)
    for (const [name, meta] of Object.entries(ET_SCREENS)) {
        if (!meta.panelId) {
            continue;
        }
        // Settings panel visibility is driven by section map
        if (name === 'settings') {
            continue;
        }
        const open = name === screen;
        syncPanelOpenState(meta.panelId, open);
        if (open && meta.panelId === 'right-nav-panel') {
            $('#rm_print_characters_block').trigger('scroll');
        }
        if (open && meta.panelId === 'et-chats-screen') {
            void refreshChatsScreen();
        }
    }

    // Settings hub sections
    for (const [section, meta] of Object.entries(ET_SETTINGS_SECTIONS)) {
        const open = screen === 'settings' && section === currentSettingsSection;
        syncPanelOpenState(meta.panelId, open);
    }

    $('#et-app-nav .et-nav-item').each(function () {
        const itemScreen = this.getAttribute('data-et-screen');
        // Journal / Timeline / Memory are chat-scoped destinations — keep Chats highlighted
        const chatScoped = screen === 'journal' || screen === 'timeline' || screen === 'memory' || screen === 'chat';
        const active = itemScreen === screen
            || (itemScreen === 'chats' && chatScoped);
        this.classList.toggle('is-active', active);
        this.setAttribute('aria-current', active ? 'page' : 'false');
    });

    $('#et-app-nav .et-nav-brand').toggleClass('is-active', screen === 'home');

    $('#et-settings-tabs .et-settings-tab').each(function () {
        const section = this.getAttribute('data-et-settings-section');
        const active = screen === 'settings' && section === currentSettingsSection;
        this.classList.toggle('is-active', active);
        this.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (updateHash) {
        const nextHash = screen === 'settings' && currentSettingsSection !== 'general'
            ? `#/settings/${currentSettingsSection}`
            : `#/${screen}`;
        if (window.location.hash !== nextHash) {
            history.replaceState(null, '', nextHash);
        }
    }

    if (previous !== screen || previousSection !== currentSettingsSection) {
        document.dispatchEvent(new CustomEvent('et-screen-changed', {
            detail: {
                screen,
                previous,
                settingsSection: currentSettingsSection,
                previousSettingsSection: previousSection,
            },
        }));
    }
}

/**
 * Navigate to a settings section (opens Settings screen).
 * @param {EtSettingsSection} section
 */
export function navigateSettings(section) {
    navigate('settings', { settingsSection: section });
}

export function initAppNav() {
    document.body.classList.add('et-shell');

    if (!document.getElementById('et-journal-screen')) {
        const journal = document.createElement('div');
        journal.id = 'et-journal-screen';
        journal.className = 'drawer-content closedDrawer';
        journal.setAttribute('aria-label', 'Journal');
        journal.innerHTML = '<div id="et-journal-root"></div>';
        document.body.appendChild(journal);
    }

    if (!document.getElementById('et-timeline-screen')) {
        const timeline = document.createElement('div');
        timeline.id = 'et-timeline-screen';
        timeline.className = 'drawer-content closedDrawer';
        timeline.setAttribute('aria-label', 'Timeline');
        timeline.innerHTML = '<div id="et-timeline-root" class="et-timeline-placeholder">Open a character chat to explore its timeline.</div>';
        document.body.appendChild(timeline);
    }

    if (!document.getElementById('et-timeline-settings')) {
        const timelineSettings = document.createElement('div');
        timelineSettings.id = 'et-timeline-settings';
        timelineSettings.className = 'drawer-content closedDrawer';
        timelineSettings.setAttribute('aria-label', 'Timeline settings');
        document.body.appendChild(timelineSettings);
    }

    if (!document.getElementById('et-memory-screen')) {
        const memory = document.createElement('div');
        memory.id = 'et-memory-screen';
        memory.className = 'drawer-content closedDrawer';
        memory.setAttribute('aria-label', 'Memory');
        memory.innerHTML = '<div id="et-memory-root"></div>';
        document.body.appendChild(memory);
    }

    if (!document.getElementById('et-app-nav')) {
        const nav = document.createElement('nav');
        nav.id = 'et-app-nav';
        nav.setAttribute('aria-label', 'EpicTavern');
        nav.innerHTML = `
            <div class="et-nav-brand" data-et-screen="home" title="EpicTavern Home">
                <span class="et-nav-brand-mark" aria-hidden="true"></span>
                <span class="et-nav-brand-text">EpicTavern</span>
            </div>
            <div class="et-nav-items" role="list">
                <button type="button" class="et-nav-item" data-et-screen="chats" role="listitem">
                    <i class="fa-solid fa-comments" aria-hidden="true"></i>
                    <span>Chats</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="characters" role="listitem">
                    <i class="fa-solid fa-address-card" aria-hidden="true"></i>
                    <span>Characters</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="world" role="listitem">
                    <i class="fa-solid fa-book-atlas" aria-hidden="true"></i>
                    <span>World</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="personas" role="listitem">
                    <i class="fa-solid fa-user" aria-hidden="true"></i>
                    <span>Personas</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="connect" role="listitem">
                    <i class="fa-solid fa-plug" aria-hidden="true"></i>
                    <span>Connect</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="extensions" role="listitem">
                    <i class="fa-solid fa-cubes" aria-hidden="true"></i>
                    <span>Extensions</span>
                </button>
                <button type="button" class="et-nav-item" data-et-screen="settings" role="listitem">
                    <i class="fa-solid fa-gear" aria-hidden="true"></i>
                    <span>Settings</span>
                </button>
            </div>
            <div class="et-nav-meta">
                <small id="version_display" class="et-nav-version" title="EpicTavern version"></small>
            </div>
        `;
        document.body.prepend(nav);
    }

    // Remove chat-scoped destinations from AppNav (belong in Chat Top Bar)
    document.querySelectorAll('#et-app-nav [data-et-screen="timeline"], #et-app-nav [data-et-screen="journal"], #et-app-nav [data-et-screen="memory"]').forEach((el) => el.remove());

    // Logo always goes Home
    const brand = document.querySelector('#et-app-nav .et-nav-brand');
    if (brand) {
        brand.setAttribute('data-et-screen', 'home');
        brand.setAttribute('title', 'EpicTavern Home');
    }

    // Upgrade Chat → Chats library nav item
    const legacyChatBtn = document.querySelector('#et-app-nav .et-nav-items [data-et-screen="chat"]');
    if (legacyChatBtn) {
        legacyChatBtn.setAttribute('data-et-screen', 'chats');
        const label = legacyChatBtn.querySelector('span');
        if (label) {
            label.textContent = 'Chats';
        }
    }

    // Upgrade older AppNav shells that predate Personas / Extensions / Home
    if (document.getElementById('et-app-nav') && !document.querySelector('#et-app-nav [data-et-screen="personas"]')) {
        const worldBtn = document.querySelector('#et-app-nav [data-et-screen="world"]');
        const personasBtn = document.createElement('button');
        personasBtn.type = 'button';
        personasBtn.className = 'et-nav-item';
        personasBtn.setAttribute('data-et-screen', 'personas');
        personasBtn.setAttribute('role', 'listitem');
        personasBtn.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i><span>Personas</span>';
        if (worldBtn?.parentElement) {
            worldBtn.insertAdjacentElement('afterend', personasBtn);
        }
    }

    if (document.getElementById('et-app-nav') && !document.querySelector('#et-app-nav .et-nav-items [data-et-screen="extensions"]')) {
        const connectBtn = document.querySelector('#et-app-nav [data-et-screen="connect"]');
        const extBtn = document.createElement('button');
        extBtn.type = 'button';
        extBtn.className = 'et-nav-item';
        extBtn.setAttribute('data-et-screen', 'extensions');
        extBtn.setAttribute('role', 'listitem');
        extBtn.innerHTML = '<i class="fa-solid fa-cubes" aria-hidden="true"></i><span>Extensions</span>';
        if (connectBtn?.parentElement) {
            connectBtn.insertAdjacentElement('afterend', extBtn);
        }
    }

    // Drop Timeline / Personas / Extensions from Settings hub (moved out)
    document.querySelectorAll('#et-settings-tabs [data-et-settings-section="timeline"], #et-settings-tabs [data-et-settings-section="personas"], #et-settings-tabs [data-et-settings-section="extensions"]').forEach((el) => el.remove());
    document.querySelectorAll('#et-app-nav .et-nav-phase').forEach((el) => el.remove());

    // Rebuild settings tabs if they still include removed sections
    const settingsTabs = document.getElementById('et-settings-tabs');
    if (settingsTabs) {
        const allowed = new Set(Object.keys(ET_SETTINGS_SECTIONS));
        settingsTabs.querySelectorAll('[data-et-settings-section]').forEach((tab) => {
            const id = tab.getAttribute('data-et-settings-section');
            if (!allowed.has(id)) {
                tab.remove();
            }
        });
    }

    ensureSettingsTabs();

    $(document)
        .off('click.etNav')
        .on('click.etNav', '#et-app-nav [data-et-screen]', function (e) {
            e.preventDefault();
            const screen = /** @type {EtScreen} */ (this.getAttribute('data-et-screen'));
            if (screen === 'settings') {
                navigate('settings', { settingsSection: currentSettingsSection || 'general' });
            } else {
                navigate(screen);
            }
        })
        .off('click.etSettingsTabs')
        .on('click.etSettingsTabs', '#et-settings-tabs [data-et-settings-section]', function (e) {
            e.preventDefault();
            const section = /** @type {EtSettingsSection} */ (this.getAttribute('data-et-settings-section'));
            navigateSettings(section);
        });

    window.addEventListener('hashchange', () => {
        const route = parseRouteFromHash();
        navigate(route.screen, {
            updateHash: false,
            settingsSection: route.settingsSection,
        });
    });

    eventSource.on(event_types.CHAT_CHANGED, (chatId) => {
        if (chatId) {
            if (currentScreen === 'characters' || currentScreen === 'home' || currentScreen === 'chats') {
                navigate('chat');
            }
            return;
        }
        if (currentScreen === 'chat') {
            navigate('chats');
        }
    });

    eventSource.on(event_types.OPEN_CHARACTER_LIBRARY, () => {
        navigate('characters');
    });

    initEtChatsScreen();
    reorganizeGeneralSettings();

    const route = parseRouteFromHash();
    // Default AppNav Chat target is the library; only stay on active Chat if already in one
    let initialScreen = route.screen;
    if (initialScreen === 'chat') {
        // Keep chat if hash says chat; otherwise library is #/chats
        initialScreen = 'chat';
    }
    navigate(initialScreen, {
        updateHash: true,
        settingsSection: route.settingsSection,
    });
}

/**
 * Restack General settings into accordion cards (once).
 */
function reorganizeGeneralSettings() {
    const content = document.getElementById('user-settings-block-content');
    if (!content || content.dataset.etSettingsReorg === '1') {
        return;
    }
    content.dataset.etSettingsReorg = '1';

    /** @type {{ selector: string, title: string, open?: boolean }[]} */
    const cards = [
        { selector: '[name="UserSettingsFirstColumn"]', title: 'Appearance', open: true },
        { selector: '[name="UserSettingsSecondColumn"]', title: 'Characters & tools', open: false },
        { selector: '[name="UserSettingsThirdColumn"]', title: 'Chat & messages', open: false },
    ];

    for (const card of cards) {
        const col = content.querySelector(card.selector);
        if (!col || col.closest('details.et-settings-card')) {
            continue;
        }
        const details = document.createElement('details');
        details.className = 'et-settings-card';
        details.open = Boolean(card.open);
        const summary = document.createElement('summary');
        summary.textContent = card.title;
        const body = document.createElement('div');
        body.className = 'et-settings-card-body';
        col.parentElement?.insertBefore(details, col);
        details.appendChild(summary);
        details.appendChild(body);
        body.appendChild(col);
    }
}
