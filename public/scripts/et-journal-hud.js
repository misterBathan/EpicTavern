/**
 * EpicTavern RPG Stage HUD — character status cards (left NPCs / right player)
 * and a bottom scene strip. Does not overlay dialogue; gutters reserve space.
 */

const STAGE_ID = 'et-rpg-stage';
const FLYOUT_ID = 'et-rpg-flyout';

/** @type {Record<string, { low: string, high: string }>} */
const DEFAULT_STAT_COLORS = {
    health: { low: '#a33a3a', high: '#ff6b6b' },
    hp: { low: '#a33a3a', high: '#ff6b6b' },
    stamina: { low: '#a8893a', high: '#f0d070' },
    energy: { low: '#a8893a', high: '#f0d070' },
    satiety: { low: '#9a7a30', high: '#e8c45a' },
    mana: { low: '#2a6aaa', high: '#6ec8ff' },
    mp: { low: '#2a6aaa', high: '#6ec8ff' },
    hygiene: { low: '#2a8a82', high: '#6ee8d8' },
    arousal: { low: '#a34570', high: '#ff7ab0' },
};

/**
 * @returns {HTMLElement}
 */
function ensureStage() {
    let stage = document.getElementById(STAGE_ID);
    if (stage) {
        return stage;
    }

    stage = document.createElement('div');
    stage.id = STAGE_ID;
    stage.innerHTML = `
        <div class="et-rpg-col et-rpg-col--chars" id="et-rpg-chars" aria-label="Present characters"></div>
        <div class="et-rpg-col et-rpg-col--player" id="et-rpg-player" aria-label="Player status"></div>
        <div class="et-rpg-scene" id="et-rpg-scene" aria-label="Scene"></div>
    `;
    document.body.appendChild(stage);

    let flyout = document.getElementById(FLYOUT_ID);
    if (!flyout) {
        flyout = document.createElement('div');
        flyout.id = FLYOUT_ID;
        flyout.hidden = true;
        flyout.innerHTML = `
            <div class="et-rpg-flyout-panel">
                <header class="et-rpg-flyout-head">
                    <span class="et-rpg-flyout-title"></span>
                    <button type="button" class="et-rpg-flyout-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                </header>
                <div class="et-rpg-flyout-body"></div>
            </div>
        `;
        document.body.appendChild(flyout);
        flyout.querySelector('.et-rpg-flyout-close')?.addEventListener('click', closeFlyout);
        flyout.addEventListener('click', (e) => {
            if (e.target === flyout) {
                closeFlyout();
            }
        });
    }

    return stage;
}

/**
 * @param {string} title
 * @param {string} sourceSelector
 */
function openFlyout(title, sourceSelector) {
    const flyout = document.getElementById(FLYOUT_ID);
    if (!flyout) {
        return;
    }
    const titleEl = flyout.querySelector('.et-rpg-flyout-title');
    const body = flyout.querySelector('.et-rpg-flyout-body');
    if (!(body instanceof HTMLElement)) {
        return;
    }
    closeFlyout();
    if (titleEl) {
        titleEl.textContent = title;
    }

    const source = document.querySelector(sourceSelector);
    if (source instanceof HTMLElement) {
        let parking = document.getElementById('et-rpg-parking');
        if (!parking) {
            parking = document.createElement('div');
            parking.id = 'et-rpg-parking';
            parking.hidden = true;
            document.body.appendChild(parking);
        }
        if (!source.parentElement?.id || source.parentElement.id !== 'et-rpg-parking') {
            // Remember original parent via marker sibling parking slot
            if (!source.dataset.etRpgParked) {
                const marker = document.createElement('div');
                marker.className = 'et-rpg-park-marker';
                marker.dataset.for = source.id || sourceSelector;
                source.parentElement?.insertBefore(marker, source);
                source.dataset.etRpgParked = '1';
            }
        }
        body.appendChild(source);
    } else {
        body.innerHTML = `<p class="et-rpg-flyout-empty">Nothing here yet.</p>`;
    }
    flyout.hidden = false;
}

function closeFlyout() {
    const flyout = document.getElementById(FLYOUT_ID);
    if (!flyout) {
        return;
    }
    const body = flyout.querySelector('.et-rpg-flyout-body');
    if (body) {
        body.querySelectorAll(':scope > [id^="rpg-"], :scope > [data-et-rpg-parked]').forEach((node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }
            const marker = document.querySelector(`.et-rpg-park-marker[data-for="${node.id}"]`)
                || document.querySelector(`.et-rpg-park-marker[data-for="#${node.id}"]`);
            if (marker?.parentElement) {
                marker.parentElement.insertBefore(node, marker);
                marker.remove();
                delete node.dataset.etRpgParked;
            } else {
                const parking = document.getElementById('et-rpg-parking');
                parking?.appendChild(node);
            }
        });
        body.innerHTML = '';
    }
    flyout.hidden = true;
}

function openTrackerEditor() {
    const btn = document.querySelector('#rpg-open-tracker-editor, #rpg-header-tracker-editor');
    if (btn instanceof HTMLElement) {
        btn.click();
        return;
    }
    // Fallback: open RPG settings gear if present
    document.querySelector('#rpg-companion-panel .rpg-panel-header-actions .fa-gear, #rpg-companion-panel .rpg-btn-icon .fa-gear')
        ?.closest('button, .rpg-btn-icon, .menu_button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * @param {string} idOrName
 * @param {{ color?: string, colorLow?: string, colorHigh?: string } | null} [stat]
 */
function colorsForStat(idOrName, stat = null) {
    const key = String(idOrName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const defaults = DEFAULT_STAT_COLORS[key] || { low: '#8a7340', high: '#e0c989' };
    // Ignore legacy muddy defaults from earlier EpicTavern builds
    const legacyDark = new Set([
        '#5a1818', '#c43c3c', '#5c4818', '#c4a35a', '#4a3a18', '#b8923e',
        '#1a3a5c', '#3a8fd4', '#2a4a4a', '#5bb8b0', '#5a1840', '#c45a8a', '#3a3428',
    ]);
    const low = String(stat?.colorLow || '').toLowerCase();
    const high = String(stat?.colorHigh || '').toLowerCase();
    if (stat?.colorLow && stat?.colorHigh && !legacyDark.has(low) && !legacyDark.has(high)) {
        return { low: stat.colorLow, high: stat.colorHigh };
    }
    if (stat?.color && !legacyDark.has(String(stat.color).toLowerCase())) {
        return { low: shade(stat.color, -0.25), high: stat.color };
    }
    return defaults;
}

/**
 * @param {string} hex
 * @param {number} amount negative darkens
 */
function shade(hex, amount) {
    const raw = hex.replace('#', '');
    if (raw.length !== 6) {
        return hex;
    }
    const num = parseInt(raw, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amount)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amount)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amount)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * @param {Array<{ id?: string, name: string, value: number, max?: number, color?: string, colorLow?: string, colorHigh?: string }>} bars
 */
function barsHtml(bars) {
    return bars.map((bar) => {
        const max = bar.max || 100;
        const value = Number.isFinite(bar.value) ? bar.value : 0;
        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        const colors = colorsForStat(bar.id || bar.name, bar);
        const display = Number.isInteger(max) && max !== 100
            ? `${Math.round(value)}/${max}`
            : `${Math.round(pct)}%`;
        return `
            <div class="et-rpg-bar" title="${escapeAttr(bar.name)}">
                <div class="et-rpg-bar-label">${escapeHtml(bar.name)}</div>
                <div class="et-rpg-bar-track" style="--et-bar-low:${colors.low};--et-bar-high:${colors.high}">
                    <div class="et-rpg-bar-fill" style="width:${pct}%"></div>
                    <span class="et-rpg-bar-value">${display}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * @param {{ portrait: string, name: string, bars: any[], actions: Array<{ id: string, label: string, icon: string }>, kind: 'player'|'npc', meta?: string }} opts
 */
function cardHtml(opts) {
    const actions = opts.actions.map((a) => `
        <button type="button" class="et-rpg-action" data-et-rpg-action="${a.id}" title="${escapeAttr(a.label)}" aria-label="${escapeAttr(a.label)}">
            <i class="${a.icon}" aria-hidden="true"></i>
        </button>
    `).join('');

    return `
        <article class="et-rpg-card et-rpg-card--${opts.kind}">
            <div class="et-rpg-card-portrait">
                <img src="${escapeAttr(opts.portrait)}" alt="">
            </div>
            <div class="et-rpg-card-body">
                <div class="et-rpg-card-name">${escapeHtml(opts.name)}</div>
                ${opts.meta ? `<div class="et-rpg-card-meta">${escapeHtml(opts.meta)}</div>` : ''}
                <div class="et-rpg-card-bars">${barsHtml(opts.bars)}</div>
                <div class="et-rpg-card-actions">${actions}</div>
            </div>
        </article>
    `;
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {string} value
 */
function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
}

async function loadRpgModules() {
    const state = await import('./rpg/src/core/state.js');
    const present = await import('./rpg/src/utils/presentCharacters.js');
    const avatars = await import('./rpg/src/utils/avatars.js');
    return { state, present, avatars };
}

async function refreshHud() {
    const stage = ensureStage();
    const screen = document.body.dataset.etScreen;
    const active = screen === 'chat' && !document.body.classList.contains('et-rpg-no-active-chat');
    stage.classList.toggle('is-active', active);
    if (!active) {
        closeFlyout();
        return;
    }

    let mods;
    try {
        mods = await loadRpgModules();
    } catch (error) {
        console.warn('[EpicTavern] RPG HUD modules unavailable', error);
        return;
    }

    const { extensionSettings, lastGeneratedData, committedTrackerData, FALLBACK_AVATAR_DATA_URI } = mods.state;
    const charsEl = stage.querySelector('#et-rpg-chars');
    const playerEl = stage.querySelector('#et-rpg-player');
    const sceneEl = stage.querySelector('#et-rpg-scene');
    if (!(charsEl instanceof HTMLElement) || !(playerEl instanceof HTMLElement) || !(sceneEl instanceof HTMLElement)) {
        return;
    }

    // --- Player card ---
    const userConfig = extensionSettings.trackerConfig?.userStats || {};
    const enabledStats = (userConfig.customStats || []).filter((s) => s && s.enabled && s.name && s.id);
    const userStats = extensionSettings.userStats || {};
    const displayMode = userConfig.statsDisplayMode || 'percentage';
    const playerBars = enabledStats.slice(0, 5).map((stat) => {
        const max = stat.maxValue || 100;
        let value = userStats[stat.id];
        if (value === undefined || value === null) {
            value = displayMode === 'number' ? max : 100;
        }
        return {
            id: stat.id,
            name: stat.name,
            value: Number(value),
            max: displayMode === 'number' ? max : 100,
            color: stat.color,
            colorLow: stat.colorLow,
            colorHigh: stat.colorHigh,
        };
    });

    let playerPortrait = FALLBACK_AVATAR_DATA_URI;
    try {
        const { user_avatar } = await import('../script.js');
        if (user_avatar) {
            const url = mods.avatars.getSafeThumbnailUrl('persona', user_avatar);
            if (url) {
                playerPortrait = url;
            }
        }
    } catch {
        // ignore
    }

    let playerName = 'You';
    try {
        const { getContext } = await import('./extensions.js');
        playerName = getContext()?.name1 || playerName;
    } catch {
        // ignore
    }

    const level = extensionSettings.level;
    const mood = userStats.mood ? String(userStats.mood) : '';
    const playerMeta = [
        userConfig.showLevel !== false && level != null ? `Lv ${level}` : '',
        mood,
    ].filter(Boolean).join(' · ');

    playerEl.innerHTML = cardHtml({
        kind: 'player',
        portrait: playerPortrait,
        name: playerName,
        meta: playerMeta,
        bars: playerBars,
        actions: [
            { id: 'skills', label: 'Skills', icon: 'fa-solid fa-hand-fist' },
            { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-briefcase' },
            { id: 'quests', label: 'Quests', icon: 'fa-solid fa-scroll' },
        ],
    });

    playerEl.querySelectorAll('[data-et-rpg-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-et-rpg-action');
            if (action === 'skills') {
                openFlyout('Skills', '#rpg-user-stats');
            } else if (action === 'inventory') {
                openFlyout('Inventory', '#rpg-inventory');
            } else if (action === 'quests') {
                openFlyout('Quests', '#rpg-quests');
            }
        });
    });

    // --- Character cards ---
    const presentConfig = extensionSettings.trackerConfig?.presentCharacters || {};
    const charStatsConfig = presentConfig.characterStats;
    const enabledCharStats = charStatsConfig?.enabled
        ? (charStatsConfig.customStats || []).filter((s) => s && s.enabled && s.name)
        : [];
    const enabledFields = (presentConfig.customFields || []).filter((f) => f && f.enabled);

    const thoughtsData = mods.present.getPresentCharactersTrackerData({ useCommittedFallback: true });
    const presentCharacters = mods.present.parsePresentCharacters(thoughtsData, {
        enabledFields,
        enabledCharStats,
    });

    // Fallback: active chat character when no present list yet
    if (!presentCharacters.length) {
        try {
            const { characters, this_chid } = await import('../script.js');
            const active = this_chid !== undefined ? characters?.[this_chid] : null;
            if (active?.name) {
                presentCharacters.push({ name: active.name, emoji: '👤' });
            }
        } catch {
            // ignore
        }
    }

    charsEl.innerHTML = '';
    for (const char of presentCharacters.slice(0, 6)) {
        const portrait = mods.present.resolvePresentCharacterPortrait(char.name) || FALLBACK_AVATAR_DATA_URI;
        /** @type {any[]} */
        const bars = [];
        if (enabledCharStats.length) {
            for (const stat of enabledCharStats.slice(0, 4)) {
                let value = 100;
                if (char.stats && typeof char.stats === 'object') {
                    const hit = Object.values(char.stats).find((s) => s && (s.name === stat.name || s.id === stat.id));
                    if (hit && hit.value != null) {
                        value = Number(hit.value);
                    }
                }
                if (char[stat.name] != null) {
                    value = Number(String(char[stat.name]).replace('%', ''));
                }
                bars.push({
                    id: stat.id || stat.name,
                    name: stat.name,
                    value: Number.isFinite(value) ? value : 100,
                    max: 100,
                    color: stat.color,
                    colorLow: stat.colorLow,
                    colorHigh: stat.colorHigh,
                });
            }
        } else {
            // Sensible defaults until character stats are enabled in tracker config
            bars.push(
                { id: 'health', name: 'Health', value: 100, max: 100 },
                { id: 'stamina', name: 'Stamina', value: 100, max: 100 },
                { id: 'mana', name: 'Mana', value: 100, max: 100 },
            );
        }

        const wrap = document.createElement('div');
        wrap.innerHTML = cardHtml({
            kind: 'npc',
            portrait,
            name: char.name || 'Character',
            meta: char.emoji || '',
            bars,
            actions: [
                { id: 'presence', label: 'Presence', icon: 'fa-solid fa-eye' },
                { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-briefcase' },
                { id: 'thoughts', label: 'Details', icon: 'fa-solid fa-comment' },
            ],
        });
        const card = wrap.firstElementChild;
        if (card) {
            card.querySelectorAll('[data-et-rpg-action]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const action = btn.getAttribute('data-et-rpg-action');
                    if (action === 'presence' || action === 'thoughts') {
                        openFlyout(char.name || 'Presence', '#rpg-thoughts');
                    } else if (action === 'inventory') {
                        openFlyout('Inventory', '#rpg-inventory');
                    }
                });
            });
            charsEl.appendChild(card);
        }
    }

    // --- Scene strip (weather / place / time) ---
    const infoRaw = lastGeneratedData.infoBox || committedTrackerData.infoBox || extensionSettings.infoBox || '';
    let info = {};
    try {
        info = typeof infoRaw === 'string' ? JSON.parse(infoRaw) : (infoRaw || {});
    } catch {
        info = {};
    }
    const widgets = extensionSettings.trackerConfig?.infoBox?.widgets || {};
    const bits = [];

    const weather = info.weather;
    const temperature = info.temperature;
    if (widgets.weather?.enabled !== false && weather) {
        const sky = String(weather.forecast || weather.value || '').trim();
        const emoji = String(weather.emoji || '☀️').trim();
        let tempHtml = '';
        if (widgets.temperature?.enabled !== false && temperature && (temperature.value != null && temperature.value !== '')) {
            const unit = temperature.unit || 'C';
            tempHtml = `<span class="et-rpg-scene-temp">${escapeHtml(`${temperature.value}°${unit}`)}</span>`;
        }
        bits.push(`
            <div class="et-rpg-scene-weather">
                <div class="et-rpg-scene-sky">
                    <span class="et-rpg-scene-sky-icon" aria-hidden="true">${escapeHtml(emoji)}</span>
                    <span>${escapeHtml(sky || 'Clear skies')}</span>
                </div>
                ${tempHtml}
            </div>
        `);
    } else if (widgets.temperature?.enabled !== false && temperature && temperature.value != null) {
        const unit = temperature.unit || 'C';
        bits.push(`<span class="et-rpg-scene-bit">${escapeHtml(`${temperature.value}°${unit}`)}</span>`);
    }

    if (widgets.time?.enabled !== false && info.time) {
        const tm = info.time;
        const start = String(tm.start || tm.value || '').trim();
        const end = String(tm.end || '').trim();
        // Prefer a single clock reading — only show a range when end differs
        const clock = start && end && end !== start ? `${start}–${end}` : (start || end);
        if (clock) {
            bits.push(`<span class="et-rpg-scene-bit"><i class="fa-regular fa-clock"></i> ${escapeHtml(clock)}</span>`);
        }
    }
    if (widgets.date?.enabled !== false && info.date) {
        bits.push(`<span class="et-rpg-scene-bit">${escapeHtml(info.date.value || info.date)}</span>`);
    }
    if (widgets.location?.enabled !== false && info.location) {
        bits.push(`<span class="et-rpg-scene-bit"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(info.location.value || info.location)}</span>`);
    }
    sceneEl.innerHTML = bits.length
        ? bits.join('')
        : '<span class="et-rpg-scene-bit et-rpg-scene-muted">Scene updates appear here</span>';
}

let refreshTimer = 0;
function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void refreshHud(), 80);
}

export function initEtJournalHud() {
    ensureStage();
    scheduleRefresh();

    const root = document.getElementById('rpg-companion-panel') || document.body;
    const obs = new MutationObserver(() => scheduleRefresh());
    obs.observe(root, { childList: true, subtree: true, characterData: true });

    document.addEventListener('et-screen-changed', () => scheduleRefresh());
    window.addEventListener('hashchange', () => scheduleRefresh());
}

initEtJournalHud();
