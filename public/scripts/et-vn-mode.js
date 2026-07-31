/**
 * EpicTavern Visual Novel mode.
 * Hooks into power_user.waifuMode / body.waifuMode.
 * Shows a large left sprite (expressions), a dialogue box ABOVE the send dock
 * (never overlapping), and a history popup of the normal chat transcript.
 */

import { eventSource, event_types } from './events.js';
import { t } from './i18n.js';

const DIALOGUE_ID = 'et-vn-dialogue';
const HISTORY_BTN_ID = 'et-vn-history-btn';
const HISTORY_BAR_ID = 'et-vn-history-bar';

function hasOpenChatSession() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        if (!ctx || typeof ctx.getCurrentChatId !== 'function') {
            return false;
        }
        return !!ctx.getCurrentChatId();
    } catch {
        return false;
    }
}

function isVnActive() {
    return document.body.classList.contains('waifuMode')
        && document.body.dataset.etScreen === 'chat'
        && !document.body.classList.contains('et-rpg-no-active-chat')
        && hasOpenChatSession();
}

function ensureDialogueBox() {
    let box = document.getElementById(DIALOGUE_ID);
    if (box) {
        return box;
    }

    box = document.createElement('aside');
    box.id = DIALOGUE_ID;
    box.className = 'et-vn-dialogue';
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = `
        <div class="et-vn-dialogue-chrome">
            <div class="et-vn-dialogue-name" id="et-vn-dialogue-name"></div>
            <button type="button" class="et-vn-history-btn" id="${HISTORY_BTN_ID}" title="${t`Previous dialogue`}">
                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                <span>${t`History`}</span>
            </button>
        </div>
        <div class="et-vn-dialogue-text" id="et-vn-dialogue-text"></div>
    `;
    document.body.appendChild(box);

    document.getElementById(HISTORY_BTN_ID)?.addEventListener('click', () => {
        if (document.body.classList.contains('et-vn-history-open')) {
            closeHistoryOverlay();
        } else {
            openHistoryOverlay();
        }
    });

    return box;
}

/**
 * Park dialogue inside #sheld above #form_sheld so it can never cover the send box.
 */
function placeDialogueInSheld() {
    const box = ensureDialogueBox();
    const sheld = document.getElementById('sheld');
    const form = document.getElementById('form_sheld');

    if (!isVnActive() || !sheld || !form) {
        if (box.parentElement !== document.body) {
            document.body.appendChild(box);
        }
        return;
    }

    // Dialogue is fixed above the send dock — keep it on body so sheld layout cannot bury it
    if (box.parentElement !== document.body) {
        document.body.appendChild(box);
    }
}

/**
 * Measure send dock and expose CSS var for any fixed fallback positioning.
 */
function syncSendDockHeight() {
    const form = document.getElementById('form_sheld');
    if (!(form instanceof HTMLElement)) {
        return;
    }
    const h = Math.ceil(form.getBoundingClientRect().height);
    if (h > 0) {
        document.documentElement.style.setProperty('--et-vn-send-dock-h', `${h}px`);
        document.body.style.setProperty('--et-vn-send-dock-h', `${h}px`);
    }
}

/**
 * Latest non-user message in #chat (character line for VN dialogue).
 * Skips welcome / system / assistant greeting chrome.
 * @returns {{ name: string, html: string } | null}
 */
function getLatestCharacterBeat() {
    const nodes = [...document.querySelectorAll('#chat > .mes')];
    for (let i = nodes.length - 1; i >= 0; i--) {
        const mes = nodes[i];
        if (mes.getAttribute('is_user') === 'true') {
            continue;
        }
        if (mes.getAttribute('is_system') === 'true' || mes.classList.contains('welcomePanel')) {
            continue;
        }
        const name = mes.querySelector('.name_text')?.textContent?.trim()
            || mes.getAttribute('ch_name')
            || '';
        if (!name || /sillytavern system/i.test(name)) {
            continue;
        }
        const textEl = mes.querySelector('.mes_text');
        if (!textEl) {
            continue;
        }
        const plain = textEl.textContent || '';
        if (/welcome page assistant/i.test(plain) || /try asking me something/i.test(plain)) {
            continue;
        }
        const mesId = Number(mes.getAttribute('mesid'));
        if (Number.isFinite(mesId)) {
            try {
                const chatMsg = globalThis.SillyTavern?.getContext?.()?.chat?.[mesId];
                const type = chatMsg?.extra?.type;
                if (type === 'assistant_message' || type === 'assistant_note') {
                    continue;
                }
            } catch {
                // ignore
            }
        }
        return { name, html: textEl.innerHTML };
    }
    return null;
}

/**
 * Strip RPG tracker dumps and format VN dialogue:
 * - `*environment/actions*` → muted
 * - `"speech"` → normal weight
 * - collapse accidental `""` → `"`
 * @param {string} html
 * @returns {string}
 */
function formatVnDialogueHtml(html) {
    if (!html) {
        return '';
    }

    let out = html;

    // Drop fenced tracker dumps (complete or truncated ```json …)
    out = out.replace(/```(?:json|markdown)?[\s\S]*?```/gi, '');
    out = out.replace(/```(?:json|markdown)?[\s\S]*$/gi, '');
    out = out.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, '');
    out = out.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, (block) => {
        if (/userStats|infoBox|characterThoughts|presentCharacters|"stats"\s*:/i.test(block)) {
            return '';
        }
        return block;
    });
    // Bare trailing fence label the model left behind
    out = out.replace(/(?:<br\s*\/?>|\n|\s)*```(?:json|markdown)?\s*$/gi, '');
    out = out.replace(/(?:<p>\s*)?```(?:json|markdown)?\s*(?:<\/p>)?/gi, '');

    // Collapse doubled quotes repeatedly (entities + ASCII + curly)
    let prev = '';
    while (prev !== out) {
        prev = out;
        out = out
            .replace(/(?:&quot;|&#34;|&#x22;){2,}/gi, '"')
            .replace(/"{2,}/g, '"')
            .replace(/[“„]{2,}/g, '“')
            .replace(/”{2,}/g, '”');
    }

    // Literal *action* left unconverted by markdown → muted span
    out = out.replace(/\*([^*\n]{1,400}?)\*/g, (full, inner, offset, whole) => {
        const before = whole[offset - 1] || '';
        const after = whole[offset + full.length] || '';
        if (/[\w*]/.test(before) || /[\w*]/.test(after)) {
            return full;
        }
        const head = whole.slice(Math.max(0, offset - 120), offset);
        if ((head.match(/</g) || []).length > (head.match(/>/g) || []).length) {
            return full;
        }
        return `<span class="et-vn-action">${inner}</span>`;
    });

    // Wrap spoken lines — strip any leftover quote chars from the inner text
    out = out.replace(/(?:"|“|”)([^"“”\n]{1,800}?)(?:"|“|”)/g, (full, inner, offset, whole) => {
        const before = whole.slice(Math.max(0, offset - 200), offset);
        const open = (before.match(/</g) || []).length;
        const close = (before.match(/>/g) || []).length;
        if (open > close) {
            return full;
        }
        if (/[=\w]\s*$/.test(before) || /:\s*$/.test(before)) {
            return full;
        }
        const cleaned = String(inner).replace(/^[\s"“”„]+/, '').replace(/[\s"“”„]+$/, '');
        return `<span class="et-vn-speech">"${cleaned}"</span>`;
    });

    // Mark existing <em>/<i> as action/environment (muted via CSS)
    out = out.replace(/<(em|i)(\s[^>]*)?>/gi, (full, tag, attrs = '') => {
        if (/et-vn-action/.test(attrs)) {
            return full;
        }
        if (/class\s*=\s*(['"])/i.test(attrs)) {
            return `<${tag}${attrs.replace(/class\s*=\s*(['"])/i, 'class=$1et-vn-action ')}>`;
        }
        return `<${tag} class="et-vn-action"${attrs}>`;
    });

    return out.trim();
}

function syncDialogueBox() {
    const box = ensureDialogueBox();
    placeDialogueInSheld();
    syncSendDockHeight();

    const active = isVnActive() && !document.body.classList.contains('et-vn-history-open');
    box.classList.toggle('is-active', active);
    const wasActive = document.body.classList.contains('et-vn-active');
    const wantVn = isVnActive();
    if (wantVn !== wasActive) {
        document.body.classList.toggle('et-vn-active', wantVn);
    }

    if (!active) {
        if (document.body.classList.contains('et-vn-history-open')) {
            box.style.setProperty('display', 'none', 'important');
            box.style.setProperty('visibility', 'hidden', 'important');
        }
        return;
    }

    box.style.removeProperty('display');
    box.style.removeProperty('visibility');

    const beat = getLatestCharacterBeat();
    const nameEl = document.getElementById('et-vn-dialogue-name');
    const textEl = document.getElementById('et-vn-dialogue-text');
    if (!nameEl || !textEl) {
        return;
    }

    if (!beat) {
        nameEl.textContent = '';
        textEl.innerHTML = `<span class="et-vn-dialogue-empty">${t`Waiting for the next line…`}</span>`;
        return;
    }

    nameEl.textContent = beat.name;
    textEl.innerHTML = formatVnDialogueHtml(beat.html);
    textEl.scrollTop = textEl.scrollHeight;
}

async function openHistoryPopup() {
    openHistoryOverlay();
}

/**
 * Show the real #chat transcript (existing message panels).
 * Hides the VN dialogue box. Close via the bottom bar, Escape, or History again.
 */
function openHistoryOverlay() {
    if (!document.body.classList.contains('waifuMode')) {
        return;
    }
    document.body.classList.add('et-vn-history-open');

    const box = document.getElementById(DIALOGUE_ID);
    if (box) {
        box.classList.remove('is-active');
        box.style.setProperty('display', 'none', 'important');
        box.style.setProperty('visibility', 'hidden', 'important');
    }

    ensureHistoryBar();
    const chat = document.getElementById('chat');
    if (chat instanceof HTMLElement) {
        chat.style.removeProperty('display');
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }
    try {
        import('./et-force-chrome.js').then((m) => m.forceEtChrome?.()).catch(() => { /* ignore */ });
    } catch {
        // ignore
    }
}

function closeHistoryOverlay() {
    if (!document.body.classList.contains('et-vn-history-open')) {
        return;
    }
    document.body.classList.remove('et-vn-history-open');
    document.getElementById(HISTORY_BAR_ID)?.remove();
    const box = document.getElementById(DIALOGUE_ID);
    if (box) {
        box.style.removeProperty('display');
        box.style.removeProperty('visibility');
    }
    refreshEtVnMode();
}

function ensureHistoryBar() {
    let bar = document.getElementById(HISTORY_BAR_ID);
    if (!bar) {
        bar = document.createElement('div');
        bar.id = HISTORY_BAR_ID;
        bar.className = 'et-vn-history-bar';
        bar.innerHTML = `
            <span class="et-vn-history-bar-title">${t`Chat history`}</span>
            <button type="button" class="et-vn-history-close menu_button" id="et-vn-history-close">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                <span>${t`Close history`}</span>
            </button>
        `;
        document.body.appendChild(bar);
        bar.querySelector('#et-vn-history-close')?.addEventListener('click', () => {
            closeHistoryOverlay();
        });
    }
    if (bar.parentElement !== document.body) {
        document.body.appendChild(bar);
    }
    return bar;
}

function forceExpressionsVisible() {
    // VN requires expression sprites — fully undo RPG "hide default expressions"
    const styleId = 'et-vn-force-expressions';
    let style = document.getElementById(styleId);
    if (!isVnActive()) {
        style?.remove();
        return;
    }

    document.getElementById('rpg-hidden-native-expression-display-style')?.remove();

    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    style.textContent = `
        body.et-shell.et-vn-active #expression-wrapper {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            justify-content: center !important;
            pointer-events: none !important;
        }
        body.et-shell.et-vn-active #expression-holder,
        body.et-shell.et-vn-active .expression-holder {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: absolute !important;
            left: 50% !important;
            right: auto !important;
            top: auto !important;
            bottom: 0 !important;
            transform: translateX(-50%) !important;
            width: auto !important;
            height: calc(100dvh - 6.1rem) !important;
            max-height: calc(100dvh - 6.1rem) !important;
            max-width: min(56vw, 42rem) !important;
            min-width: 0 !important;
            min-height: 0 !important;
            overflow: visible !important;
            justify-content: center !important;
            pointer-events: none !important;
        }
        body.et-shell.et-vn-active #expression-image,
        body.et-shell.et-vn-active #expression-image.expression,
        body.et-shell.et-vn-active .expression-holder img {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            transform: none !important;
            width: auto !important;
            height: 100% !important;
            max-height: calc(100dvh - 6.1rem) !important;
            max-width: min(56vw, 42rem) !important;
            min-width: 0 !important;
            min-height: 0 !important;
            overflow: visible !important;
            object-fit: contain !important;
            object-position: center bottom !important;
        }
    `;

    const holder = document.getElementById('expression-holder');
    if (holder) {
        holder.style.removeProperty('display');
        holder.style.setProperty('display', 'flex', 'important');
    }
}

/**
 * Emotion → fallback labels when a classified emotion's sprite fails / is missing.
 */
const EXPRESSION_FALLBACKS = {
    sadness: ['sadness', 'grief', 'disappointment', 'remorse', 'fear', 'neutral', 'joy'],
    grief: ['grief', 'sadness', 'disappointment', 'remorse', 'neutral', 'joy'],
    disappointment: ['disappointment', 'sadness', 'remorse', 'neutral', 'joy'],
    remorse: ['remorse', 'sadness', 'grief', 'neutral', 'joy'],
    anger: ['anger', 'annoyance', 'disapproval', 'disgust', 'neutral'],
    fear: ['fear', 'nervousness', 'embarrassment', 'neutral', 'joy'],
    joy: ['joy', 'amusement', 'excitement', 'caring', 'neutral'],
};

/**
 * Repair / show the VN sprite. Prefer the last classified expression; never blank the image.
 */
async function ensureVnSprite() {
    if (!isVnActive()) {
        return;
    }

    forceExpressionsVisible();

    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const chid = ctx?.characterId;
        const name = ctx?.name2
            || (chid !== undefined && ctx?.characters?.[chid]?.name)
            || '';
        if (!name) {
            return;
        }

        const holder = document.getElementById('expression-holder');
        let img = document.getElementById('expression-image');
        if (!img && holder) {
            img = holder.querySelector('img.expression') || holder.querySelector('img');
        }
        if (!(img instanceof HTMLImageElement) || !holder) {
            return;
        }

        // If a healthy sprite is already showing, leave it alone
        const hasFace = Boolean(img.getAttribute('src')) && img.naturalWidth > 0;
        let want = img.dataset.expression || '';
        try {
            const mod = await import('./extensions/expressions/index.js');
            want = mod.lastExpression?.[name]
                || mod.lastExpression?.[String(name).split('/')[0]]
                || want
                || 'neutral';
        } catch {
            want = want || 'neutral';
        }

        // Only fetch/replace when broken/empty, or when the desired emotion differs
        const currentLabel = (img.dataset.expression || '').toLowerCase();
        if (hasFace && currentLabel && currentLabel === String(want).toLowerCase()) {
            return;
        }

        const result = await fetch(`/api/sprites/get?name=${encodeURIComponent(name)}`);
        /** @type {{ label: string, path: string }[]} */
        const sprites = result.ok ? (await result.json()) : [];
        if (!sprites.length) {
            return;
        }

        const chain = EXPRESSION_FALLBACKS[String(want).toLowerCase()]
            || [want, 'neutral', 'joy', 'caring', 'sadness'];
        let sprite = null;
        for (const label of chain) {
            sprite = sprites.find((s) => String(s.label).toLowerCase() === String(label).toLowerCase());
            if (sprite) {
                break;
            }
        }
        if (!sprite) {
            sprite = sprites[0];
        }
        if (!sprite?.path) {
            return;
        }

        const previousSrc = img.getAttribute('src') || '';
        holder.style.setProperty('display', 'flex', 'important');
        img.style.setProperty('display', 'block', 'important');
        img.style.setProperty('visibility', 'visible', 'important');
        img.style.setProperty('opacity', '1', 'important');
        img.alt = '';
        img.removeAttribute('title');
        img.onerror = () => {
            img.onerror = null;
            if (previousSrc) {
                img.src = previousSrc;
            }
        };
        if (img.getAttribute('src') !== sprite.path) {
            img.src = sprite.path;
        }
        img.dataset.expression = sprite.label;
        img.dataset.spriteFolderName = name;
    } catch (error) {
        console.warn('[EpicTavern VN] Could not refresh expression sprite:', error);
    }
}

export function refreshEtVnMode() {
    ensureDialogueBox();
    syncDialogueBox();
    forceExpressionsVisible();
}

export function initEtVnMode() {
    ensureDialogueBox();
    refreshEtVnMode();
    void ensureVnSprite();

    let refreshTimer = null;
    const scheduleRefresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            refreshEtVnMode();
            void ensureVnSprite();
        }, 40);
    };

    const observer = new MutationObserver(() => {
        scheduleRefresh();
    });
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-et-screen'],
    });

    document.addEventListener('et-screen-changed', () => {
        if (document.body.dataset.etScreen !== 'chat') {
            closeHistoryOverlay();
        }
        refreshEtVnMode();
        requestAnimationFrame(() => {
            placeDialogueInSheld();
            syncSendDockHeight();
            forceExpressionsVisible();
        });
        setTimeout(() => {
            placeDialogueInSheld();
            syncSendDockHeight();
            void ensureVnSprite();
        }, 80);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('et-vn-history-open')) {
            e.preventDefault();
            e.stopPropagation();
            closeHistoryOverlay();
        }
    }, true);

    const chat = document.getElementById('chat');
    if (chat) {
        const chatObs = new MutationObserver(() => {
            if (isVnActive()) {
                syncDialogueBox();
            }
        });
        chatObs.observe(chat, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener('resize', () => {
        if (isVnActive()) {
            syncSendDockHeight();
            placeDialogueInSheld();
        }
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        refreshEtVnMode();
        void ensureVnSprite();
    });
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => refreshEtVnMode());
    eventSource.on(event_types.MESSAGE_EDITED, () => refreshEtVnMode());
    eventSource.on(event_types.MESSAGE_DELETED, () => refreshEtVnMode());
    eventSource.on(event_types.CHAT_CHANGED, () => {
        closeHistoryOverlay();
        refreshEtVnMode();
        void ensureVnSprite();
    });
    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        refreshEtVnMode();
        void ensureVnSprite();
    });

    $('#waifuMode').on('change.etVn', () => {
        requestAnimationFrame(() => refreshEtVnMode());
        setTimeout(() => refreshEtVnMode(), 50);
        setTimeout(() => void ensureVnSprite(), 150);
    });
}
