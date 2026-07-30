/**
 * EpicTavern Journal HUD — expandable stage cards on Chat (not a side bar).
 */

const SECTION_SELECTORS = [
    '#rpg-user-stats',
    '#rpg-info-box',
    '#rpg-thoughts',
    '#rpg-inventory',
    '#rpg-quests',
    '#rpg-music-player',
];

const LABELS = {
    'rpg-user-stats': 'Status',
    'rpg-info-box': 'Scene',
    'rpg-thoughts': 'Presence',
    'rpg-inventory': 'Inventory',
    'rpg-quests': 'Quests',
    'rpg-music-player': 'Music',
};

/**
 * @param {HTMLElement} section
 */
function ensureCardChrome(section) {
    section.classList.add('et-rpg-card');
    if (section.querySelector(':scope > .et-rpg-card-toggle')) {
        return;
    }
    const id = section.id || '';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'et-rpg-card-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `<span class="et-rpg-card-label">${LABELS[id] || 'Journal'}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = section.classList.contains('is-open');
        document.querySelectorAll('#rpg-companion-panel .et-rpg-card.is-open').forEach((card) => {
            card.classList.remove('is-open');
            const btn = card.querySelector('.et-rpg-card-toggle');
            if (btn instanceof HTMLElement) {
                btn.setAttribute('aria-expanded', 'false');
            }
        });
        if (!open) {
            section.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
        }
    });
    section.insertBefore(toggle, section.firstChild);
}

function upgrade() {
    const panel = document.getElementById('rpg-companion-panel');
    if (!panel) {
        return;
    }
    panel.classList.add('et-rpg-hud');
    SECTION_SELECTORS.forEach((sel) => {
        const el = panel.querySelector(sel);
        if (el instanceof HTMLElement) {
            ensureCardChrome(el);
        }
    });
    panel.querySelectorAll('.rpg-divider').forEach((d) => d.classList.add('et-rpg-hide-on-chat'));
}

export function initEtJournalHud() {
    upgrade();
    const root = document.getElementById('rpg-companion-panel') || document.body;
    const obs = new MutationObserver(() => upgrade());
    obs.observe(root, { childList: true, subtree: true });
    document.addEventListener('et-screen-changed', () => setTimeout(upgrade, 0));
}

initEtJournalHud();
