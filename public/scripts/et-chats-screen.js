/**
 * EpicTavern Chats library — destination screen (not the active Chat stage).
 * Lists recent chats like Characters lists cast members.
 */

import {
    characters,
    getCurrentChatId,
    getRequestHeaders,
    getThumbnailUrl,
    newAssistantChat,
    openCharacterChat,
    saveSettingsDebounced,
    selectCharacterById,
    setActiveCharacter,
    setActiveGroup,
    system_avatar,
} from '../script.js';
import { groups, openGroupById, openGroupChat } from './group-chats.js';
import { navigate } from './app-nav.js';
import { sortMoments, timestampToMoment } from './utils.js';
import { accountStorage } from './util/AccountStorage.js';

const PANEL_ID = 'et-chats-screen';

/**
 * @returns {Array<{ group?: string, avatar?: string, file_name?: string }>}
 */
function getPinnedChats() {
    try {
        const raw = accountStorage.getItem('pinnedChats');
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? Object.values(parsed) : [];
    } catch {
        return [];
    }
}

/**
 * @param {{ file_name?: string, avatar?: string, group?: string }} chat
 * @returns {string}
 */
function pinKey(chat) {
    return `${chat.group ? 'group_' + chat.group : ''}${chat.avatar ? 'char_' + chat.avatar : ''}_${chat.file_name}`;
}

/**
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function fetchRecentChats() {
    const pinnedList = getPinnedChats();
    const response = await fetch('/api/chats/recent', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ max: 50, pinned: pinnedList }),
        cache: 'no-cache',
    });

    if (!response.ok) {
        console.warn('Failed to fetch recent chats for Chats screen');
        return [];
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    const pinnedKeys = new Set(pinnedList.map((p) => pinKey(p)));
    const rows = data
        .map((chat) => ({
            chat,
            character: characters.find((x) => x.avatar === chat.avatar),
            group: groups.find((x) => x.id === chat.group),
        }))
        .filter((t) => t.character || t.group)
        .sort((a, b) => {
            const aPinned = pinnedKeys.has(pinKey(a.chat));
            const bPinned = pinnedKeys.has(pinKey(b.chat));
            if (aPinned !== bPinned) {
                return aPinned ? -1 : 1;
            }
            return sortMoments(timestampToMoment(a.chat.last_mes), timestampToMoment(b.chat.last_mes));
        });

    return rows.map(({ chat, character, group }) => {
        const chatTimestamp = timestampToMoment(chat.last_mes);
        return {
            ...chat,
            char_name: character?.name || group?.name || '',
            date_short: chatTimestamp.format('l'),
            date_long: chatTimestamp.format('LL LT'),
            chat_name: String(chat.file_name || '').replace('.jsonl', ''),
            char_thumbnail: character ? getThumbnailUrl('avatar', character.avatar) : system_avatar,
            is_group: !!group,
            avatar: chat.avatar || '',
            group: chat.group || '',
            pinned: pinnedKeys.has(pinKey(chat)),
            preview: String(chat.mes || '').replace(/\s+/g, ' ').trim(),
        };
    });
}

/**
 * @param {Record<string, any>} chat
 */
async function openChatRow(chat) {
    try {
        if (chat.is_group && chat.group) {
            await openGroupById(chat.group);
            setActiveGroup(chat.group);
            saveSettingsDebounced();
            if (getCurrentChatId() !== chat.chat_name) {
                await openGroupChat(chat.group, chat.chat_name);
            }
        } else if (chat.avatar) {
            const characterId = characters.findIndex((x) => x.avatar === chat.avatar);
            if (characterId === -1) {
                console.error(`Character not found for avatar: ${chat.avatar}`);
                return;
            }
            await selectCharacterById(characterId);
            setActiveCharacter(chat.avatar);
            saveSettingsDebounced();
            if (getCurrentChatId() !== chat.chat_name) {
                await openCharacterChat(chat.chat_name);
            }
        }
        navigate('chat');
    } catch (error) {
        console.error('Failed to open chat from Chats screen:', error);
    }
}

/**
 * @returns {HTMLElement}
 */
export function ensureChatsScreen() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
        return panel;
    }

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'et-chats-screen drawer-content closedDrawer';
    panel.innerHTML = `
        <header class="et-chats-header">
            <h1 class="et-chats-title">Chats</h1>
            <p class="et-chats-subtitle">Open a recent chat, or start a temporary one.</p>
            <div class="et-chats-toolbar">
                <button type="button" class="menu_button menu_button_icon et-chats-temp" id="et-chats-temporary">
                    <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
                    <span>Temporary Chat</span>
                </button>
            </div>
        </header>
        <div class="et-chats-list" id="et-chats-list" role="list"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#et-chats-temporary')?.addEventListener('click', async () => {
        await newAssistantChat({ temporary: true });
        navigate('chat');
    });

    return panel;
}

export async function refreshChatsScreen() {
    const panel = ensureChatsScreen();
    const list = panel.querySelector('#et-chats-list');
    if (!(list instanceof HTMLElement)) {
        return;
    }

    list.innerHTML = '<div class="et-chats-empty">Loading chats…</div>';
    const chats = await fetchRecentChats();

    if (!chats.length) {
        list.innerHTML = '<div class="et-chats-empty">No chats yet. Start one from Characters, or open a Temporary Chat.</div>';
        return;
    }

    const currentId = getCurrentChatId();
    list.innerHTML = '';

    for (const chat of chats) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'et-chats-row';
        row.setAttribute('role', 'listitem');
        if (currentId && currentId === chat.chat_name) {
            row.classList.add('is-active');
        }

        row.innerHTML = `
            <span class="et-chats-avatar"><img src="${chat.char_thumbnail}" alt=""></span>
            <span class="et-chats-body">
                <span class="et-chats-name">${escapeHtml(chat.char_name || 'Chat')}</span>
                <span class="et-chats-preview">${escapeHtml(chat.preview || '')}</span>
            </span>
            <span class="et-chats-meta">
                <span class="et-chats-date" title="${escapeHtml(chat.date_long || '')}">${escapeHtml(chat.date_short || '')}</span>
                ${chat.chat_items != null ? `<span class="et-chats-count"><i class="fa-solid fa-comment fa-xs" aria-hidden="true"></i> ${chat.chat_items}</span>` : ''}
            </span>
        `;
        row.addEventListener('click', () => void openChatRow(chat));
        list.appendChild(row);
    }
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function initEtChatsScreen() {
    ensureChatsScreen();
    document.addEventListener('et-screen-changed', (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        if (detail?.screen === 'chats') {
            void refreshChatsScreen();
        }
    });
}
