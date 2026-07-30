/**
 * Memory screen UI (chat-scoped).
 */

import { Popup } from '../popup.js';
import { addMemory, deleteMemory, listMemories, updateMemory } from './bank.js';
import { getMemorySettings, updateMemorySettings } from './settings.js';
import { getLastCaptureStatus, runAutoMemory } from './summarizer.js';
import { refreshMemoryInjection } from './inject.js';

/**
 * @param {HTMLElement} root
 */
export function renderMemoryScreen(root) {
    if (!root) {
        return;
    }

    const settings = getMemorySettings();
    const filter = settings.filter || 'all';
    let memories = listMemories();
    if (filter === 'auto') {
        memories = memories.filter(m => m.source === 'auto');
    } else if (filter === 'manual') {
        memories = memories.filter(m => m.source === 'manual');
    } else if (filter === 'pinned') {
        memories = memories.filter(m => m.pinned);
    }

    root.innerHTML = `
        <header class="et-memory-header">
            <div>
                <h1 class="et-memory-title">Memory</h1>
                <p class="et-memory-sub">Lasting facts for this chat — names, preferences, places, promises.</p>
            </div>
            <div class="et-memory-actions">
                <button type="button" class="menu_button" id="et-memory-add" title="Add a manual memory">Add memory</button>
                <button type="button" class="menu_button" id="et-memory-auto" title="Ask the model to extract new lasting facts from recent chat">Auto-capture</button>
            </div>
        </header>

        <section class="et-memory-toolbar" aria-label="Memory controls">
            <label class="et-memory-toggle">
                <input type="checkbox" id="et-memory-enabled" ${settings.enabled ? 'checked' : ''}>
                Inject into prompts
            </label>
            <label class="et-memory-toggle">
                <input type="checkbox" id="et-memory-auto-enabled" ${settings.autoEnabled ? 'checked' : ''}>
                Auto-capture
            </label>
            <label class="et-memory-field">
                Every
                <input type="number" id="et-memory-interval" min="2" max="100" value="${Math.max(2, Number(settings.interval) || 4)}">
                messages
            </label>
            <label class="et-memory-field">
                Max inject
                <input type="number" id="et-memory-max-inject" min="1" max="24" value="${Math.max(1, Number(settings.maxInject) || 8)}">
            </label>
            <label class="et-memory-field">
                Filter
                <select id="et-memory-filter">
                    <option value="all" ${filter === 'all' ? 'selected' : ''}>All</option>
                    <option value="pinned" ${filter === 'pinned' ? 'selected' : ''}>Pinned</option>
                    <option value="auto" ${filter === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="manual" ${filter === 'manual' ? 'selected' : ''}>Manual</option>
                </select>
            </label>
            <p class="et-memory-status" id="et-memory-status">${formatCaptureStatus(getLastCaptureStatus())}</p>
        </section>

        <div class="et-memory-list" id="et-memory-list" role="list">
            ${memories.length ? memories.map(renderCard).join('') : '<p class="et-memory-empty">No memories yet. Chat normally — Auto-capture asks the model what matters — or add one manually.</p>'}
        </div>
    `;

    bindMemoryScreen(root);
}

/**
 * @param {{ at: number, added: number, status: string, detail?: string } | null} status
 * @returns {string}
 */
function formatCaptureStatus(status) {
    if (!status) {
        return 'Last capture: —';
    }
    const when = new Date(status.at).toLocaleTimeString();
    switch (status.status) {
        case 'ok':
            return `Last capture: ${status.added} card${status.added === 1 ? '' : 's'} (${when})`;
        case 'none':
            return `Last capture: NONE (${when})`;
        case 'skipped':
            return `Last capture: skipped low-signal (${when})`;
        case 'unparsed':
            return `Last capture: unparsed reply (${when})`;
        case 'busy':
            return `Last capture: busy (${when})`;
        case 'timeout':
            return `Last capture: timeout (${when})`;
        case 'generation_busy':
            return `Last capture: chat still generating (${when})`;
        case 'error':
            return `Last capture: error — ${escapeHtml(status.detail || 'failed')} (${when})`;
        default:
            return `Last capture: ${escapeHtml(status.status)} (${when})`;
    }
}

/**
 * @param {import('./bank.js').MemoryEntry} m
 */
function renderCard(m) {
    const badge = m.pinned
        ? 'Pinned'
        : (m.source === 'auto' ? (m.edited ? 'Auto · edited' : 'Auto') : 'Manual');
    const when = m.updatedAt ? new Date(m.updatedAt).toLocaleString() : '';
    return `
        <article class="et-memory-card ${m.pinned ? 'is-pinned' : ''}" data-id="${m.id}" role="listitem">
            <div class="et-memory-card-meta">
                <span class="et-memory-badge">${badge}</span>
                <time datetime="${m.updatedAt || ''}">${when}</time>
            </div>
            <p class="et-memory-card-text">${escapeHtml(m.text)}</p>
            <div class="et-memory-card-actions">
                <button type="button" class="menu_button" data-et-memory-act="pin">${m.pinned ? 'Unpin' : 'Pin'}</button>
                <button type="button" class="menu_button" data-et-memory-act="edit">Edit</button>
                <button type="button" class="menu_button" data-et-memory-act="delete">Delete</button>
            </div>
        </article>
    `;
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLElement} root
 */
function bindMemoryScreen(root) {
    root.querySelector('#et-memory-enabled')?.addEventListener('change', (e) => {
        updateMemorySettings({ enabled: /** @type {HTMLInputElement} */ (e.target).checked });
        refreshMemoryInjection();
    });
    root.querySelector('#et-memory-auto-enabled')?.addEventListener('change', (e) => {
        updateMemorySettings({ autoEnabled: /** @type {HTMLInputElement} */ (e.target).checked });
    });
    root.querySelector('#et-memory-interval')?.addEventListener('change', (e) => {
        const v = Math.max(2, Number(/** @type {HTMLInputElement} */ (e.target).value) || 4);
        updateMemorySettings({ interval: v });
        /** @type {HTMLInputElement} */ (e.target).value = String(v);
    });
    root.querySelector('#et-memory-max-inject')?.addEventListener('change', (e) => {
        const v = Math.max(1, Math.min(24, Number(/** @type {HTMLInputElement} */ (e.target).value) || 8));
        updateMemorySettings({ maxInject: v });
        /** @type {HTMLInputElement} */ (e.target).value = String(v);
        refreshMemoryInjection();
    });
    root.querySelector('#et-memory-filter')?.addEventListener('change', (e) => {
        updateMemorySettings({ filter: /** @type {HTMLSelectElement} */ (e.target).value });
        renderMemoryScreen(root);
    });

    root.querySelector('#et-memory-add')?.addEventListener('click', async () => {
        const text = await Popup.show.input('New memory', 'Write a lasting fact or event for this chat.', '');
        if (!text?.trim()) {
            return;
        }
        await addMemory({ text: text.trim(), source: 'manual', pinned: false });
        refreshMemoryInjection();
        renderMemoryScreen(root);
    });

    root.querySelector('#et-memory-auto')?.addEventListener('click', async () => {
        const btn = /** @type {HTMLButtonElement} */ (root.querySelector('#et-memory-auto'));
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Capturing…';
        }
        try {
            const result = await runAutoMemory({ force: true });
            if (result.added > 0) {
                toastr.success(`Added ${result.added} memory card${result.added === 1 ? '' : 's'}.`);
            } else if (result.error === 'busy') {
                toastr.info('Memory capture already running — try again in a moment.');
            } else if (result.error === 'generation_busy') {
                toastr.warning('Wait for the chat reply to finish, then try Auto-capture again.');
            } else if (result.error === 'timeout') {
                toastr.warning('Auto-capture timed out. Try again.');
            } else if (result.error === 'skipped') {
                toastr.info('Skipped — recent messages looked like low-signal greetings.');
            } else if (result.error) {
                toastr.error(`Auto-capture failed: ${result.error}`);
            } else if (result.raw && /^none\.?$/i.test(result.raw.trim())) {
                toastr.info('Model found no new lasting facts in the recent window.');
            } else if (result.raw) {
                console.warn('[EpicTavern Memory] Unparsed capture output:', result.raw.slice(0, 400));
                toastr.warning('Model replied, but nothing parsed as a short fact. Check console for raw output.');
            } else {
                toastr.info('No new memories captured.');
            }
            refreshMemoryInjection();
            renderMemoryScreen(root);
        } catch (error) {
            console.error('[EpicTavern Memory] Auto-capture failed:', error);
            toastr.error('Auto-capture failed. Check API connection.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Auto-capture';
            }
        }
    });

    root.querySelectorAll('[data-et-memory-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.et-memory-card');
            const id = card?.getAttribute('data-id');
            if (!id) {
                return;
            }
            const act = btn.getAttribute('data-et-memory-act');
            if (act === 'pin') {
                const entry = listMemories().find(m => m.id === id);
                await updateMemory(id, { pinned: !entry?.pinned });
            } else if (act === 'edit') {
                const entry = listMemories().find(m => m.id === id);
                const next = await Popup.show.input('Edit memory', null, entry?.text || '');
                if (next == null) {
                    return;
                }
                if (!String(next).trim()) {
                    toastr.warning('Memory cannot be empty.');
                    return;
                }
                await updateMemory(id, { text: String(next).trim() });
            } else if (act === 'delete') {
                const ok = await Popup.show.confirm('Delete this memory?');
                if (!ok) {
                    return;
                }
                await deleteMemory(id);
            }
            refreshMemoryInjection();
            renderMemoryScreen(root);
        });
    });
}
