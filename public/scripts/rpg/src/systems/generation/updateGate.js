/**
 * Smart RPG Update Gate
 * Local (no-LLM) heuristics decide whether tracker generation is needed
 * and which sections to request.
 */

import { chat } from '../../../../../script.js';
import {
    extensionSettings,
    committedTrackerData,
    lastGeneratedData,
    isPlotProgression,
} from '../../core/state.js';
import { isPresentCharactersEnabled } from '../../utils/presentCharacters.js';

/** @typedef {'userStats' | 'infoBox' | 'characters'} TrackerSection */

export const ALL_TRACKER_SECTIONS = /** @type {TrackerSection[]} */ (['userStats', 'infoBox', 'characters']);

/** Conditions that imply ongoing per-turn change */
const TICKING_CONDITIONS = [
    'poison', 'poisoned', 'bleed', 'bleeding', 'burn', 'burning', 'on fire',
    'starv', 'hungry', 'dehydrat', 'freezing', 'hypotherm', 'suffocat',
    'diseased', 'infected', 'cursed', 'doomed', 'dying', 'unconscious',
    'intoxicated', 'drunk', 'overdos',
];

const USER_STATS_KEYWORDS = [
    'hurt', 'wound', 'injur', 'damage', 'attack', 'strike', 'slash', 'stab', 'shoot',
    'heal', 'bandage', 'potion', 'medicine', 'eat', 'drink', 'food', 'meal', 'hungry',
    'sleep', 'rest', 'exhausted', 'tired', 'bath', 'wash', 'clean', 'dirty', 'hygiene',
    'arous', 'kiss', 'sex', 'poison', 'bleed', 'burn', 'sick', 'pain', 'hp', 'health',
    'energy', 'stamina', 'fatigue',
];

const INVENTORY_QUEST_KEYWORDS = [
    'pick up', 'take the', 'grab', 'loot', 'buy', 'purchase', 'sell', 'trade',
    'drop ', 'discard', 'equip', 'unequip', 'wear', 'remove the', 'inventory',
    'quest', 'mission', 'reward', 'objective', 'give you', 'handed', 'receive',
];

const INFOBOX_KEYWORDS = [
    'leave', 'left the', 'arrive', 'arrived', 'enter the', 'entered', 'exit',
    'travel', 'journey', 'walk to', 'go to', 'head to', 'return to', 'move to',
    'morning', 'evening', 'night', 'noon', 'dawn', 'dusk', 'hours later', 'later that',
    'next day', 'tomorrow', 'yesterday', 'weather', 'rain', 'storm', 'snow', 'sun',
    'teleport', 'portal', 'outside', 'inside the',
];

const CHARACTER_KEYWORDS = [
    'appears', 'appeared', 'arrives', 'arrived', 'enters', 'entered', 'joins',
    'newcomer', 'stranger', 'npc', 'introduce', 'meet ', 'met ', 'present are',
    'thought', 'thinks', 'thinking', 'whispers to herself', 'aside',
    'combat', 'fight', 'battle', 'duel', 'enemy', 'foe',
];

let messagesSinceUpdate = 0;
let lastDecision = {
    update: true,
    sections: [...ALL_TRACKER_SECTIONS],
    reasons: ['init'],
    idle: false,
};
let forceNextUpdate = false;

/**
 * Force the next gate check to require a full update (Refresh, encounter, etc.).
 */
export function requestForcedTrackerUpdate() {
    forceNextUpdate = true;
}

function hasMeaningfulTrackerPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const us = payload.userStats;
    const ib = payload.infoBox;
    const ct = payload.characterThoughts;
    const meaningful = (v) => {
        if (v == null) return false;
        if (typeof v === 'string') return v.trim().length > 8;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
    };
    return meaningful(us) || meaningful(ib) || meaningful(ct);
}

function hasTrackerDataOnAnyChatMessage() {
    if (!Array.isArray(chat) || chat.length === 0) {
        return false;
    }
    for (const message of chat) {
        if (!message || message.is_user || message.is_system) continue;
        if (message.extra?.rpg_companion_swipes) {
            const store = message.extra.rpg_companion_swipes;
            if (hasMeaningfulTrackerPayload(store)) return true;
            for (const payload of Object.values(store)) {
                if (hasMeaningfulTrackerPayload(payload)) return true;
            }
        }
        if (Array.isArray(message.swipe_info)) {
            for (const info of message.swipe_info) {
                const store = info?.extra?.rpg_companion_swipes;
                if (!store) continue;
                if (hasMeaningfulTrackerPayload(store)) return true;
                for (const payload of Object.values(store)) {
                    if (hasMeaningfulTrackerPayload(payload)) return true;
                }
            }
        }
    }
    return false;
}

function hasDisplayableTrackerState() {
    return hasMeaningfulTrackerPayload({
        userStats: lastGeneratedData?.userStats || committedTrackerData?.userStats,
        infoBox: lastGeneratedData?.infoBox || committedTrackerData?.infoBox,
        characterThoughts: lastGeneratedData?.characterThoughts || committedTrackerData?.characterThoughts,
    });
}

/**
 * True when this chat has never received RPG tracker data (first update ever),
 * or the panel is still empty.
 * @returns {boolean}
 */
export function isFirstTrackerUpdateForChat() {
    if (!hasDisplayableTrackerState()) return true;
    return !hasTrackerDataOnAnyChatMessage();
}

/**
 * Call after a successful tracker generation so cooldown resets.
 */
export function markTrackerUpdated() {
    messagesSinceUpdate = 0;
    forceNextUpdate = false;
    lastDecision = {
        update: true,
        sections: getEnabledSections(),
        reasons: ['updated'],
        idle: false,
    };
    updateSmartUpdateStatusUI();
}

/**
 * Record that an assistant turn happened without a tracker update.
 */
export function markTrackerSkipped(decision) {
    messagesSinceUpdate += 1;
    if (decision) {
        lastDecision = { ...decision, idle: true };
    }
    updateSmartUpdateStatusUI();
}

export function getLastUpdateGateDecision() {
    return lastDecision;
}

export function getMessagesSinceTrackerUpdate() {
    return messagesSinceUpdate;
}

/**
 * @returns {TrackerSection[]}
 */
export function getEnabledSections() {
    /** @type {TrackerSection[]} */
    const sections = [];
    if (extensionSettings.showUserStats) sections.push('userStats');
    if (extensionSettings.showInfoBox) sections.push('infoBox');
    if (isPresentCharactersEnabled()) sections.push('characters');
    return sections.length ? sections : [...ALL_TRACKER_SECTIONS];
}

/**
 * @param {string} text
 * @param {string[]} needles
 */
function textMatchesAny(text, needles) {
    const lower = text.toLowerCase();
    return needles.some(n => lower.includes(n));
}

function getCommittedConditionsText() {
    try {
        const raw = committedTrackerData.userStats;
        if (!raw) return '';
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const status = parsed?.status;
        if (!status) return '';
        if (typeof status === 'string') return status;
        const parts = [];
        if (status.conditions) parts.push(String(status.conditions));
        if (status.mood) parts.push(String(status.mood));
        for (const [k, v] of Object.entries(status)) {
            if (k === 'mood' || k === 'conditions') continue;
            if (v != null) parts.push(String(v));
        }
        return parts.join(' ');
    } catch {
        return '';
    }
}

function hasTickingCondition() {
    const text = getCommittedConditionsText().toLowerCase();
    if (!text || text === 'none' || text === 'n/a') return false;
    return TICKING_CONDITIONS.some(c => text.includes(c));
}

function hasCommittedTrackers() {
    return !!(
        (committedTrackerData.userStats && String(committedTrackerData.userStats).trim())
        || (committedTrackerData.infoBox && String(committedTrackerData.infoBox).trim())
        || (committedTrackerData.characterThoughts && String(committedTrackerData.characterThoughts).trim())
    );
}

/**
 * Latest user + assistant turn text for keyword scans.
 * @returns {string}
 */
function getRecentTurnText() {
    if (!Array.isArray(chat) || chat.length === 0) return '';
    const parts = [];
    for (let i = chat.length - 1; i >= 0 && parts.length < 3; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        if (typeof m.mes === 'string') parts.unshift(m.mes);
    }
    return parts.join('\n');
}

/**
 * Decide whether trackers should update and which sections to request.
 * @param {{ force?: boolean }} [options]
 * @returns {{ update: boolean, sections: TrackerSection[], reasons: string[], idle: boolean }}
 */
export function shouldUpdateTrackers(options = {}) {
    const { force = false } = options;
    const smart = extensionSettings.smartUpdates || {};
    const enabled = smart.enabled !== false;
    const enabledSections = getEnabledSections();

    if (force || forceNextUpdate) {
        lastDecision = {
            update: true,
            sections: enabledSections,
            reasons: force ? ['forced'] : ['forced_pending'],
            idle: false,
        };
        updateSmartUpdateStatusUI();
        return lastDecision;
    }

    if (!enabled) {
        lastDecision = {
            update: true,
            sections: enabledSections,
            reasons: ['smart_updates_disabled'],
            idle: false,
        };
        return lastDecision;
    }

    /** @type {Set<TrackerSection>} */
    const sectionSet = new Set();
    /** @type {string[]} */
    const reasons = [];

    if (!hasCommittedTrackers() || isFirstTrackerUpdateForChat()) {
        const reason = !hasDisplayableTrackerState()
            ? 'empty_panel'
            : (isFirstTrackerUpdateForChat() ? 'first_chat_message' : 'no_committed_data');
        lastDecision = {
            update: true,
            sections: enabledSections,
            reasons: [reason],
            idle: false,
        };
        updateSmartUpdateStatusUI();
        return lastDecision;
    }

    if (isPlotProgression) {
        reasons.push('plot_progression');
        enabledSections.forEach(s => sectionSet.add(s));
    }

    const forceOnConditions = smart.forceOnConditions !== false;
    const forceOnKeywords = smart.forceOnKeywords !== false;
    const minMessages = Math.max(1, Number(smart.minMessagesBetweenUpdates) || 3);

    if (forceOnConditions && hasTickingCondition()) {
        reasons.push('ticking_condition');
        if (enabledSections.includes('userStats')) sectionSet.add('userStats');
        if (enabledSections.includes('infoBox')) sectionSet.add('infoBox');
    }

    const turnText = getRecentTurnText();
    if (forceOnKeywords && turnText) {
        if (enabledSections.includes('userStats') && (
            textMatchesAny(turnText, USER_STATS_KEYWORDS)
            || textMatchesAny(turnText, INVENTORY_QUEST_KEYWORDS)
        )) {
            sectionSet.add('userStats');
            reasons.push('stats_keywords');
        }
        if (enabledSections.includes('infoBox') && textMatchesAny(turnText, INFOBOX_KEYWORDS)) {
            sectionSet.add('infoBox');
            reasons.push('infobox_keywords');
        }
        if (enabledSections.includes('characters') && textMatchesAny(turnText, CHARACTER_KEYWORDS)) {
            sectionSet.add('characters');
            reasons.push('character_keywords');
        }
    }

    // Cooldown: periodically refresh even in quiet scenes
    if (messagesSinceUpdate >= minMessages) {
        reasons.push(`cooldown_${minMessages}`);
        // Light refresh: stats + infoBox; thoughts only if enabled and cooldown is long
        if (enabledSections.includes('userStats')) sectionSet.add('userStats');
        if (enabledSections.includes('infoBox')) sectionSet.add('infoBox');
        if (minMessages >= 5 && enabledSections.includes('characters')) {
            sectionSet.add('characters');
        }
    }

    // Filter by section eligibility toggles
    const eligible = smart.sections || {};
    for (const s of [...sectionSet]) {
        if (eligible[s] === false) sectionSet.delete(s);
    }

    if (sectionSet.size === 0) {
        lastDecision = {
            update: false,
            sections: [],
            reasons: reasons.length ? reasons : ['quiet_scene'],
            idle: true,
        };
        updateSmartUpdateStatusUI();
        return lastDecision;
    }

    lastDecision = {
        update: true,
        sections: ALL_TRACKER_SECTIONS.filter(s => sectionSet.has(s)),
        reasons,
        idle: false,
    };
    updateSmartUpdateStatusUI();
    return lastDecision;
}

/**
 * Whether an automatic tracker generation should run for this gate decision.
 * First/empty-panel updates always run even if Auto-update is unchecked.
 * @param {{ update?: boolean, reasons?: string[] }} gate
 * @returns {boolean}
 */
export function shouldRunAutomaticTrackerUpdate(gate) {
    if (!gate?.update) return false;
    if (extensionSettings.autoUpdate !== false) return true;
    const reasons = gate.reasons || [];
    return reasons.some(r =>
        r === 'first_chat_message'
        || r === 'empty_panel'
        || r === 'no_committed_data'
        || r === 'forced'
        || r === 'forced_pending'
    );
}

/**
 * Update optional panel status line if present in DOM.
 */
export function updateSmartUpdateStatusUI() {
    const $el = typeof $ !== 'undefined' ? $('#rpg-smart-update-status') : null;
    if (!$el || !$el.length) return;

    const smartOn = extensionSettings.smartUpdates?.enabled !== false;
    if (!smartOn) {
        $el.text('').hide();
        return;
    }

    $el.show();
    if (lastDecision.idle || !lastDecision.update) {
        const n = messagesSinceUpdate;
        const reason = lastDecision.reasons?.[0];
        const label = reason && reason !== 'quiet_scene' ? reason.replace(/_/g, ' ') : 'quiet scene';
        $el.text(`Trackers idle (${label}${n ? `, ${n} msg` : ''})`);
    } else if (lastDecision.reasons.includes('updated')) {
        $el.text('Trackers up to date');
    } else if (lastDecision.sections?.length) {
        $el.text(`Updating: ${lastDecision.sections.join(', ')}`);
    } else {
        $el.text('');
    }
}
