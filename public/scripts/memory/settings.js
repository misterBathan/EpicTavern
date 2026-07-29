/**
 * EpicTavern Memory settings defaults.
 * Capture is LLM-first via generateRaw (isolated from character persona).
 */

import { extension_settings } from '../extensions.js';
import { saveSettingsDebounced } from '../../script.js';

/** Mirrors extension_prompt_types.IN_PROMPT — avoid importing script enums at module top (circular TDZ). */
const IN_PROMPT = 0;
/** Mirrors extension_prompt_roles.SYSTEM */
const SYSTEM_ROLE = 0;

export const MEMORY_PROMPT_KEY = 'et_memory_bank';
export const MEMORY_PROMPT_VERSION = 5;

/** System instructions only — transcript is passed separately as the user message. */
export const FACT_AUTO_PROMPT = `Extract lasting memory facts from a roleplay transcript. Reply with short durable facts only.

Examples:
- {{user}}'s name is Bathan
- {{user}} is a Steward
- {{user}} wants to become a knight
- Seraphina guards a forest glade in Eldoria

Include: names, roles, goals, prefs, places, promises, relationships, lasting status — any wording.
Exclude: atmosphere, narration, greetings, temporary actions, dialogue dumps.

Rules:
- 1–5 lines, each starting with "- ", max ~20 words.
- Prefer "{{user}}" for the human player.
- Do not invent. If nothing new/durable, reply exactly: NONE
- Do not roleplay or continue the story.`;

export const defaultMemorySettings = {
    enabled: true,
    autoEnabled: true,
    /** Run LLM extraction after this many new messages since last capture. */
    interval: 4,
    maxInject: 8,
    /** Min keyword relevance (0–1) for unpinned memories before recency fill. */
    scoreThreshold: 0.15,
    /** Soft cap on injected memory block size (characters). */
    injectCharBudget: 1200,
    position: IN_PROMPT,
    depth: 2,
    role: SYSTEM_ROLE,
    template: '[Long-term memories]\n{{memories}}',
    autoPrompt: FACT_AUTO_PROMPT,
    promptVersion: MEMORY_PROMPT_VERSION,
    filter: 'all', // all | auto | manual | pinned
};

/**
 * @returns {typeof defaultMemorySettings}
 */
export function getMemorySettings() {
    if (!extension_settings.etMemory || typeof extension_settings.etMemory !== 'object') {
        extension_settings.etMemory = { ...defaultMemorySettings };
    }
    for (const [key, value] of Object.entries(defaultMemorySettings)) {
        if (!Object.prototype.hasOwnProperty.call(extension_settings.etMemory, key)) {
            extension_settings.etMemory[key] = value;
        }
    }
    if (Number(extension_settings.etMemory.promptVersion) < MEMORY_PROMPT_VERSION) {
        extension_settings.etMemory.autoPrompt = FACT_AUTO_PROMPT;
        extension_settings.etMemory.promptVersion = MEMORY_PROMPT_VERSION;
        // Bump only aggressive old intervals (≤2) to the new default
        if (Number(extension_settings.etMemory.interval) <= 2) {
            extension_settings.etMemory.interval = 4;
        }
        saveSettingsDebounced();
    }
    return extension_settings.etMemory;
}

/**
 * @param {Partial<typeof defaultMemorySettings>} patch
 */
export function updateMemorySettings(patch) {
    const settings = getMemorySettings();
    Object.assign(settings, patch);
    saveSettingsDebounced();
    return settings;
}
