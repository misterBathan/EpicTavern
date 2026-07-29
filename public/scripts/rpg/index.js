/**
 * RPG tracker (panel / journal / generation hooks).
 * Based on SpicyMarinara/rpg-companion-sillytavern (AGPL-3.0).
 */

import { getContext, extension_settings as st_extension_settings } from '../extensions.js';
import { eventSource, event_types, substituteParams, chat, saveSettingsDebounced, chat_metadata, saveChatDebounced, user_avatar, getThumbnailUrl, characters, this_chid, extension_prompt_types, extension_prompt_roles, setExtensionPrompt, reloadCurrentChat, Generate, getRequestHeaders } from '../../script.js';
import { selected_group, getGroupMembers } from '../group-chats.js';
import { power_user } from '../power-user.js';

// Core modules
import { extensionName, extensionFolderPath } from './src/core/config.js';
import { i18n } from './src/core/i18n.js';
import { migrateToV3JSON } from './src/utils/jsonMigration.js';
import {
    extensionSettings,
    lastGeneratedData,
    committedTrackerData,
    lastActionWasSwipe,
    isGenerating,
    isPlotProgression,
    pendingDiceRoll,
    FALLBACK_AVATAR_DATA_URI,
    $panelContainer,
    $userStatsContainer,
    $infoBoxContainer,
    $thoughtsContainer,
    $inventoryContainer,
    $questsContainer,
    $musicPlayerContainer,
    setExtensionSettings,
    updateExtensionSettings,
    setLastGeneratedData,
    updateLastGeneratedData,
    setCommittedTrackerData,
    updateCommittedTrackerData,
    setLastActionWasSwipe,
    setIsGenerating,
    setIsPlotProgression,
    setPendingDiceRoll,
    setPanelContainer,
    setUserStatsContainer,
    setInfoBoxContainer,
    setThoughtsContainer,
    setInventoryContainer,
    setQuestsContainer,
    setMusicPlayerContainer,
    clearSessionAvatarPrompts
} from './src/core/state.js';
import { loadSettings, saveSettings, saveChatData, loadChatData, updateMessageSwipeData, commitTrackerDataFromPriorMessage } from './src/core/persistence.js';
import { registerAllEvents } from './src/core/events.js';

// Generation & Parsing modules
import {
    generateTrackerExample,
    generateTrackerInstructions,
    generateContextualSummary,
    generateRPGPromptText,
    generateSeparateUpdatePrompt
} from './src/systems/generation/promptBuilder.js';
import { parseResponse, parseUserStats } from './src/systems/generation/parser.js';
import { updateRPGData, testExternalAPIConnection } from './src/systems/generation/apiClient.js';
import { onGenerationStarted } from './src/systems/generation/injector.js';

// Rendering modules
import { getSafeThumbnailUrl } from './src/utils/avatars.js';
import { renderUserStats } from './src/systems/rendering/userStats.js';
import { renderInfoBox, updateInfoBoxField } from './src/systems/rendering/infoBox.js';
import {
    renderThoughts,
    updateCharacterField,
    removeCharacter,
    updateChatThoughts,
    createThoughtPanel
} from './src/systems/rendering/thoughts.js';
import { renderInventory } from './src/systems/rendering/inventory.js';
import { renderQuests } from './src/systems/rendering/quests.js';
import { renderMusicPlayer } from './src/systems/rendering/musicPlayer.js';
import { toggleSnowflakes, initSnowflakes } from './src/systems/ui/snowflakes.js';
import { toggleDynamicWeather, initWeatherEffects, updateWeatherEffect } from './src/systems/ui/weatherEffects.js';

// Interaction modules
import { initInventoryEventListeners } from './src/systems/interaction/inventoryActions.js';

// UI Systems modules
import {
    applyTheme,
    applyCustomTheme,
    toggleCustomColors,
    toggleAnimations,
    updateFeatureTogglesVisibility,
    updateSettingsPopupTheme,
    applyCustomThemeToSettingsPopup
} from './src/systems/ui/theme.js';
import {
    DiceModal,
    SettingsModal,
    setupDiceRoller,
    setupSettingsPopup,
    updateDiceDisplay,
    addDiceQuickReply,
    getSettingsModal,
    showWelcomeModalIfNeeded,
    showDeprecationModalIfNeeded
} from './src/systems/ui/modals.js';
import {
    initTrackerEditor
} from './src/systems/ui/trackerEditor.js';
import {
    initPromptsEditor
} from './src/systems/ui/promptsEditor.js';
import {
    initChapterCheckpointUI,
    injectCheckpointButton,
    updateAllCheckpointIndicators,
    cleanupCheckpointUI
} from './src/systems/ui/checkpointUI.js';
import { restoreCheckpointOnLoad } from './src/systems/features/chapterCheckpoint.js';
import {
    togglePlotButtons,
    updateCollapseToggleIcon,
    setupCollapseToggle,
    updatePanelVisibility,
    updateSectionVisibility,
    applyPanelPosition,
    updateGenerationModeUI
} from './src/systems/ui/layout.js';
import {
    setupMobileToggle,
    constrainFabToViewport,
    setupMobileTabs,
    removeMobileTabs,
    setupMobileKeyboardHandling,
    setupContentEditableScrolling,
    updateMobileTabLabels,
    updateFabWidgets
} from './src/systems/ui/mobile.js';
import {
    setupDesktopTabs,
    removeDesktopTabs,
    updateStripWidgets
} from './src/systems/ui/desktop.js';
import {
    removeAlternatePresentCharactersPanel,
    renderAlternatePresentCharacters
} from './src/systems/ui/alternatePresentCharacters.js';
import {
    initThoughtBasedExpressions,
    queueThoughtBasedExpressionsUpdate,
    onThoughtBasedExpressionsSettingChanged,
    onAlternatePresentCharactersVisibilityChanged,
    onHideDefaultExpressionDisplaySettingChanged,
    clearThoughtBasedExpressionsCache,
    onThoughtBasedExpressionsChatChanged,
    setThoughtBasedExpressionsRefreshHandler
} from './src/systems/integration/thoughtBasedExpressions.js';

// Feature modules
import { setupPlotButtons, sendPlotProgression } from './src/systems/features/plotProgression.js';
import { setupClassicStatsButtons } from './src/systems/features/classicStats.js';
import { ensureHtmlCleaningRegex, detectConflictingRegexScripts, ensureTrackerCleaningRegex } from './src/systems/features/htmlCleaning.js';
import { ensureJsonCleaningRegex, removeJsonCleaningRegex } from './src/systems/features/jsonCleaning.js';
import { parseAndStoreSpotifyUrl } from './src/systems/features/musicPlayer.js';
import { DEFAULT_HTML_PROMPT } from './src/systems/generation/promptBuilder.js';
import { openEncounterModal } from './src/systems/ui/encounterUI.js';
import { requestForcedTrackerUpdate, updateSmartUpdateStatusUI } from './src/systems/generation/updateGate.js';

// Integration modules
import {
    commitTrackerData,
    onMessageSent,
    onMessageReceived,
    onCharacterChanged,
    onChatLoaded,
    onMessageDeleted,
    onMessageSwiped,
    scheduleChatStateRehydration,
    updatePersonaAvatar,
    clearExtensionPrompts,
    onGenerationEnded,
    initHistoryInjection,
    sanitizeChatMessagesForTrackerJson
} from './src/systems/integration/sillytavern.js';

// Old state variable declarations removed - now imported from core modules
// (extensionSettings, lastGeneratedData, committedTrackerData, etc. are now in src/core/state.js)

setThoughtBasedExpressionsRefreshHandler(() => {
    renderAlternatePresentCharacters({ useCommittedFallback: true });
});

// Utility functions removed - now imported from src/utils/avatars.js
// (getSafeThumbnailUrl)

// Persistence functions removed - now imported from src/core/persistence.js
// (loadSettings, saveSettings, saveChatData, loadChatData, updateMessageSwipeData)

// Theme functions removed - now imported from src/systems/ui/theme.js
// (applyTheme, applyCustomTheme, toggleCustomColors, toggleAnimations,
//  updateSettingsPopupTheme, applyCustomThemeToSettingsPopup)

// Layout functions removed - now imported from src/systems/ui/layout.js
// (togglePlotButtons, updateCollapseToggleIcon, setupCollapseToggle,
//  updatePanelVisibility, updateSectionVisibility, applyPanelPosition)
// Note: closeMobilePanelWithAnimation is only used internally by mobile.js

// Mobile UI functions removed - now imported from src/systems/ui/mobile.js
// (setupMobileToggle, constrainFabToViewport, setupMobileTabs, removeMobileTabs,
//  setupMobileKeyboardHandling, setupContentEditableScrolling)

/**
 * Updates UI elements that are dynamically generated and not covered by data-i18n-key.
 */
function updateDynamicLabels() {
    // Update "Refresh RPG Info" button, but only if it's not disabled
    const refreshBtn = document.getElementById('rpg-manual-update');
    if (refreshBtn && !refreshBtn.disabled) {
        const refreshText = i18n.getTranslation('template.mainPanel.refreshRpgInfo') || 'Refresh RPG Info';
        refreshBtn.innerHTML = `<i class="fa-solid fa-sync"></i> ${refreshText}`;
    }

    // Update "Last Roll" label
    updateDiceDisplay();

    // Update mobile tab labels
    updateMobileTabLabels();
}

/**
 * Load an HTML fragment from the EpicTavern RPG folder.
 * @param {string} name Template basename without .html
 * @returns {Promise<string>}
 */
async function loadRpgTemplate(name) {
    const response = await fetch(`/${extensionFolderPath}/${name}.html`, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`Failed to load RPG template ${name}: ${response.status}`);
    }
    return response.text();
}

/**
 * Adds the extension settings to the Extensions tab.
 */
async function addExtensionSettings() {
    // Load the HTML template for the settings
    const settingsHtml = await loadRpgTemplate('settings');
    $('#extensions_settings2').append(settingsHtml);

    // Set up the enable/disable toggle
    $('#rpg-extension-enabled').prop('checked', extensionSettings.enabled).on('change', async function() {
        const wasEnabled = extensionSettings.enabled;
        extensionSettings.enabled = $(this).prop('checked');
        saveSettings();

        if (!extensionSettings.enabled && wasEnabled) {
            // Disabling extension - remove UI elements
            clearExtensionPrompts();
            updateChatThoughts(); // Remove thought bubbles
            cleanupCheckpointUI(); // Remove checkpoint buttons and indicators
            clearThoughtBasedExpressionsCache();

            // Disable dynamic weather effects
            toggleDynamicWeather(false);

            // Remove panel and toggle buttons
            $('#rpg-companion-panel').remove();
            $('#rpg-mobile-toggle').remove();
            $('#rpg-collapse-toggle').remove();
            $('#rpg-plot-buttons').remove(); // Remove plot buttons
            removeAlternatePresentCharactersPanel();
        } else if (extensionSettings.enabled && !wasEnabled) {
            // Enabling extension - initialize UI
            await initUI();
            loadChatData(); // Load chat data for current chat
            scheduleChatStateRehydration();
            initThoughtBasedExpressions();
            updateChatThoughts(); // Create thought bubbles if data exists
            injectCheckpointButton(); // Re-add checkpoint buttons
            updateAllCheckpointIndicators(); // Update button states
        }
    });

    // Set up language selector
    const langSelect = $('#rpg-companion-language-select');
    if (langSelect.length) {
        langSelect.val(i18n.currentLanguage);
        langSelect.on('change', async function() {
            const selectedLanguage = $(this).val();
            await i18n.setLanguage(selectedLanguage);
            // We need to re-apply translations to the settings panel specifically
            i18n.applyTranslations(document.getElementById('extensions_settings2'));
        });
    }
}

/**
 * Initializes the UI for the extension.
 */
async function initUI() {
    // Initialize i18n
    await i18n.init();

    // Only initialize UI if extension is enabled
    if (!extensionSettings.enabled) {
        // console.log('[RPG Companion] Extension disabled - skipping UI initialization');
        return;
    }

    // Load the HTML template
    const templateHtml = await loadRpgTemplate('template');

    // Ensure EpicTavern journal host exists, then mount the panel
    if (!$('#et-journal-screen').length) {
        $('body').append(`
            <div id="et-journal-screen" class="drawer-content closedDrawer" aria-label="Journal">
                <div id="et-journal-root"></div>
            </div>
        `);
    }

    // Append panel to body so Chat HUD + Journal CSS can reposition it
    if (!$('#rpg-companion-panel').length) {
        $('body').append(templateHtml);
    }

    // Add mobile toggle button (FAB - Floating Action Button)
    const theme = extensionSettings.theme || 'default';
    const mobileToggleHtml = `
        <button id="rpg-mobile-toggle" class="rpg-mobile-toggle" data-theme="${theme}" title="Toggle RPG Panel">
            <i class="fa-solid fa-dice-d20"></i>
        </button>
    `;
    $('body').append(mobileToggleHtml);

    // Hide mobile toggle on desktop viewport (> 1000px)
    if (window.innerWidth > 1000) {
        $('#rpg-mobile-toggle').hide();
    }

    // Cache UI elements using state setters
    setPanelContainer($('#rpg-companion-panel'));
    setUserStatsContainer($('#rpg-user-stats'));
    setInfoBoxContainer($('#rpg-info-box'));
    setThoughtsContainer($('#rpg-thoughts'));
    setInventoryContainer($('#rpg-inventory'));
    setQuestsContainer($('#rpg-quests'));
    setMusicPlayerContainer($('#rpg-music-player'));

    // Re-apply translations to the entire body to catch all new elements from the template
    i18n.applyTranslations(document.body);

    // Set up event listeners (enable/disable is handled in Extensions tab)
    $('#rpg-toggle-auto-update').on('change', function() {
        extensionSettings.autoUpdate = $(this).prop('checked');
        saveSettings();
    });

    function ensureSmartUpdatesSettings() {
        if (!extensionSettings.smartUpdates || typeof extensionSettings.smartUpdates !== 'object') {
            extensionSettings.smartUpdates = {
                enabled: true,
                minMessagesBetweenUpdates: 3,
                forceOnConditions: true,
                forceOnKeywords: true,
                sections: { userStats: true, infoBox: true, characters: true },
            };
        }
        if (!extensionSettings.smartUpdates.sections) {
            extensionSettings.smartUpdates.sections = { userStats: true, infoBox: true, characters: true };
        }
        return extensionSettings.smartUpdates;
    }

    function syncSmartUpdatesOptionsVisibility() {
        const on = $('#rpg-toggle-smart-updates').prop('checked');
        $('#rpg-smart-updates-options').css('opacity', on ? 1 : 0.5);
        $('#rpg-smart-min-messages, #rpg-smart-force-conditions, #rpg-smart-force-keywords, #rpg-smart-section-userStats, #rpg-smart-section-infoBox, #rpg-smart-section-characters')
            .prop('disabled', !on);
    }

    $('#rpg-toggle-smart-updates').on('change', function() {
        const smart = ensureSmartUpdatesSettings();
        smart.enabled = $(this).prop('checked');
        saveSettings();
        syncSmartUpdatesOptionsVisibility();
        updateSmartUpdateStatusUI();
    });

    $('#rpg-smart-min-messages').on('change', function() {
        const smart = ensureSmartUpdatesSettings();
        smart.minMessagesBetweenUpdates = Math.max(1, parseInt(String($(this).val()), 10) || 3);
        saveSettings();
    });

    $('#rpg-smart-force-conditions').on('change', function() {
        ensureSmartUpdatesSettings().forceOnConditions = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-smart-force-keywords').on('change', function() {
        ensureSmartUpdatesSettings().forceOnKeywords = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-smart-section-userStats').on('change', function() {
        ensureSmartUpdatesSettings().sections.userStats = $(this).prop('checked');
        saveSettings();
    });
    $('#rpg-smart-section-infoBox').on('change', function() {
        ensureSmartUpdatesSettings().sections.infoBox = $(this).prop('checked');
        saveSettings();
    });
    $('#rpg-smart-section-characters').on('change', function() {
        ensureSmartUpdatesSettings().sections.characters = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-position-select').on('change', function() {
        extensionSettings.panelPosition = String($(this).val());
        saveSettings();
        applyPanelPosition();
        // Recreate thought bubbles to update their position
        updateChatThoughts();
    });

    $('#rpg-update-depth').on('change', function() {
        const value = $(this).val();
        extensionSettings.updateDepth = parseInt(String(value));
        saveSettings();
    });

    $('#rpg-generation-mode').on('change', async function() {
        extensionSettings.generationMode = String($(this).val());
        saveSettings();
        updateGenerationModeUI();
    });

    $('#rpg-toggle-user-stats').on('change', function() {
        extensionSettings.showUserStats = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
    });

    $('#rpg-toggle-info-box').on('change', function() {
        extensionSettings.showInfoBox = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
    });

    $('#rpg-toggle-thoughts').on('change', function() {
        extensionSettings.showCharacterThoughts = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
        renderThoughts();
    });

    $('#rpg-toggle-alt-present-characters').on('change', function() {
        extensionSettings.showAlternatePresentCharactersPanel = $(this).prop('checked');
        saveSettings();
        renderThoughts();
        onAlternatePresentCharactersVisibilityChanged();
    });

    $('#rpg-toggle-thought-based-expressions').on('change', function() {
        extensionSettings.enableThoughtBasedExpressions = $(this).prop('checked');
        saveSettings();
        onThoughtBasedExpressionsSettingChanged(extensionSettings.enableThoughtBasedExpressions);
    });

    $('#rpg-toggle-hide-default-expressions').on('change', function() {
        extensionSettings.hideDefaultExpressionDisplay = $(this).prop('checked');
        saveSettings();
        onHideDefaultExpressionDisplaySettingChanged(extensionSettings.hideDefaultExpressionDisplay);
    });

    $('#rpg-toggle-inventory').on('change', function() {
        extensionSettings.showInventory = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
    });

    $('#rpg-toggle-quests').on('change', function() {
        extensionSettings.showQuests = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
    });

    $('#rpg-toggle-lock-icons').on('change', function() {
        extensionSettings.showLockIcons = $(this).prop('checked');
        saveSettings();
        // Re-render all sections to show/hide lock icons
        renderUserStats();
        renderInfoBox();
        renderThoughts();
        renderInventory();
        renderQuests();
    });

    $('#rpg-toggle-thoughts-in-chat').on('change', function() {
        extensionSettings.showThoughtsInChat = $(this).prop('checked');
        // console.log('[RPG Companion] Toggle showThoughtsInChat changed to:', extensionSettings.showThoughtsInChat);
        saveSettings();
        updateChatThoughts();
    });

    $('#rpg-toggle-inline-thoughts').on('change', function() {
        extensionSettings.thoughtsInChatStyle = $(this).prop('checked') ? 'inline' : 'corner';
        saveSettings();
        updateChatThoughts();
    });

    $('#rpg-toggle-html-prompt').on('change', function() {
        extensionSettings.enableHtmlPrompt = $(this).prop('checked');
        // console.log('[RPG Companion] Toggle enableHtmlPrompt changed to:', extensionSettings.enableHtmlPrompt);
        saveSettings();
    });

    $('#rpg-toggle-dialogue-coloring').on('change', function() {
        extensionSettings.enableDialogueColoring = $(this).prop('checked');
        // console.log('[RPG Companion] Toggle enableDialogueColoring changed to:', extensionSettings.enableDialogueColoring);
        saveSettings();
    });

    $('#rpg-toggle-deception').on('change', function() {
        extensionSettings.enableDeceptionSystem = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-toggle-omniscience').on('change', function() {
        extensionSettings.enableOmniscienceFilter = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-toggle-cyoa').on('change', function() {
        extensionSettings.enableCYOA = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-toggle-spotify-music').on('change', function() {
        extensionSettings.enableSpotifyMusic = $(this).prop('checked');
        saveSettings();
        updateSectionVisibility();
        renderMusicPlayer($musicPlayerContainer[0]);
    });



    $('#rpg-toggle-dynamic-weather').on('change', function() {
        extensionSettings.enableDynamicWeather = $(this).prop('checked');
        saveSettings();
        toggleDynamicWeather(extensionSettings.enableDynamicWeather);
    });

    $('#rpg-toggle-narrator').on('change', function() {
        extensionSettings.narratorMode = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-dismiss-promo').on('click', function() {
        extensionSettings.dismissedHolidayPromo = true;
        saveSettings();
        $('#rpg-holiday-promo').fadeOut(300);
    });

    $('#rpg-skip-guided-mode').on('change', function() {
        extensionSettings.skipInjectionsForGuided = String($(this).val());
        saveSettings();
    });

    $('#rpg-save-tracker-history').on('change', function() {
        extensionSettings.saveTrackerHistory = $(this).prop('checked');
        saveSettings();
    });

    $('#rpg-toggle-randomized-plot').on('change', function() {
        extensionSettings.enableRandomizedPlot = $(this).prop('checked');
        saveSettings();
        togglePlotButtons();
    });

    $('#rpg-toggle-natural-plot').on('change', function() {
        extensionSettings.enableNaturalPlot = $(this).prop('checked');
        saveSettings();
        togglePlotButtons();
    });

    $('#rpg-toggle-encounters').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = { enabled: true, historyDepth: 8, autoSaveLogs: true };
        }
        extensionSettings.encounterSettings.enabled = $(this).prop('checked');
        saveSettings();
        togglePlotButtons(); // This also controls encounter button visibility
    });

    $('#rpg-encounter-history-depth').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = { enabled: true, historyDepth: 8, autoSaveLogs: true };
        }
        const value = $(this).val();
        extensionSettings.encounterSettings.historyDepth = parseInt(String(value));
        saveSettings();
    });

    $('#rpg-toggle-autosave-logs').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = { enabled: true, historyDepth: 8, autoSaveLogs: true };
        }
        extensionSettings.encounterSettings.autoSaveLogs = $(this).prop('checked');
        saveSettings();
    });

    // Combat narrative style settings
    $('#rpg-combat-tense').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.combatNarrative) {
            extensionSettings.encounterSettings.combatNarrative = {};
        }
        extensionSettings.encounterSettings.combatNarrative.tense = $(this).val();
        saveSettings();
    });

    $('#rpg-combat-person').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.combatNarrative) {
            extensionSettings.encounterSettings.combatNarrative = {};
        }
        extensionSettings.encounterSettings.combatNarrative.person = $(this).val();
        saveSettings();
    });

    $('#rpg-combat-narration').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.combatNarrative) {
            extensionSettings.encounterSettings.combatNarrative = {};
        }
        extensionSettings.encounterSettings.combatNarrative.narration = $(this).val();
        saveSettings();
    });

    $('#rpg-combat-pov').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.combatNarrative) {
            extensionSettings.encounterSettings.combatNarrative = {};
        }
        extensionSettings.encounterSettings.combatNarrative.pov = $(this).val();
        saveSettings();
    });

    // Summary narrative style settings
    $('#rpg-summary-tense').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.summaryNarrative) {
            extensionSettings.encounterSettings.summaryNarrative = {};
        }
        extensionSettings.encounterSettings.summaryNarrative.tense = $(this).val();
        saveSettings();
    });

    $('#rpg-summary-person').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.summaryNarrative) {
            extensionSettings.encounterSettings.summaryNarrative = {};
        }
        extensionSettings.encounterSettings.summaryNarrative.person = $(this).val();
        saveSettings();
    });

    $('#rpg-summary-narration').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.summaryNarrative) {
            extensionSettings.encounterSettings.summaryNarrative = {};
        }
        extensionSettings.encounterSettings.summaryNarrative.narration = $(this).val();
        saveSettings();
    });

    $('#rpg-summary-pov').on('change', function() {
        if (!extensionSettings.encounterSettings) {
            extensionSettings.encounterSettings = {};
        }
        if (!extensionSettings.encounterSettings.summaryNarrative) {
            extensionSettings.encounterSettings.summaryNarrative = {};
        }
        extensionSettings.encounterSettings.summaryNarrative.pov = $(this).val();
        saveSettings();
    });

    // Feature toggle visibility controls
    $('#rpg-toggle-show-html-toggle').on('change', function() {
        extensionSettings.showHtmlToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-dialogue-coloring-toggle').on('change', function() {
        extensionSettings.showDialogueColoringToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-deception-toggle').on('change', function() {
        extensionSettings.showDeceptionToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-omniscience-toggle').on('change', function() {
        extensionSettings.showOmniscienceToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-cyoa-toggle').on('change', function() {
        extensionSettings.showCYOAToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-spotify-toggle').on('change', function() {
        extensionSettings.showSpotifyToggle = $(this).prop('checked');
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-dynamic-weather-toggle').on('change', function() {
        extensionSettings.showDynamicWeatherToggle = $(this).prop('checked');
        // Also disable the feature when hiding the toggle
        if (!extensionSettings.showDynamicWeatherToggle) {
            extensionSettings.enableDynamicWeather = false;
            $('#rpg-toggle-dynamic-weather').prop('checked', false);
            toggleDynamicWeather(false);
        }
        saveSettings();
        updateFeatureTogglesVisibility();
        updateWeatherSubOptionsVisibility();
    });

    // Weather sub-options (background and foreground) - radio buttons
    $('#rpg-toggle-weather-background').on('change', function() {
        if ($(this).prop('checked')) {
            extensionSettings.weatherBackground = true;
            extensionSettings.weatherForeground = false;
            saveSettings();
            // Re-apply weather effect
            if (extensionSettings.enableDynamicWeather) {
                toggleDynamicWeather(false);
                toggleDynamicWeather(true);
            }
        }
    });

    $('#rpg-toggle-weather-foreground').on('change', function() {
        if ($(this).prop('checked')) {
            extensionSettings.weatherBackground = false;
            extensionSettings.weatherForeground = true;
            saveSettings();
            // Re-apply weather effect
            if (extensionSettings.enableDynamicWeather) {
                toggleDynamicWeather(false);
                toggleDynamicWeather(true);
            }
        }
    });

    $('#rpg-toggle-show-narrator-mode').on('change', function() {
        extensionSettings.showNarratorMode = $(this).prop('checked');
        // Also disable the feature when hiding the toggle
        if (!extensionSettings.showNarratorMode) {
            extensionSettings.narratorMode = false;
            $('#rpg-toggle-narrator').prop('checked', false);
        }
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    $('#rpg-toggle-show-auto-avatars').on('change', function() {
        extensionSettings.showAutoAvatars = $(this).prop('checked');
        // Also disable the feature when hiding the toggle
        if (!extensionSettings.showAutoAvatars) {
            extensionSettings.autoGenerateAvatars = false;
            $('#rpg-toggle-auto-avatars-panel').prop('checked', false);
        }
        saveSettings();
        updateFeatureTogglesVisibility();
    });

    // Auto avatar generation panel toggle
    $('#rpg-toggle-auto-avatars-panel').on('change', function() {
        extensionSettings.autoGenerateAvatars = $(this).prop('checked');
        saveSettings();

        // Re-render thoughts to update tooltips (regenerate vs delete)
        renderThoughts();
    });

    $('#rpg-toggle-dice-display').on('change', function() {
        extensionSettings.showDiceDisplay = $(this).prop('checked');
        saveSettings();
        updateDiceDisplay();
    });

    // Mobile FAB Widget toggles - simplified, no position saving (auto-positioned)
    $('#rpg-toggle-fab-widgets-enabled').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        extensionSettings.mobileFabWidgets.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
        $('#rpg-fab-widget-options').toggle(extensionSettings.mobileFabWidgets.enabled);
    });

    $('#rpg-toggle-fab-weather-icon').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.weatherIcon) extensionSettings.mobileFabWidgets.weatherIcon = {};
        extensionSettings.mobileFabWidgets.weatherIcon.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-weather-desc').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.weatherDesc) extensionSettings.mobileFabWidgets.weatherDesc = {};
        extensionSettings.mobileFabWidgets.weatherDesc.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-clock').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.clock) extensionSettings.mobileFabWidgets.clock = {};
        extensionSettings.mobileFabWidgets.clock.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-date').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.date) extensionSettings.mobileFabWidgets.date = {};
        extensionSettings.mobileFabWidgets.date.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-location').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.location) extensionSettings.mobileFabWidgets.location = {};
        extensionSettings.mobileFabWidgets.location.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-stats').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.stats) extensionSettings.mobileFabWidgets.stats = {};
        extensionSettings.mobileFabWidgets.stats.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    $('#rpg-toggle-fab-attributes').on('change', function() {
        if (!extensionSettings.mobileFabWidgets) extensionSettings.mobileFabWidgets = {};
        if (!extensionSettings.mobileFabWidgets.attributes) extensionSettings.mobileFabWidgets.attributes = {};
        extensionSettings.mobileFabWidgets.attributes.enabled = $(this).prop('checked');
        saveSettings();
        updateFabWidgets();
    });

    // Desktop Strip Widget toggles
    $('#rpg-toggle-strip-widgets-enabled').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        extensionSettings.desktopStripWidgets.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
        $('#rpg-strip-widget-options').toggle(extensionSettings.desktopStripWidgets.enabled);
    });

    $('#rpg-toggle-strip-weather-icon').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.weatherIcon) extensionSettings.desktopStripWidgets.weatherIcon = {};
        extensionSettings.desktopStripWidgets.weatherIcon.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-toggle-strip-clock').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.clock) extensionSettings.desktopStripWidgets.clock = {};
        extensionSettings.desktopStripWidgets.clock.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-toggle-strip-date').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.date) extensionSettings.desktopStripWidgets.date = {};
        extensionSettings.desktopStripWidgets.date.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-toggle-strip-location').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.location) extensionSettings.desktopStripWidgets.location = {};
        extensionSettings.desktopStripWidgets.location.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-toggle-strip-stats').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.stats) extensionSettings.desktopStripWidgets.stats = {};
        extensionSettings.desktopStripWidgets.stats.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-toggle-strip-attributes').on('change', function() {
        if (!extensionSettings.desktopStripWidgets) extensionSettings.desktopStripWidgets = {};
        if (!extensionSettings.desktopStripWidgets.attributes) extensionSettings.desktopStripWidgets.attributes = {};
        extensionSettings.desktopStripWidgets.attributes.enabled = $(this).prop('checked');
        saveSettings();
        updateStripWidgets();
    });

    $('#rpg-manual-update, #rpg-header-refresh').on('click', async function() {
        if (!extensionSettings.enabled) {
            // console.log('[RPG Companion] Extension is disabled. Please enable it in the Extensions tab.');
            return;
        }
        requestForcedTrackerUpdate();
        const currentChat = getContext().chat;
        let lastAssistantIndex = -1;
        for (let i = currentChat.length - 1; i >= 0; i--) {
            if (!currentChat[i].is_user && !currentChat[i].is_system) {
                lastAssistantIndex = i;
                break;
            }
        }
        if (lastAssistantIndex !== -1) {
            commitTrackerDataFromPriorMessage(lastAssistantIndex);
        }
        await updateRPGData(renderUserStats, renderInfoBox, renderThoughts, renderInventory, null, { force: true });
    });

    // Strip widget refresh button - same functionality as main refresh button
    $('#rpg-strip-refresh').on('click', async function() {
        if (!extensionSettings.enabled) {
            return;
        }
        requestForcedTrackerUpdate();
        const currentChat = getContext().chat;
        let lastAssistantIndex = -1;
        for (let i = currentChat.length - 1; i >= 0; i--) {
            if (!currentChat[i].is_user && !currentChat[i].is_system) {
                lastAssistantIndex = i;
                break;
            }
        }
        if (lastAssistantIndex !== -1) {
            commitTrackerDataFromPriorMessage(lastAssistantIndex);
        }
        await updateRPGData(renderUserStats, renderInfoBox, renderThoughts, renderInventory, null, { force: true });
    });

    $('#rpg-stat-bar-color-low').on('change', function() {
        extensionSettings.statBarColorLow = String($(this).val());
        saveSettings();
        renderUserStats(); // Re-render with new colors
    });

    $('#rpg-stat-bar-color-low-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.statBarColorLowOpacity = opacity;
        $('#rpg-stat-bar-color-low-opacity-value').text(opacity + '%');
        renderUserStats();
    }).on('change', function() {
        saveSettings();
    });

    $('#rpg-stat-bar-color-high').on('change', function() {
        extensionSettings.statBarColorHigh = String($(this).val());
        saveSettings();
        renderUserStats(); // Re-render with new colors
    });

    $('#rpg-stat-bar-color-high-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.statBarColorHighOpacity = opacity;
        $('#rpg-stat-bar-color-high-opacity-value').text(opacity + '%');
        renderUserStats();
    }).on('change', function() {
        saveSettings();
    });

    // Theme selection
    $('#rpg-theme-select').on('change', function() {
        extensionSettings.theme = String($(this).val());
        saveSettings();
        applyTheme();
        toggleCustomColors();
        updateSettingsPopupTheme(getSettingsModal()); // Update popup theme instantly
        updateChatThoughts(); // Recreate thought bubbles with new theme
    });

    // Custom color pickers
    $('#rpg-custom-bg').on('change', function() {
        extensionSettings.customColors.bg = String($(this).val());
        saveSettings();
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal()); // Update popup theme instantly
            updateChatThoughts(); // Update thought bubbles
        }
    });

    $('#rpg-custom-bg-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.customColors.bgOpacity = opacity;
        $('#rpg-custom-bg-opacity-value').text(opacity + '%');
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal());
            updateChatThoughts();
        }
    }).on('change', function() {
        saveSettings();
    });

    $('#rpg-custom-accent').on('change', function() {
        extensionSettings.customColors.accent = String($(this).val());
        saveSettings();
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal()); // Update popup theme instantly
            updateChatThoughts(); // Update thought bubbles
        }
    });

    $('#rpg-custom-accent-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.customColors.accentOpacity = opacity;
        $('#rpg-custom-accent-opacity-value').text(opacity + '%');
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal());
            updateChatThoughts();
        }
    }).on('change', function() {
        saveSettings();
    });

    $('#rpg-custom-text').on('change', function() {
        extensionSettings.customColors.text = String($(this).val());
        saveSettings();
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal()); // Update popup theme instantly
            updateChatThoughts(); // Update thought bubbles
        }
    });

    $('#rpg-custom-text-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.customColors.textOpacity = opacity;
        $('#rpg-custom-text-opacity-value').text(opacity + '%');
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal());
            updateChatThoughts();
        }
    }).on('change', function() {
        saveSettings();
    });

    $('#rpg-custom-highlight').on('change', function() {
        extensionSettings.customColors.highlight = String($(this).val());
        saveSettings();
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal()); // Update popup theme instantly
            updateChatThoughts(); // Update thought bubbles
        }
    });

    $('#rpg-custom-highlight-opacity').on('input', function() {
        const opacity = Number($(this).val());
        extensionSettings.customColors.highlightOpacity = opacity;
        $('#rpg-custom-highlight-opacity-value').text(opacity + '%');
        if (extensionSettings.theme === 'custom') {
            applyCustomTheme();
            updateSettingsPopupTheme(getSettingsModal());
            updateChatThoughts();
        }
    }).on('change', function() {
        saveSettings();
    });

    // External API settings event handlers
    $('#rpg-external-base-url').on('change', function() {
        if (!extensionSettings.externalApiSettings) {
            extensionSettings.externalApiSettings = {
                baseUrl: '', apiKey: '', model: '', maxTokens: 8192, temperature: 0.7
            };
        }
        extensionSettings.externalApiSettings.baseUrl = String($(this).val()).trim();
        saveSettings();
    });

    $('#rpg-external-api-key').on('change', function() {
        // Securely store API key in localStorage instead of shared extension settings
        const apiKey = String($(this).val()).trim();
        localStorage.setItem('rpg_companion_external_api_key', apiKey);

        // Ensure the externalApiSettings object exists, but don't store the key in it
        if (!extensionSettings.externalApiSettings) {
            extensionSettings.externalApiSettings = {
                baseUrl: '', model: '', maxTokens: 8192, temperature: 0.7
            };
            saveSettings();
        }
    });

    $('#rpg-external-model').on('change', function() {
        if (!extensionSettings.externalApiSettings) {
            extensionSettings.externalApiSettings = {
                baseUrl: '', apiKey: '', model: '', maxTokens: 8192, temperature: 0.7
            };
        }
        extensionSettings.externalApiSettings.model = String($(this).val()).trim();
        saveSettings();
    });

    $('#rpg-external-max-tokens').on('change', function() {
        if (!extensionSettings.externalApiSettings) {
            extensionSettings.externalApiSettings = {
                baseUrl: '', apiKey: '', model: '', maxTokens: 8192, temperature: 0.7
            };
        }
        extensionSettings.externalApiSettings.maxTokens = parseInt(String($(this).val()));
        saveSettings();
    });

    $('#rpg-external-temperature').on('change', function() {
        if (!extensionSettings.externalApiSettings) {
            extensionSettings.externalApiSettings = {
                baseUrl: '', apiKey: '', model: '', maxTokens: 8192, temperature: 0.7
            };
        }
        extensionSettings.externalApiSettings.temperature = parseFloat(String($(this).val()));
        saveSettings();
    });

    $('#rpg-toggle-api-key-visibility').on('click', function() {
        const $input = $('#rpg-external-api-key');
        const type = $input.attr('type') === 'password' ? 'text' : 'password';
        $input.attr('type', type);
        $(this).find('i').toggleClass('fa-eye fa-eye-slash');
    });

    $('#rpg-test-external-api').on('click', async function() {
        const $result = $('#rpg-external-api-test-result');
        const $btn = $(this);
        const originalText = $btn.html();

        $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Testing...').prop('disabled', true);
        $result.hide().removeClass('rpg-success-message rpg-error-message');

        try {
            const result = await testExternalAPIConnection();

            if (result.success) {
                $result.addClass('rpg-success-message')
                    .html(`<i class="fa-solid fa-check-circle"></i> ${result.message}`)
                    .slideDown();
                toastr.success(result.message);
            } else {
                $result.addClass('rpg-error-message')
                    .html(`<i class="fa-solid fa-exclamation-circle"></i> ${result.message}`)
                    .slideDown();
                toastr.error(result.message);
            }
        } catch (error) {
            $result.addClass('rpg-error-message')
                .html(`<i class="fa-solid fa-exclamation-circle"></i> Error: ${error.message}`)
                .slideDown();
        } finally {
            $btn.html(originalText).prop('disabled', false);
        }
    });

    // Initialize UI state (enable/disable is in Extensions tab)
    $('#rpg-toggle-auto-update').prop('checked', extensionSettings.autoUpdate);
    {
        const smart = extensionSettings.smartUpdates || {};
        const sections = smart.sections || {};
        $('#rpg-toggle-smart-updates').prop('checked', smart.enabled !== false);
        $('#rpg-smart-min-messages').val(smart.minMessagesBetweenUpdates ?? 3);
        $('#rpg-smart-force-conditions').prop('checked', smart.forceOnConditions !== false);
        $('#rpg-smart-force-keywords').prop('checked', smart.forceOnKeywords !== false);
        $('#rpg-smart-section-userStats').prop('checked', sections.userStats !== false);
        $('#rpg-smart-section-infoBox').prop('checked', sections.infoBox !== false);
        $('#rpg-smart-section-characters').prop('checked', sections.characters !== false);
        syncSmartUpdatesOptionsVisibility();
    }
    $('#rpg-position-select').val(extensionSettings.panelPosition);
    $('#rpg-update-depth').val(extensionSettings.updateDepth);
    $('#rpg-toggle-user-stats').prop('checked', extensionSettings.showUserStats);
    $('#rpg-toggle-info-box').prop('checked', extensionSettings.showInfoBox);
    $('#rpg-toggle-thoughts').prop('checked', extensionSettings.showCharacterThoughts);
    $('#rpg-toggle-alt-present-characters').prop('checked', extensionSettings.showAlternatePresentCharactersPanel ?? false);
    $('#rpg-toggle-thought-based-expressions').prop('checked', extensionSettings.enableThoughtBasedExpressions === true);
    $('#rpg-toggle-hide-default-expressions').prop('checked', extensionSettings.hideDefaultExpressionDisplay === true);
    $('#rpg-toggle-inventory').prop('checked', extensionSettings.showInventory);
    $('#rpg-toggle-quests').prop('checked', extensionSettings.showQuests);
    $('#rpg-toggle-lock-icons').prop('checked', extensionSettings.showLockIcons ?? true);
    $('#rpg-toggle-thoughts-in-chat').prop('checked', extensionSettings.showThoughtsInChat);
    $('#rpg-toggle-inline-thoughts').prop('checked', (extensionSettings.thoughtsInChatStyle || 'corner') === 'inline');
    $('#rpg-toggle-html-prompt').prop('checked', extensionSettings.enableHtmlPrompt);
    $('#rpg-toggle-dialogue-coloring').prop('checked', extensionSettings.enableDialogueColoring);
    $('#rpg-toggle-deception').prop('checked', extensionSettings.enableDeceptionSystem ?? false);
    $('#rpg-toggle-omniscience').prop('checked', extensionSettings.enableOmniscienceFilter ?? false);
    $('#rpg-toggle-cyoa').prop('checked', extensionSettings.enableCYOA ?? false);
    $('#rpg-toggle-spotify-music').prop('checked', extensionSettings.enableSpotifyMusic);

    $('#rpg-toggle-dynamic-weather').prop('checked', extensionSettings.enableDynamicWeather);
    $('#rpg-toggle-narrator').prop('checked', extensionSettings.narratorMode);

    // Feature toggle visibility settings
    $('#rpg-toggle-show-html-toggle').prop('checked', extensionSettings.showHtmlToggle ?? true);
    $('#rpg-toggle-show-dialogue-coloring-toggle').prop('checked', extensionSettings.showDialogueColoringToggle ?? true);
    $('#rpg-toggle-show-deception-toggle').prop('checked', extensionSettings.showDeceptionToggle ?? true);
    $('#rpg-toggle-show-omniscience-toggle').prop('checked', extensionSettings.showOmniscienceToggle ?? true);
    $('#rpg-toggle-show-cyoa-toggle').prop('checked', extensionSettings.showCYOAToggle ?? true);
    $('#rpg-toggle-show-spotify-toggle').prop('checked', extensionSettings.showSpotifyToggle ?? true);
    $('#rpg-toggle-show-dynamic-weather-toggle').prop('checked', extensionSettings.showDynamicWeatherToggle ?? true);
    $('#rpg-toggle-weather-background').prop('checked', extensionSettings.weatherBackground ?? true);
    $('#rpg-toggle-weather-foreground').prop('checked', extensionSettings.weatherForeground ?? false);
    $('#rpg-toggle-show-narrator-mode').prop('checked', extensionSettings.showNarratorMode ?? true);
    $('#rpg-toggle-show-auto-avatars').prop('checked', extensionSettings.showAutoAvatars ?? true);

    // Hide holiday promo if previously dismissed
    if (extensionSettings.dismissedHolidayPromo) {
        $('#rpg-holiday-promo').hide();
    }

    $('#rpg-toggle-randomized-plot').prop('checked', extensionSettings.enableRandomizedPlot ?? true);
    $('#rpg-toggle-natural-plot').prop('checked', extensionSettings.enableNaturalPlot ?? true);
    $('#rpg-toggle-encounters').prop('checked', extensionSettings.encounterSettings?.enabled ?? true);
    $('#rpg-encounter-history-depth').val(extensionSettings.encounterSettings?.historyDepth ?? 8);
    $('#rpg-toggle-autosave-logs').prop('checked', extensionSettings.encounterSettings?.autoSaveLogs ?? true);

    // Combat narrative style
    $('#rpg-combat-tense').val(extensionSettings.encounterSettings?.combatNarrative?.tense ?? 'present');
    $('#rpg-combat-person').val(extensionSettings.encounterSettings?.combatNarrative?.person ?? 'third');
    $('#rpg-combat-narration').val(extensionSettings.encounterSettings?.combatNarrative?.narration ?? 'omniscient');
    $('#rpg-combat-pov').val(extensionSettings.encounterSettings?.combatNarrative?.pov ?? 'narrator');

    // Summary narrative style
    $('#rpg-summary-tense').val(extensionSettings.encounterSettings?.summaryNarrative?.tense ?? 'past');
    $('#rpg-summary-person').val(extensionSettings.encounterSettings?.summaryNarrative?.person ?? 'third');
    $('#rpg-summary-narration').val(extensionSettings.encounterSettings?.summaryNarrative?.narration ?? 'omniscient');
    $('#rpg-summary-pov').val(extensionSettings.encounterSettings?.summaryNarrative?.pov ?? 'narrator');

    // Initialize avatar options (panel toggle)
    $('#rpg-toggle-auto-avatars-panel').prop('checked', extensionSettings.autoGenerateAvatars || false);

    $('#rpg-toggle-dice-display').prop('checked', extensionSettings.showDiceDisplay);

    // Initialize Mobile FAB Widget checkboxes
    const fabWidgets = extensionSettings.mobileFabWidgets || {};
    $('#rpg-toggle-fab-widgets-enabled').prop('checked', fabWidgets.enabled || false);
    $('#rpg-toggle-fab-weather-icon').prop('checked', fabWidgets.weatherIcon?.enabled || false);
    $('#rpg-toggle-fab-weather-desc').prop('checked', fabWidgets.weatherDesc?.enabled || false);
    $('#rpg-toggle-fab-clock').prop('checked', fabWidgets.clock?.enabled || false);
    $('#rpg-toggle-fab-date').prop('checked', fabWidgets.date?.enabled || false);
    $('#rpg-toggle-fab-location').prop('checked', fabWidgets.location?.enabled || false);
    $('#rpg-toggle-fab-stats').prop('checked', fabWidgets.stats?.enabled || false);
    $('#rpg-toggle-fab-attributes').prop('checked', fabWidgets.attributes?.enabled || false);
    // Toggle visibility of widget options based on master toggle
    $('#rpg-fab-widget-options').toggle(fabWidgets.enabled || false);

    // Initialize Desktop Strip Widget checkboxes
    const stripWidgets = extensionSettings.desktopStripWidgets || {};
    $('#rpg-toggle-strip-widgets-enabled').prop('checked', stripWidgets.enabled || false);
    $('#rpg-toggle-strip-weather-icon').prop('checked', stripWidgets.weatherIcon?.enabled ?? true);
    $('#rpg-toggle-strip-clock').prop('checked', stripWidgets.clock?.enabled ?? true);
    $('#rpg-toggle-strip-date').prop('checked', stripWidgets.date?.enabled ?? true);
    $('#rpg-toggle-strip-location').prop('checked', stripWidgets.location?.enabled ?? true);
    $('#rpg-toggle-strip-stats').prop('checked', stripWidgets.stats?.enabled ?? true);
    $('#rpg-toggle-strip-attributes').prop('checked', stripWidgets.attributes?.enabled ?? true);
    // Toggle visibility of strip widget options based on master toggle
    $('#rpg-strip-widget-options').toggle(stripWidgets.enabled || false);

    $('#rpg-stat-bar-color-low').val(extensionSettings.statBarColorLow);
    $('#rpg-stat-bar-color-low-opacity').val(extensionSettings.statBarColorLowOpacity ?? 100);
    $('#rpg-stat-bar-color-low-opacity-value').text((extensionSettings.statBarColorLowOpacity ?? 100) + '%');

    $('#rpg-stat-bar-color-high').val(extensionSettings.statBarColorHigh);
    $('#rpg-stat-bar-color-high-opacity').val(extensionSettings.statBarColorHighOpacity ?? 100);
    $('#rpg-stat-bar-color-high-opacity-value').text((extensionSettings.statBarColorHighOpacity ?? 100) + '%');

    $('#rpg-theme-select').val(extensionSettings.theme);
    $('#rpg-custom-bg').val(extensionSettings.customColors.bg);
    $('#rpg-custom-bg-opacity').val(extensionSettings.customColors.bgOpacity ?? 100);
    $('#rpg-custom-bg-opacity-value').text((extensionSettings.customColors.bgOpacity ?? 100) + '%');

    $('#rpg-custom-accent').val(extensionSettings.customColors.accent);
    $('#rpg-custom-accent-opacity').val(extensionSettings.customColors.accentOpacity ?? 100);
    $('#rpg-custom-accent-opacity-value').text((extensionSettings.customColors.accentOpacity ?? 100) + '%');

    $('#rpg-custom-text').val(extensionSettings.customColors.text);
    $('#rpg-custom-text-opacity').val(extensionSettings.customColors.textOpacity ?? 100);
    $('#rpg-custom-text-opacity-value').text((extensionSettings.customColors.textOpacity ?? 100) + '%');

    $('#rpg-custom-highlight').val(extensionSettings.customColors.highlight);
    $('#rpg-custom-highlight-opacity').val(extensionSettings.customColors.highlightOpacity ?? 100);
    $('#rpg-custom-highlight-opacity-value').text((extensionSettings.customColors.highlightOpacity ?? 100) + '%');

    // Initialize External API settings values
    if (extensionSettings.externalApiSettings) {
        $('#rpg-external-base-url').val(extensionSettings.externalApiSettings.baseUrl || '');

        // Load API Key from secure localStorage
        const storedApiKey = localStorage.getItem('rpg_companion_external_api_key') || '';
        $('#rpg-external-api-key').val(storedApiKey);

        $('#rpg-external-model').val(extensionSettings.externalApiSettings.model || '');
        $('#rpg-external-max-tokens').val(extensionSettings.externalApiSettings.maxTokens || 8192);
        $('#rpg-external-temperature').val(extensionSettings.externalApiSettings.temperature ?? 0.7);
    }

    $('#rpg-generation-mode').val(extensionSettings.generationMode);
    $('#rpg-skip-guided-mode').val(extensionSettings.skipInjectionsForGuided);

    updatePanelVisibility();
    updateSectionVisibility();
    updateGenerationModeUI();
    applyTheme();
    applyPanelPosition();
    toggleCustomColors();
    toggleAnimations();
    updateFeatureTogglesVisibility();
    togglePlotButtons(); // Initialize plot buttons and encounter button visibility
    initWeatherEffects(); // Initialize dynamic weather effects

    // Setup mobile toggle button
    setupMobileToggle();

    // Setup tabs based on viewport
    if (window.innerWidth > 1000) {
        setupDesktopTabs();
    } else {
        setupMobileTabs();
    }

    // Setup collapse/expand toggle button
    setupCollapseToggle();

    // Render initial data if available
    renderUserStats();
    renderInfoBox();
    renderThoughts();
    renderInventory();
    renderQuests();
    renderMusicPlayer($musicPlayerContainer[0]);
    updateDiceDisplay();
    setupDiceRoller();
    setupClassicStatsButtons();
    setupSettingsPopup();
    initTrackerEditor();
    initPromptsEditor();
    addDiceQuickReply();
    setupPlotButtons(sendPlotProgression, openEncounterModal);
    setupMobileKeyboardHandling();
    setupContentEditableScrolling();
    initInventoryEventListeners();

    // Initialize chapter checkpoint UI
    initChapterCheckpointUI();
    injectCheckpointButton();

    // Expose weather effect functions globally for cross-module access
    if (!window.RPGCompanion) {
        window.RPGCompanion = {};
    }
    window.RPGCompanion.updateWeatherEffect = updateWeatherEffect;
}





// Rendering functions removed - now imported from src/systems/rendering/*
// (renderUserStats, renderInfoBox, renderThoughts, updateInfoBoxField,
//  updateCharacterField, updateChatThoughts, createThoughtPanel)

// Event handlers removed - now imported from src/systems/integration/sillytavern.js
// (commitTrackerData, onMessageSent, onMessageReceived, onCharacterChanged,
//  onMessageSwiped, updatePersonaAvatar, clearExtensionPrompts)

/**
 * Init RPG tracker after the app shell is ready.
 */
export async function initRpgCompanion() {
    try {
        console.log('[EpicTavern RPG] Starting initialization...');

        // Load settings with validation
        try {
            loadSettings();
        } catch (error) {
            console.error('[EpicTavern RPG] Settings load failed, continuing with defaults:', error);
        }

        // RPG Companion is opt-in (token cost). Do not force-enable.
        if (extensionSettings.enabled === undefined || extensionSettings.enabled === null) {
            extensionSettings.enabled = false;
            saveSettings();
        }

        // Check if migration to v3 JSON format is needed
        try {
            if (extensionSettings.settingsVersion < 3) {
                await migrateToV3JSON();
                updateExtensionSettings({ settingsVersion: 3 });
                await saveSettings();
            }
        } catch (error) {
            console.error('[EpicTavern RPG] Migration to v3 failed:', error);
        }

        await i18n.init();
        i18n.addEventListener('languageChanged', updateDynamicLabels);

        try {
            await addExtensionSettings();
        } catch (error) {
            console.error('[EpicTavern RPG] Failed to add settings tab:', error);
        }

        try {
            await initUI();
        } catch (error) {
            console.error('[EpicTavern RPG] UI initialization failed:', error);
            throw error;
        }

        try {
            loadChatData();
            scheduleChatStateRehydration();
            initThoughtBasedExpressions();
            updateFabWidgets();
            updateStripWidgets();
        } catch (error) {
            console.error('[EpicTavern RPG] Chat data load failed, using defaults:', error);
        }

        try {
            await ensureHtmlCleaningRegex(st_extension_settings, saveSettingsDebounced);
        } catch (error) {
            console.error('[EpicTavern RPG] HTML regex import failed:', error);
        }

        try {
            await ensureTrackerCleaningRegex(st_extension_settings, saveSettingsDebounced);
        } catch (error) {
            console.error('[EpicTavern RPG] Tracker cleaning regex import failed:', error);
        }

        try {
            await ensureJsonCleaningRegex(st_extension_settings, saveSettingsDebounced);
        } catch (error) {
            console.error('[EpicTavern RPG] JSON cleaning regex setup failed:', error);
        }

        try {
            detectConflictingRegexScripts(st_extension_settings);
        } catch (error) {
            console.error('[EpicTavern RPG] Conflict detection failed:', error);
        }

        try {
            initHistoryInjection();
        } catch (error) {
            console.error('[EpicTavern RPG] History injection init failed:', error);
        }

        try {
            registerAllEvents({
                [event_types.MESSAGE_SENT]: onMessageSent,
                [event_types.GENERATION_STARTED]: onGenerationStarted,
                [event_types.MESSAGE_RECEIVED]: onMessageReceived,
                [event_types.GENERATION_STOPPED]: onGenerationEnded,
                [event_types.GENERATION_ENDED]: onGenerationEnded,
                [event_types.CHAT_CHANGED]: [onCharacterChanged, updatePersonaAvatar, restoreCheckpointOnLoad, clearSessionAvatarPrompts],
                [event_types.CHAT_LOADED]: onChatLoaded,
                [event_types.MESSAGE_DELETED]: onMessageDeleted,
                [event_types.MESSAGE_SWIPE_DELETED]: onMessageDeleted,
                [event_types.MESSAGE_SWIPED]: onMessageSwiped,
                [event_types.USER_MESSAGE_RENDERED]: updatePersonaAvatar,
                [event_types.SETTINGS_UPDATED]: updatePersonaAvatar
            });

            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
                if (!extensionSettings.enabled) return;
                const renderedMessage = chat[messageId];
                if (renderedMessage && !renderedMessage.is_user && !renderedMessage.is_system) {
                    queueThoughtBasedExpressionsUpdate();
                }
            });

            eventSource.on(event_types.MESSAGE_UPDATED, (messageId) => {
                if (!extensionSettings.enabled) return;
                const updatedMessage = chat[messageId];
                if (updatedMessage && !updatedMessage.is_user && !updatedMessage.is_system) {
                    queueThoughtBasedExpressionsUpdate();
                }
            });

            eventSource.on(event_types.MESSAGE_SWIPED, (messageIndex) => {
                if (!extensionSettings.enabled) return;
                const swipedMessage = chat[messageIndex];
                if (swipedMessage && !swipedMessage.is_user && !swipedMessage.is_system) {
                    queueThoughtBasedExpressionsUpdate({ immediate: true });
                }
            });

            eventSource.on(event_types.CHAT_CHANGED, () => {
                clearThoughtBasedExpressionsCache();
                updatePanelVisibility();
                setTimeout(() => onThoughtBasedExpressionsChatChanged(), 0);
            });

            eventSource.on(event_types.MESSAGE_DELETED, () => {
                if (!extensionSettings.enabled) return;
                clearThoughtBasedExpressionsCache();
                setTimeout(() => onThoughtBasedExpressionsChatChanged(), 0);
            });

            eventSource.on(event_types.MESSAGE_SWIPE_DELETED, () => {
                if (!extensionSettings.enabled) return;
                clearThoughtBasedExpressionsCache();
                setTimeout(() => onThoughtBasedExpressionsChatChanged(), 0);
            });
        } catch (error) {
            console.error('[EpicTavern RPG] Event registration failed:', error);
            throw error;
        }

        await restoreCheckpointOnLoad();

        try {
            initSnowflakes();
        } catch (error) {
            console.error('[EpicTavern RPG] Snowflakes initialization failed:', error);
        }

        const syncRpgToScreen = (screen) => {
            const $panel = $('#rpg-companion-panel');
            updatePanelVisibility();
            if (!$panel.length) return;

            // Always leave collapsed-strip mode — Chat should look like the original companion panel.
            $panel.removeClass('rpg-collapsed rpg-strip-widgets-enabled');

            if (screen === 'journal') {
                $('body').addClass('et-rpg-journal-open').removeClass('et-rpg-chat-hud');
                $panel.removeClass('rpg-position-left rpg-position-right rpg-position-top');
            } else if (screen === 'chat') {
                $('body').addClass('et-rpg-chat-hud').removeClass('et-rpg-journal-open');
                applyPanelPosition();
                updateSectionVisibility();
                // Refresh rendered sections so the full panel isn't empty after leaving strip mode
                if (extensionSettings.enabled) {
                    try {
                        renderUserStats();
                        renderInfoBox();
                        renderThoughts();
                        renderInventory();
                        renderQuests();
                        if ($musicPlayerContainer?.[0]) {
                            renderMusicPlayer($musicPlayerContainer[0]);
                        }
                    } catch (e) {
                        console.warn('[EpicTavern RPG] Panel refresh after screen sync failed:', e);
                    }
                }
            } else {
                $('body').removeClass('et-rpg-journal-open et-rpg-chat-hud');
            }
        };
        document.addEventListener('et-screen-changed', (e) => {
            syncRpgToScreen(e?.detail?.screen);
        });
        syncRpgToScreen(document.body.dataset.etScreen || 'chat');

        setTimeout(() => {
            try {
                sanitizeChatMessagesForTrackerJson();
            } catch (e) {
                console.warn('[EpicTavern RPG] Initial tracker JSON sanitize failed:', e);
            }
            try {
                updateSmartUpdateStatusUI();
            } catch (e) {
                /* ignore */
            }
        }, 250);

        console.log('[EpicTavern RPG] ✅ Loaded successfully (core).');
    } catch (error) {
        console.error('[EpicTavern RPG] ❌ Critical initialization failure:', error);
        console.error('[EpicTavern RPG] Error details:', error.message, error.stack);

        toastr.error(
            'RPG Companion failed to initialize. Check console for details.',
            'EpicTavern RPG',
            { timeOut: 10000 },
        );
    }
}

/**
 * Updates the visibility of weather sub-options in settings based on dynamic weather toggle
 */
function updateWeatherSubOptionsVisibility() {
    const $weatherSubOptions = $('#rpg-weather-suboptions');
    const isDynamicWeatherEnabled = extensionSettings.showDynamicWeatherToggle ?? true;

    if (isDynamicWeatherEnabled) {
        $weatherSubOptions.show();
    } else {
        $weatherSubOptions.hide();
    }
}
