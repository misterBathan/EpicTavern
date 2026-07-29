/**
 * Core Configuration Module
 * EpicTavern core RPG tracker (vendored from SpicyMarinara RPG Companion)
 */

/** @typedef {import('../types/inventory.js').InventoryV2} InventoryV2 */

/** Settings key in extension_settings (legacy third-party key kept for migration). */
export const extensionName = 'third-party/rpg-companion-sillytavern';

/** Static path for templates, CSS, and i18n under EpicTavern. */
export const extensionFolderPath = 'scripts/rpg';

/**
 * Default extension settings
 */
export const defaultSettings = {
    enabled: false,
    autoUpdate: true,
    updateDepth: 4,
    generationMode: 'together',
    smartUpdates: {
        enabled: true,
        minMessagesBetweenUpdates: 3,
        forceOnConditions: true,
        forceOnKeywords: true,
        sections: {
            userStats: true,
            infoBox: true,
            characters: true,
        },
    },
    showUserStats: true,
    showInfoBox: true,
    showCharacterThoughts: true,
    showAlternatePresentCharactersPanel: false,
    enableThoughtBasedExpressions: false,
    hideDefaultExpressionDisplay: false,
    showInventory: true,
    showQuests: true,
    showLockIcons: true,
    showThoughtsInChat: true,
    thoughtsInChatStyle: 'corner',
    enableHtmlPrompt: false,
    enableSpotifyMusic: false,
    customSpotifyPrompt: '',
    skipInjectionsForGuided: 'none',
    enablePlotButtons: true,
    saveTrackerHistory: false,
    panelPosition: 'right',
    theme: 'default',
    customColors: {
        bg: '#1a1a2e',
        accent: '#16213e',
        text: '#eaeaea',
        highlight: '#e94560'
    },
    statBarColorLow: '#cc3333',
    statBarColorHigh: '#33cc66',
    enableAnimations: true,
    mobileFabPosition: {
        top: 'calc(var(--topBarBlockSize) + 60px)',
        right: '12px'
    },
    userStats: {
        health: 100,
        satiety: 100,
        energy: 100,
        hygiene: 100,
        arousal: 0,
        mood: '😐',
        conditions: 'None',
        /** @type {InventoryV2} */
        inventory: {
            version: 2,
            onPerson: "None",
            stored: {},
            assets: "None"
        }
    },
    classicStats: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10
    },
    lastDiceRoll: null,
    collapsedInventoryLocations: []
};
