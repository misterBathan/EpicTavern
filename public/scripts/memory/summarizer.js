/**
 * Discrete auto-memory summarizer — LLM-first via generateRaw.
 *
 * Important: do NOT use generateQuietPrompt here. That continues the
 * character roleplay, so models dump scene prose instead of fact bullets.
 */

import { chat, isGenerating } from '../../script.js';
import { addMemory, getLastAutoMessageId, listMemories, setLastAutoMessageId } from './bank.js';
import { FACT_AUTO_PROMPT, getMemorySettings } from './settings.js';
import { safeGenerateRaw } from './rawClient.js';

let autoBusy = false;

const MAX_FACT_CHARS = 180;
const USER_CLIP = 400;
const CHAR_CLIP = 220;
const FORCE_WINDOW = 16;
const KNOWN_FACTS_CAP = 8;
const CAPTURE_TIMEOUT_MS = 45000;

/** @type {{ at: number, added: number, status: string, detail?: string } | null} */
let lastCaptureStatus = null;

/**
 * @returns {{ at: number, added: number, status: string, detail?: string } | null}
 */
export function getLastCaptureStatus() {
    return lastCaptureStatus;
}

/**
 * @param {number} added
 * @param {string} status
 * @param {string} [detail]
 */
function setCaptureStatus(added, status, detail) {
    lastCaptureStatus = { at: Date.now(), added, status, detail };
}

/**
 * @param {number} fromId
 * @param {number} toId
 * @returns {string}
 */
function buildTranscript(fromId, toId) {
    const parts = [];
    for (let i = Math.max(0, fromId); i <= toId && i < chat.length; i++) {
        const mes = chat[i];
        if (!mes || mes.is_system) {
            continue;
        }
        const name = mes.name || (mes.is_user ? 'User' : 'Character');
        let text = String(mes.mes || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) {
            continue;
        }
        const limit = mes.is_user ? USER_CLIP : CHAR_CLIP;
        if (text.length > limit) {
            text = `${text.slice(0, limit)}…`;
        }
        parts.push(`${mes.is_user ? 'USER' : 'CHAR'} (${name}): ${text}`);
    }
    return parts.join('\n');
}

/**
 * Collect user message text from a range (for the cheap skip gate).
 * @param {number} fromId
 * @param {number} toId
 * @returns {string}
 */
function collectUserText(fromId, toId) {
    const parts = [];
    for (let i = Math.max(0, fromId); i <= toId && i < chat.length; i++) {
        const mes = chat[i];
        if (!mes?.is_user || mes.is_system) {
            continue;
        }
        const text = String(mes.mes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
            parts.push(text);
        }
    }
    return parts.join('\n');
}

/**
 * Cheap gate: skip LLM when the window has no user content worth scanning.
 * Not fact extraction — only avoids empty/greeting-only API burns.
 * @param {string} userText
 * @returns {boolean} true if we should call the LLM
 */
function hasCaptureSignal(userText) {
    const text = String(userText || '').trim();
    if (!text) {
        return false;
    }
    // Very short pure greetings / acks
    if (text.length < 12) {
        return false;
    }
    if (/^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|yes|no|yeah|yep|nah|bye|good (morning|night|evening))[.!?]*$/i.test(text)) {
        return false;
    }
    return true;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isProseDump(text) {
    if (text.length > MAX_FACT_CHARS) {
        return true;
    }
    if (/\*[^*]{50,}\*/.test(text)) {
        return true;
    }
    if (/"[^"]{100,}"/.test(text)) {
        return true;
    }
    if ((text.match(/[.!?]/g) || []).length >= 4) {
        return true;
    }
    return false;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeFact(raw) {
    let text = String(raw || '').trim();
    text = text.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
    text = text.replace(/^["'`]+|["'`]+$/g, '');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

/**
 * Parse model output into short fact cards.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseMemoryCards(raw) {
    let text = String(raw || '').trim();
    if (!text || /^none\.?$/i.test(text)) {
        return [];
    }

    text = text.replace(/^```[\s\S]*?```$/gm, (block) => block.replace(/```\w*\n?/g, '').replace(/```/g, ''));
    text = text.replace(/^(?:here(?:'s| are)|lasting|memory|facts?)[^:\n]*:\s*/i, '');

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const cards = [];
    for (const line of lines) {
        if (/^none\.?$/i.test(line)) {
            continue;
        }
        if (/^(here(?:'s| are)|facts?|memories)\b/i.test(line) && line.length < 40) {
            continue;
        }
        const m = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
        const candidate = normalizeFact(m?.[1] ?? (line.length <= MAX_FACT_CHARS ? line : ''));
        if (!candidate || candidate.length < 6) {
            continue;
        }
        if (isProseDump(candidate)) {
            continue;
        }
        cards.push(candidate);
    }

    if (!cards.length && text.length <= MAX_FACT_CHARS && !/^none/i.test(text) && !isProseDump(text)) {
        cards.push(normalizeFact(text));
    }

    return [...new Set(cards)].slice(0, 5);
}

/**
 * @param {string} fact
 * @returns {boolean}
 */
function alreadyKnown(fact) {
    const needle = fact.toLowerCase().replace(/[{}]/g, '');
    return listMemories().some((m) => {
        const hay = String(m.text || '').toLowerCase().replace(/[{}]/g, '');
        return hay === needle || hay.includes(needle) || needle.includes(hay);
    });
}

/**
 * @returns {string}
 */
function buildKnownFactsBlock() {
    const known = listMemories()
        .map(m => String(m.text || '').trim())
        .filter(Boolean)
        .slice(0, KNOWN_FACTS_CAP);
    if (!known.length) {
        return '';
    }
    return `Already known — do not repeat:\n${known.map(t => `- ${t}`).join('\n')}`;
}

/**
 * @param {string[]} cards
 * @param {{ start: number, end: number }} range
 * @returns {Promise<number>}
 */
async function commitFacts(cards, range) {
    const unique = [...new Set(cards.map(normalizeFact))]
        .filter(c => c && !isProseDump(c) && !alreadyKnown(c))
        .slice(0, 5);

    let added = 0;
    for (const card of unique) {
        await addMemory({
            text: card,
            source: 'auto',
            messageRange: range,
            importance: 2,
        });
        added += 1;
    }
    return added;
}

/**
 * Isolated LLM call — no character card, no chat continuation.
 * @param {string} transcript
 * @returns {Promise<{ cards: string[], raw: string }>}
 */
async function extractFactsWithLlm(transcript) {
    const settings = getMemorySettings();
    const systemPrompt = String(settings.autoPrompt || FACT_AUTO_PROMPT)
        .replace(/\{\{text\}\}/g, '')
        .replace(/\nChat excerpt:\s*$/i, '')
        .trim();

    const known = buildKnownFactsBlock();
    const userPrompt = [
        'Extract lasting memory facts from this chat transcript.',
        'Reply with "- " bullet facts only, or NONE.',
        known,
        '',
        'Chat transcript:',
        transcript,
    ].filter(Boolean).join('\n');

    const raw = await safeGenerateRaw({
        systemPrompt,
        prompt: userPrompt,
        responseLength: 160,
        instructOverride: true,
        quietToLoud: false,
    });

    const cleaned = String(raw || '').trim();
    console.info('[EpicTavern Memory] Raw LLM capture:\n', cleaned.slice(0, 600));
    return { cards: parseMemoryCards(cleaned), raw: cleaned };
}

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
async function waitForIdle(timeoutMs = 60000) {
    const start = Date.now();
    while (isGenerating()) {
        if (Date.now() - start > timeoutMs) {
            return false;
        }
        await new Promise(r => setTimeout(r, 250));
    }
    await new Promise(r => setTimeout(r, 400));
    return !isGenerating();
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * LLM-first memory capture for recent chat.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ added: number, raw?: string, error?: string }>}
 */
export async function runAutoMemory({ force = false } = {}) {
    const settings = getMemorySettings();

    if (!force && (!settings.enabled || !settings.autoEnabled)) {
        return { added: 0 };
    }
    if (autoBusy) {
        setCaptureStatus(0, 'busy');
        return { added: 0, error: 'busy' };
    }
    if (!chat?.length) {
        setCaptureStatus(0, 'empty_chat');
        return { added: 0, error: 'empty_chat' };
    }

    const endId = chat.length - 1;
    const lastAuto = getLastAutoMessageId();
    const interval = Math.max(2, Number(settings.interval) || 4);

    let startId;
    if (force) {
        startId = Math.max(0, endId - FORCE_WINDOW);
    } else {
        if (endId - lastAuto < interval) {
            return { added: 0 };
        }
        startId = Math.max(0, lastAuto + 1);
        if (startId > endId) {
            startId = Math.max(0, endId - Math.max(interval, 4));
        }
    }

    const userText = collectUserText(startId, endId);
    if (!force && !hasCaptureSignal(userText)) {
        // Advance cursor so we don't re-check the same low-signal window every turn
        await setLastAutoMessageId(endId);
        setCaptureStatus(0, 'skipped', 'low_signal');
        return { added: 0, error: 'skipped' };
    }

    const transcript = buildTranscript(startId, endId);
    if (!transcript.trim()) {
        setCaptureStatus(0, 'empty_transcript');
        return { added: 0, error: 'empty_transcript' };
    }

    autoBusy = true;
    try {
        if (!(await waitForIdle(force ? 90000 : 45000))) {
            setCaptureStatus(0, 'generation_busy');
            return { added: 0, error: 'generation_busy' };
        }

        let cards = [];
        let raw = '';
        try {
            ({ cards, raw } = await withTimeout(extractFactsWithLlm(transcript), CAPTURE_TIMEOUT_MS));
        } catch (error) {
            console.warn('[EpicTavern Memory] LLM capture failed:', error);
            const msg = error?.message || String(error);
            const errKey = msg === 'timeout' ? 'timeout' : msg;
            setCaptureStatus(0, 'error', errKey);
            // Do NOT advance lastAuto on errors — allow retry on next interval / force
            return { added: 0, error: errKey, raw: '' };
        }

        const added = await commitFacts(cards, { start: startId, end: endId });

        // Advance after a successful API pass (including NONE / no new unique facts).
        if (added > 0 || !force) {
            await setLastAutoMessageId(endId);
        }

        if (added > 0) {
            setCaptureStatus(added, 'ok');
        } else if (raw && /^none\.?$/i.test(raw.trim())) {
            setCaptureStatus(0, 'none');
        } else {
            setCaptureStatus(0, 'unparsed');
        }

        return { added, raw };
    } finally {
        autoBusy = false;
    }
}
