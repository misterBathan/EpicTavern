/**
 * Inject Memory Bank into the generation prompt.
 */

import { chat, setExtensionPrompt } from '../../script.js';
import { listMemories } from './bank.js';
import { getMemorySettings, MEMORY_PROMPT_KEY } from './settings.js';

/**
 * Simple relevance score against recent user text.
 * @param {string} memoryText
 * @param {string} query
 * @returns {number} 0–1
 */
function scoreMemory(memoryText, query) {
    if (!query) {
        return 0;
    }
    const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (!words.length) {
        return 0;
    }
    const hay = memoryText.toLowerCase();
    let hits = 0;
    for (const w of words) {
        if (hay.includes(w)) {
            hits += 1;
        }
    }
    return hits / words.length;
}

/**
 * Pick memories for injection: pinned first, then relevance above threshold, then recency fill.
 * Plain bullet lines (no badges) to save tokens.
 * @returns {string}
 */
export function buildMemoryInjectionText() {
    const settings = getMemorySettings();
    if (!settings.enabled) {
        return '';
    }

    const all = listMemories();
    if (!all.length) {
        return '';
    }

    const lastUser = [...chat].reverse().find(m => m?.is_user && m?.mes);
    const query = String(lastUser?.mes || '');
    const threshold = Number(settings.scoreThreshold);
    const scoreFloor = Number.isFinite(threshold) ? threshold : 0.15;
    const max = Math.max(1, Number(settings.maxInject) || 8);
    const charBudget = Math.max(200, Number(settings.injectCharBudget) || 1200);

    const pinned = all.filter(m => m.pinned);
    const unpinned = all.filter(m => !m.pinned);

    const scored = unpinned.map(m => ({
        m,
        score: scoreMemory(m.text, query),
        updatedAt: m.updatedAt || 0,
    }));

    const relevant = scored
        .filter(x => x.score >= scoreFloor)
        .sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt))
        .map(x => x.m);

    const relevantIds = new Set(relevant.map(m => m.id));
    const byRecency = scored
        .filter(x => !relevantIds.has(x.m.id))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(x => x.m);

    /** @type {import('./bank.js').MemoryEntry[]} */
    const selected = [];
    const pushUnique = (entry) => {
        if (!entry || selected.some(s => s.id === entry.id)) {
            return;
        }
        if (selected.length >= max) {
            return;
        }
        selected.push(entry);
    };

    for (const m of pinned) {
        pushUnique(m);
    }
    for (const m of relevant) {
        pushUnique(m);
    }
    for (const m of byRecency) {
        pushUnique(m);
    }

    if (!selected.length) {
        return '';
    }

    const lines = [];
    let used = 0;
    for (const m of selected) {
        const line = `- ${m.text}`;
        if (lines.length && used + line.length + 1 > charBudget) {
            break;
        }
        lines.push(line);
        used += line.length + 1;
    }

    if (!lines.length) {
        return '';
    }

    const body = lines.join('\n');
    const template = settings.template || '[Long-term memories]\n{{memories}}';
    return template.replace('{{memories}}', body);
}

/**
 * Refresh extension prompt slot from current bank.
 */
export function refreshMemoryInjection() {
    const settings = getMemorySettings();
    const value = settings.enabled ? buildMemoryInjectionText() : '';
    setExtensionPrompt(
        MEMORY_PROMPT_KEY,
        value,
        settings.position,
        settings.depth,
        false,
        settings.role,
    );
}

export function clearMemoryInjection() {
    setExtensionPrompt(MEMORY_PROMPT_KEY, '', getMemorySettings().position, 0, false, getMemorySettings().role);
}
