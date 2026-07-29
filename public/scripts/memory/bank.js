/**
 * EpicTavern Memory Bank — persistence helpers.
 * Stored per-chat in chat_metadata.etMemory
 */

import { chat_metadata, saveMetadata } from '../../script.js';
import { uuidv4 } from '../utils.js';

/** @typedef {'auto' | 'manual'} MemorySource */

/**
 * @typedef {Object} MemoryEntry
 * @property {string} id
 * @property {string} text
 * @property {MemorySource} source
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {{ start: number, end: number } | null} [messageRange]
 * @property {number} importance
 * @property {boolean} pinned
 * @property {string[]} tags
 * @property {boolean} [edited]
 */

/**
 * @returns {{ entries: MemoryEntry[], lastAutoMessageId: number }}
 */
export function getBank() {
    if (!chat_metadata.etMemory || typeof chat_metadata.etMemory !== 'object') {
        chat_metadata.etMemory = { entries: [], lastAutoMessageId: -1 };
    }
    if (!Array.isArray(chat_metadata.etMemory.entries)) {
        chat_metadata.etMemory.entries = [];
    }
    if (typeof chat_metadata.etMemory.lastAutoMessageId !== 'number') {
        chat_metadata.etMemory.lastAutoMessageId = -1;
    }
    return chat_metadata.etMemory;
}

/**
 * @returns {MemoryEntry[]}
 */
export function listMemories() {
    return [...getBank().entries].sort((a, b) => {
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

/**
 * @param {Partial<MemoryEntry> & { text: string }} data
 * @returns {Promise<MemoryEntry>}
 */
export async function addMemory(data) {
    const bank = getBank();
    const now = Date.now();
    /** @type {MemoryEntry} */
    const entry = {
        id: data.id || uuidv4(),
        text: String(data.text || '').trim(),
        source: data.source === 'auto' ? 'auto' : 'manual',
        createdAt: data.createdAt || now,
        updatedAt: now,
        messageRange: data.messageRange ?? null,
        importance: Number.isFinite(data.importance) ? Number(data.importance) : 1,
        pinned: Boolean(data.pinned),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        edited: Boolean(data.edited),
    };
    if (!entry.text) {
        throw new Error('Memory text is empty');
    }
    bank.entries.push(entry);
    await saveMetadata();
    return entry;
}

/**
 * @param {string} id
 * @param {Partial<MemoryEntry>} patch
 * @returns {Promise<MemoryEntry | null>}
 */
export async function updateMemory(id, patch) {
    const bank = getBank();
    const entry = bank.entries.find(x => x.id === id);
    if (!entry) {
        return null;
    }
    if (patch.text !== undefined) {
        entry.text = String(patch.text).trim();
        if (entry.source === 'auto') {
            entry.edited = true;
        }
    }
    if (patch.pinned !== undefined) {
        entry.pinned = Boolean(patch.pinned);
    }
    if (patch.importance !== undefined) {
        entry.importance = Number(patch.importance);
    }
    if (patch.tags !== undefined) {
        entry.tags = Array.isArray(patch.tags) ? patch.tags.map(String) : [];
    }
    if (patch.source !== undefined && (patch.source === 'auto' || patch.source === 'manual')) {
        entry.source = patch.source;
    }
    entry.updatedAt = Date.now();
    await saveMetadata();
    return entry;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteMemory(id) {
    const bank = getBank();
    const before = bank.entries.length;
    bank.entries = bank.entries.filter(x => x.id !== id);
    if (bank.entries.length === before) {
        return false;
    }
    await saveMetadata();
    return true;
}

/**
 * @param {number} messageId
 */
export async function setLastAutoMessageId(messageId) {
    const bank = getBank();
    bank.lastAutoMessageId = messageId;
    await saveMetadata();
}

export function getLastAutoMessageId() {
    return getBank().lastAutoMessageId;
}
