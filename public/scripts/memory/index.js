/**
 * EpicTavern Memory (core) — discrete Memory Bank + long-term prompt recall.
 * Capture is LLM-first after generation ends (interval-gated).
 */

import { eventSource, event_types } from '../events.js';
import { chat } from '../../script.js';
import { getCurrentScreen } from '../app-nav.js';
import { getMemorySettings } from './settings.js';
import { refreshMemoryInjection } from './inject.js';
import { runAutoMemory } from './summarizer.js';
import { renderMemoryScreen } from './ui.js';

const AUTO_DEBOUNCE_MS = 1500;
const FALLBACK_MSG_MS = 2000;

let autoTimer = null;
/** True when GENERATION_ENDED already scheduled capture for this turn. */
let generationEndedSeen = false;
let fallbackTimer = null;

function getMemoryRoot() {
    return document.getElementById('et-memory-root');
}

function refreshScreenIfOpen() {
    if (getCurrentScreen() !== 'memory') {
        return;
    }
    const root = getMemoryRoot();
    if (root) {
        renderMemoryScreen(root);
    }
}

/**
 * After chat generation finishes, ask the model (via generateRaw) what is worth remembering.
 */
function scheduleAutoMemory() {
    const settings = getMemorySettings();
    if (!settings.enabled || !settings.autoEnabled) {
        return;
    }
    clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
        try {
            const result = await runAutoMemory({ force: false });
            if (result.added > 0) {
                refreshMemoryInjection();
                refreshScreenIfOpen();
                console.info(`[EpicTavern Memory] Auto-captured ${result.added} card(s).`);
            } else if (result.error && result.error !== 'busy' && result.error !== 'skipped') {
                console.warn('[EpicTavern Memory] Auto-capture:', result.error);
            }
            if (getCurrentScreen() === 'memory') {
                refreshScreenIfOpen();
            }
        } catch (error) {
            console.warn('[EpicTavern Memory] Auto-capture skipped:', error);
        }
    }, AUTO_DEBOUNCE_MS);
}

/**
 * Boot Memory as core EpicTavern UI (Chat Top Bar → Memory screen).
 */
export async function initMemory() {
    getMemorySettings();

    if (!document.getElementById('et-memory-screen')) {
        const screen = document.createElement('div');
        screen.id = 'et-memory-screen';
        screen.className = 'drawer-content closedDrawer';
        screen.setAttribute('aria-label', 'Memory');
        screen.innerHTML = '<div id="et-memory-root"></div>';
        document.body.appendChild(screen);
    }

    document.addEventListener('et-screen-changed', (event) => {
        const { screen, previous } = event.detail || {};
        if (screen === 'memory') {
            renderMemoryScreen(getMemoryRoot());
            refreshMemoryInjection();
        } else if (previous === 'memory' && screen === 'chat') {
            refreshMemoryInjection();
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        refreshMemoryInjection();
        refreshScreenIfOpen();
    });

    // Primary: generation finished (stop button hid).
    eventSource.on(event_types.GENERATION_ENDED, () => {
        generationEndedSeen = true;
        clearTimeout(fallbackTimer);
        refreshMemoryInjection();
        scheduleAutoMemory();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, (_messageId, type) => {
        refreshMemoryInjection();
        if (type === 'quiet') {
            return;
        }

        // first_message often has no stop-button GENERATION_ENDED
        if (type === 'first_message') {
            scheduleAutoMemory();
            return;
        }

        // Fallback: if GENERATION_ENDED never fires (stop button never shown), still capture.
        generationEndedSeen = false;
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => {
            if (!generationEndedSeen) {
                scheduleAutoMemory();
            }
        }, FALLBACK_MSG_MS);
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        refreshMemoryInjection();
    });

    refreshMemoryInjection();

    if (getCurrentScreen() === 'memory') {
        renderMemoryScreen(getMemoryRoot());
    }

    console.info('[EpicTavern] Memory ready', { messages: chat?.length ?? 0 });
}
