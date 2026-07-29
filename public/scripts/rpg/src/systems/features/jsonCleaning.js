/**
 * JSON Cleaning Module
 * Automatically registers a regex script to strip tracker JSON from Together mode output
 * and provides a JS stripper for raw (unfenced) tracker payloads.
 */

import { repairJSON } from '../../utils/jsonRepair.js';

const TRACKER_TOP_KEYS = new Set([
    'userStats',
    'infoBox',
    'characters',
    'characterThoughts',
    'presentCharacters',
]);

/**
 * True when a parsed object looks like RPG Companion tracker data.
 * @param {object} payload
 * @returns {boolean}
 */
export function isTrackerPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
    }

    let current = payload;
    for (let depth = 0; depth < 4; depth++) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            return false;
        }

        for (const key of TRACKER_TOP_KEYS) {
            if (current[key] != null) {
                return true;
            }
        }

        // Standalone userStats-shaped object (no wrapper)
        if (Array.isArray(current.stats) && (current.inventory || current.quests || current.status || current.mood)) {
            return true;
        }

        if (current.type === 'userStats' || current.type === 'infoBox' || current.type === 'characters') {
            return true;
        }

        const next = current.trackers || current.tracker || current.context || current.state || null;
        if (!next || typeof next !== 'object') {
            break;
        }
        current = next;
    }

    return false;
}

/**
 * Heuristic: text contains RPG tracker field names (works on incomplete JSON).
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeTrackerText(text) {
    if (typeof text !== 'string' || !text) {
        return false;
    }
    return /"userStats"\s*:/.test(text)
        || /"infoBox"\s*:/.test(text)
        || /"characterThoughts"\s*:/.test(text)
        || /"presentCharacters"\s*:/.test(text)
        || (/"stats"\s*:\s*\[/.test(text) && /"inventory"\s*:/.test(text));
}

/**
 * Extract top-level `{...}` ranges with string-aware brace matching.
 * Incomplete objects (no closing brace) are returned as a single range to EOS —
 * we never scan inside them for nested objects (that mangled truncated Together output).
 * @param {string} text
 * @returns {Array<{ start: number, end: number, content: string, incomplete: boolean }>}
 */
function findTopLevelJsonObjectRanges(text) {
    const ranges = [];
    let i = 0;

    while (i < text.length) {
        if (text[i] !== '{') {
            i++;
            continue;
        }

        let depth = 1;
        let j = i + 1;
        let inString = false;
        let escapeNext = false;

        while (j < text.length && depth > 0) {
            const char = text[j];
            if (escapeNext) {
                escapeNext = false;
            } else if (char === '\\') {
                escapeNext = true;
            } else if (char === '"') {
                inString = !inString;
            } else if (!inString) {
                if (char === '{') depth++;
                else if (char === '}') depth--;
            }
            j++;
        }

        if (depth === 0) {
            ranges.push({ start: i, end: j, content: text.slice(i, j), incomplete: false });
            i = j;
        } else {
            // Truncated JSON — take the whole remainder; do not peel nested objects out of it
            ranges.push({ start: i, end: text.length, content: text.slice(i), incomplete: true });
            break;
        }
    }

    return ranges;
}

/**
 * Whether a JSON range (complete or truncated) should be removed from chat text.
 * @param {{ content: string, incomplete?: boolean }} range
 * @returns {boolean}
 */
function shouldDropJsonRange(range) {
    if (looksLikeTrackerText(range.content)) {
        return true;
    }
    if (range.incomplete) {
        return false;
    }
    const parsed = repairJSON(range.content);
    return !!(parsed && isTrackerPayload(parsed));
}

/**
 * Strip tracker JSON (fenced or raw) and legacy tracker markdown from a message.
 * Leaves non-tracker narrative text intact. Handles truncated / unclosed fences.
 * @param {string} text
 * @returns {string}
 */
export function stripTrackerPayloadFromText(text) {
    if (typeof text !== 'string' || !text) {
        return text;
    }

    let result = text;

    // Closed fences that contain tracker JSON
    result = result.replace(/```(?:json|markdown)?\s*[\s\S]*?```/gim, (block) => {
        const inner = block.replace(/^```(?:json|markdown)?\s*/i, '').replace(/```\s*$/, '').trim();
        if (!inner) {
            return '';
        }
        if (looksLikeTrackerText(inner)) {
            return '';
        }
        const parsed = repairJSON(inner);
        if (parsed && isTrackerPayload(parsed)) {
            return '';
        }
        return block;
    });

    // Unclosed fences (model truncated mid-tracker) — remove fence through end of message
    result = result.replace(/```(?:json|markdown)?(?!\w)[\s\S]*$/gim, (block) => {
        // If a closing fence remains, the closed-fence pass should have handled it
        if (/```[\s\S]*```/.test(block) && block.trim().endsWith('```')) {
            return block;
        }
        if (looksLikeTrackerText(block) || /```(?:json|markdown)?\s*\{/.test(block)) {
            return '';
        }
        return block;
    });

    // Top-level raw JSON (complete or truncated) — never strip nested objects alone
    const ranges = findTopLevelJsonObjectRanges(result);
    if (ranges.length > 0) {
        let rebuilt = '';
        let cursor = 0;
        for (const range of ranges) {
            rebuilt += result.slice(cursor, range.start);
            if (!shouldDropJsonRange(range)) {
                rebuilt += range.content;
            }
            cursor = range.end;
        }
        rebuilt += result.slice(cursor);
        result = rebuilt;
    }

    // Legacy text-format tracker fences
    result = result.replace(/```[^`]*?Stats\s*\n\s*---[^`]*?```\s*/gi, '');
    result = result.replace(/```[^`]*?Info Box\s*\n\s*---[^`]*?```\s*/gi, '');
    result = result.replace(/```[^`]*?Present Characters\s*\n\s*---[^`]*?```\s*/gi, '');
    result = result.replace(/<trackers\b[^>]*>[\s\S]*?<\/trackers>/gi, '');
    result = result.replace(/^\s*---\s*$/gm, '');
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
}

/**
 * Registers an output transformation regex to remove tracker JSON from messages
 * This uses SillyTavern's built-in regex system to transform text BEFORE display
 * @param {Object} st_extension_settings - SillyTavern extension settings object
 * @param {Function} saveSettingsDebounced - Function to save settings
 */
export async function ensureJsonCleaningRegex(st_extension_settings, saveSettingsDebounced) {
    try {
        // Validate extension settings structure
        if (!st_extension_settings || typeof st_extension_settings !== 'object') {
            console.warn('[RPG Companion] Invalid extension_settings object, skipping JSON cleaning regex');
            return;
        }

        // Check if the JSON cleaning regex already exists
        const scriptName = 'RPG Companion - Remove Tracker JSON (Together Mode)';
        const existingScripts = st_extension_settings?.regex || [];

        // Validate regex array
        if (!Array.isArray(existingScripts)) {
            console.warn('[RPG Companion] extension_settings.regex is not an array, resetting to empty array');
            st_extension_settings.regex = [];
        }

        const existingScript = existingScripts.find(script =>
            script && script.scriptName && script.scriptName === scriptName
        );

        // Prefer display+prompt cleaning for fenced blocks; raw JSON is handled in JS.
        const newPattern = '/```(?:json|markdown)?[\\s\\S]*?```/gim';

        if (existingScript) {
            let needsSave = false;

            if (existingScript.findRegex !== newPattern) {
                existingScript.findRegex = newPattern;
                needsSave = true;
            }

            if (JSON.stringify(existingScript.placement) !== JSON.stringify([2])) {
                existingScript.placement = [2]; // 2 = AI Output
                needsSave = true;
            }

            if (existingScript.disabled !== false) {
                existingScript.disabled = false;
                needsSave = true;
            }

            if (existingScript.runOnEdit !== true) {
                existingScript.runOnEdit = true;
                needsSave = true;
            }

            // Apply on display markdown AND when building prompts
            if (existingScript.markdownOnly !== true) {
                existingScript.markdownOnly = true;
                needsSave = true;
            }

            if (existingScript.promptOnly !== true) {
                existingScript.promptOnly = true;
                needsSave = true;
            }

            if (needsSave && typeof saveSettingsDebounced === 'function') {
                const saveResult = saveSettingsDebounced();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                console.log('[RPG Companion] ✅ Updated JSON cleaning regex to v3.2.3 settings.');
            } else {
                console.log('[RPG Companion] JSON Cleaning Regex is up to date.');
            }

            return;
        }

        // Generate a UUID for the script
        const uuidv4 = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        const regexScript = {
            id: uuidv4(),
            scriptName: scriptName,
            findRegex: newPattern,
            replaceString: '',
            trimStrings: [],
            placement: [2], // 2 = AI Output
            disabled: false,
            markdownOnly: true,
            promptOnly: true,
            runOnEdit: true,
            substituteRegex: 0,
            minDepth: null,
            maxDepth: null
        };

        if (!Array.isArray(st_extension_settings.regex)) {
            st_extension_settings.regex = [];
        }

        st_extension_settings.regex.push(regexScript);
        console.log('[RPG Companion] JSON Cleaning Regex created and activated.');

        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        } else {
            console.warn('[RPG Companion] saveSettingsDebounced is not a function, cannot save JSON cleaning regex');
        }
    } catch (error) {
        console.error('[RPG Companion] JSON Cleaning Regex failed to properly initialize!');
        console.error('[RPG Companion] Error details:', error.message, error.stack);
    }
}

/**
 * Removes the JSON cleaning regex if it exists
 * Useful when switching to separate mode or disabling the feature
 * @param {Object} st_extension_settings - SillyTavern extension settings object
 * @param {Function} saveSettingsDebounced - Function to save settings
 */
export function removeJsonCleaningRegex(st_extension_settings, saveSettingsDebounced) {
    try {
        if (!st_extension_settings?.regex || !Array.isArray(st_extension_settings.regex)) {
            return;
        }

        const scriptName = 'RPG Companion - Remove Tracker JSON (Together Mode)';
        const initialLength = st_extension_settings.regex.length;

        st_extension_settings.regex = st_extension_settings.regex.filter(script =>
            !script || !script.scriptName || script.scriptName !== scriptName
        );

        if (st_extension_settings.regex.length < initialLength) {
            if (typeof saveSettingsDebounced === 'function') {
                saveSettingsDebounced();
            }
        }
    } catch (error) {
        console.error('[RPG Companion] Failed to remove JSON cleaning regex:', error);
    }
}
