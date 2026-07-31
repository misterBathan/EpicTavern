/**
 * EpicTavern Chats library — destination screen (not the active Chat stage).
 * Lists recent chats like Characters lists cast members.
 */

import {
    characters,
    deleteCharacterChatByName,
    getCurrentChatId,
    getRequestHeaders,
    getThumbnailUrl,
    newAssistantChat,
    openCharacterChat,
    renameGroupOrCharacterChat,
    saveSettingsDebounced,
    selectCharacterById,
    setActiveCharacter,
    setActiveGroup,
    system_avatar,
    updateRemoteChatName,
} from '../script.js';
import { deleteGroupChatByName, groups, openGroupById, openGroupChat } from './group-chats.js';
import { navigate } from './app-nav.js';
import { t } from './i18n.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { sortMoments, timestampToMoment } from './utils.js';
import { accountStorage } from './util/AccountStorage.js';

const PANEL_ID = 'et-chats-screen';
const PINNED_KEY = 'pinnedChats';

/**
 * @returns {Array<{ group?: string, avatar?: string, file_name?: string }>}
 */
function getPinnedChats() {
    try {
        const raw = accountStorage.getItem(PINNED_KEY);
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
 * @param {{ file_name?: string, avatar?: string, group?: string }} chat
 * @param {boolean} pinned
 */
function setPinned(chat, pinned) {
    let map = {};
    try {
        const raw = accountStorage.getItem(PINNED_KEY);
        if (raw) {
            map = JSON.parse(raw) || {};
        }
    } catch {
        map = {};
    }
    const key = pinKey(chat);
    if (pinned) {
        map[key] = {
            group: chat.group || undefined,
            avatar: chat.avatar || undefined,
            file_name: chat.file_name,
        };
    } else {
        delete map[key];
    }
    accountStorage.setItem(PINNED_KEY, JSON.stringify(map));
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
        navigate('chat', { force: true });
    } catch (error) {
        console.error('Failed to open chat from Chats screen:', error);
    }
}

/**
 * @param {Record<string, any>} chat
 */
async function renameChatRow(chat) {
    const fileName = String(chat.chat_name || '').replace(/\.jsonl$/i, '');
    try {
        const popupText = await renderTemplateAsync('chatRename');
        const newName = await callGenericPopup(popupText, POPUP_TYPE.INPUT, fileName);
        if (!newName || typeof newName !== 'string' || newName === fileName) {
            return;
        }
        if (chat.is_group && chat.group) {
            await renameGroupOrCharacterChat({
                groupId: chat.group,
                oldFileName: fileName,
                newFileName: newName,
                loader: false,
            });
        } else if (chat.avatar) {
            const characterId = characters.findIndex((x) => x.avatar === chat.avatar);
            if (characterId === -1) {
                return;
            }
            await renameGroupOrCharacterChat({
                characterId: String(characterId),
                oldFileName: fileName,
                newFileName: newName,
                loader: false,
            });
            await updateRemoteChatName(characterId, newName);
        }
        toastr.success(t`Chat renamed.`);
        await refreshChatsScreen();
    } catch (error) {
        console.error('Failed to rename chat:', error);
        toastr.error(t`Failed to rename recent chat. See console for details.`);
    }
}

/**
 * @param {Record<string, any>} chat
 */
async function deleteChatRow(chat) {
    const fileName = String(chat.chat_name || '').replace(/\.jsonl$/i, '');
    try {
        const confirm = await callGenericPopup(t`Delete the Chat File?`, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            return;
        }
        if (chat.is_group && chat.group) {
            await deleteGroupChatByName(chat.group, fileName);
        } else if (chat.avatar) {
            const characterId = characters.findIndex((x) => x.avatar === chat.avatar);
            if (characterId === -1) {
                return;
            }
            await deleteCharacterChatByName(String(characterId), fileName);
        }
        toastr.success(t`Chat deleted.`);
        await refreshChatsScreen();
    } catch (error) {
        console.error('Failed to delete chat:', error);
        toastr.error(t`Failed to delete recent chat. See console for details.`);
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
        navigate('chat', { force: true });
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
        const row = document.createElement('div');
        row.className = 'et-chats-row';
        row.setAttribute('role', 'listitem');
        row.tabIndex = 0;
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
                <span class="et-chats-actions">
                    <button type="button" class="menu_button menu_button_icon et-chats-pin ${chat.pinned ? 'active' : ''}" title="Pin chat" aria-label="Pin chat">
                        <i class="fa-solid fa-thumbtack fa-fw" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="menu_button menu_button_icon et-chats-rename" title="Rename chat" aria-label="Rename chat">
                        <i class="fa-solid fa-pen-to-square fa-fw" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="menu_button menu_button_icon et-chats-delete" title="Delete chat" aria-label="Delete chat">
                        <i class="fa-solid fa-trash fa-fw" aria-hidden="true"></i>
                    </button>
                </span>
            </span>
        `;

        const open = () => void openChatRow(chat);
        row.addEventListener('click', (e) => {
            if (e.target instanceof Element && e.target.closest('.et-chats-actions')) {
                return;
            }
            open();
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });

        row.querySelector('.et-chats-pin')?.addEventListener('click', (e) => {
            e.stopPropagation();
            setPinned(
                { file_name: chat.file_name, avatar: chat.avatar, group: chat.group },
                !chat.pinned,
            );
            void refreshChatsScreen();
        });
        row.querySelector('.et-chats-rename')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void renameChatRow(chat);
        });
        row.querySelector('.et-chats-delete')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void deleteChatRow(chat);
        });

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
