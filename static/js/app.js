/**
 * Damsels - Client Application
 * 
 * Handles connection to SpacetimeDB and UI state management
 * for login, player selection, room creation/joining, and role selection.
 */

import { SpacetimeDBClient } from './spacetimedb-client.js';

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
    spacetimedb: {
        host: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:8088' 
            : '',
        wsHost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'ws://localhost:3000'
            : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
        module: 'damsels',
    },
    storage: {
        username: 'damsels_username',
        playerId: 'damsels_player_id',
    },
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
};

// =============================================================================
// State Management
// =============================================================================

const state = {
    connected: false,
    identity: null,
    // User (authenticated account)
    user: null,
    // Selected Player identity
    player: null,
    // Available players for this user
    players: [],
    // Current room
    currentRoom: null,
    currentRole: null,
    roomMembers: [],
    // UI state
    currentStep: 'login',
    pendingAction: null,
    pendingRoomCode: null,
    pendingRoomName: null,
    invitationToken: null,
    // Room activity state
    currentRoomActivity: null,
    completedActivityId: null,
    // Room available activities (intersection of all members' unlocked activities)
    roomAvailableActivities: [],
};

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Steps
    stepLogin: document.getElementById('step-login'),
    stepPlayer: document.getElementById('step-player'),
    stepRoom: document.getElementById('step-room'),
    stepCreateRoom: document.getElementById('step-create-room'),
    stepRole: document.getElementById('step-role'),
    stepLobby: document.getElementById('step-lobby'),
    stepAdmin: document.getElementById('step-admin'),
    
    // Login form
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    loginError: document.getElementById('login-error'),
    btnRegister: document.getElementById('btn-register'),
    
    // Player selection
    currentUser: document.getElementById('current-user'),
    btnLogout: document.getElementById('btn-logout'),
    playerList: document.getElementById('player-list'),
    playerForm: document.getElementById('player-form'),
    playerNameInput: document.getElementById('player-name'),
    playerError: document.getElementById('player-error'),
    
    // Room selection
    currentPlayer: document.getElementById('current-player'),
    btnBackPlayer: document.getElementById('btn-back-player'),
    invitationSection: document.getElementById('invitation-section'),
    invitationForm: document.getElementById('invitation-form'),
    invitationTokenInput: document.getElementById('invitation-token'),
    invitationError: document.getElementById('invitation-error'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    joinForm: document.getElementById('join-form'),
    roomCodeInput: document.getElementById('room-code'),
    joinError: document.getElementById('join-error'),
    
    // Room creation
    createRoomForm: document.getElementById('create-room-form'),
    roomNameInput: document.getElementById('room-name'),
    createRoomError: document.getElementById('create-room-error'),
    btnBackRoom: document.getElementById('btn-back-room'),
    
    // Role selection
    currentRoomCode: document.getElementById('current-room-code'),
    roleCards: document.querySelectorAll('.role-card:not(.role-card--dev)'),
    roleError: document.getElementById('role-error'),
    
    // Lobby
    lobbyRoomName: document.getElementById('lobby-room-name'),
    lobbyRoomCode: document.getElementById('lobby-room-code'),
    lobbyPlayers: document.getElementById('lobby-players'),
    lobbyActivities: document.getElementById('lobby-activities'),
    activitiesCount: document.getElementById('activities-count'),
    newActivitiesToast: document.getElementById('new-activities-toast'),
    btnDismissNew: document.getElementById('btn-dismiss-new'),
    btnShareCode: document.getElementById('btn-share-code'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    ownerControls: document.getElementById('owner-controls'),
    btnCreateInvite: document.getElementById('btn-create-invite'),
    inviteResult: document.getElementById('invite-result'),
    inviteTokenDisplay: document.getElementById('invite-token-display'),
    btnCopyInvite: document.getElementById('btn-copy-invite'),
    btnCloseRoom: document.getElementById('btn-close-room'),
    
    // Connection status
    connectionStatus: document.getElementById('connection-status'),
    
    // Debug (dev only)
    debugActivitiesList: document.getElementById('debug-activities-list'),
    
    // Hamburger Menu
    menuToggle: document.getElementById('menu-toggle'),
    menuDropdown: document.getElementById('menu-dropdown'),
    menuPreferences: document.getElementById('menu-preferences'),
    menuReloadRoom: document.getElementById('menu-reload-room'),
    menuLogout: document.getElementById('menu-logout'),
    themeToggle: document.getElementById('theme-toggle-checkbox'),
    
    // Preferences Modal
    preferencesModal: document.getElementById('preferences-modal'),
    preferencesTitle: document.getElementById('preferences-title'),
    preferencesClose: document.getElementById('preferences-close'),
    preferencesCategories: document.getElementById('preferences-categories'),
    preferencesSelectAll: document.getElementById('preferences-select-all'),
    preferencesSelectNone: document.getElementById('preferences-select-none'),
    preferencesDone: document.getElementById('preferences-done'),
    
    // Activity Detail View
    stepActivity: document.getElementById('step-activity'),
    btnChooseForMe: document.getElementById('btn-choose-for-me'),
    activityCategory: document.getElementById('activity-category'),
    activityKind: document.getElementById('activity-kind'),
    activityTitle: document.getElementById('activity-title'),
    activityDescription: document.getElementById('activity-description'),
    activityVideoContainer: document.getElementById('activity-video-container'),
    activityInstructionsContainer: document.getElementById('activity-instructions-container'),
    activityInstructions: document.getElementById('activity-instructions'),
    activityXpReward: document.getElementById('activity-xp-reward'),
    activityActionsViewing: document.getElementById('activity-actions-viewing'),
    activityActionsProgress: document.getElementById('activity-actions-progress'),
    activityParticipants: document.getElementById('activity-participants'),
    activityCompletion: document.getElementById('activity-completion'),
    activityXpEarned: document.getElementById('activity-xp-earned'),
    ratingStars: document.getElementById('rating-stars'),
    btnStartActivity: document.getElementById('btn-start-activity'),
    btnGoBack: document.getElementById('btn-go-back'),
    btnCompleteActivity: document.getElementById('btn-complete-activity'),
    btnCancelActivity: document.getElementById('btn-cancel-activity'),
    btnBackToLobby: document.getElementById('btn-back-to-lobby'),
    btnNotWanted: document.getElementById('btn-not-wanted'),
};

// =============================================================================
// SpacetimeDB Client
// =============================================================================

const client = new SpacetimeDBClient(CONFIG.spacetimedb);

// =============================================================================
// UI Helpers
// =============================================================================

function showStep(stepName) {
    state.currentStep = stepName;
    
    elements.stepLogin?.classList.toggle('step--active', stepName === 'login');
    elements.stepPlayer?.classList.toggle('step--active', stepName === 'player');
    elements.stepRoom?.classList.toggle('step--active', stepName === 'room');
    elements.stepCreateRoom?.classList.toggle('step--active', stepName === 'create-room');
    elements.stepRole?.classList.toggle('step--active', stepName === 'role');
    elements.stepLobby?.classList.toggle('step--active', stepName === 'lobby');
    elements.stepActivity?.classList.toggle('step--active', stepName === 'activity');
    elements.stepAdmin?.classList.toggle('step--active', stepName === 'admin');
}
window.showStep = showStep;

function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.add('login-form__error--visible');
    setTimeout(() => element.classList.remove('login-form__error--visible'), 5000);
}

function clearError(element) {
    if (!element) return;
    element.textContent = '';
    element.classList.remove('login-form__error--visible');
}

function updateConnectionStatus(connected, text = null) {
    const statusEl = elements.connectionStatus;
    if (!statusEl) return;
    statusEl.classList.toggle('connection-status--connected', connected);
    statusEl.classList.toggle('connection-status--disconnected', !connected);
    if (text) statusEl.querySelector('.connection-status__text').textContent = text;
}

/**
 * Shows a toast notification when players join, leave, or change roles
 */
function showPlayerJoinNotification(message, type = 'joined') {
    // Create notification container if it doesn't exist
    let container = document.getElementById('player-notifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'player-notifications';
        container.className = 'player-notifications';
        document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `player-notification player-notification--${type}`;
    
    const icon = type === 'joined' ? '👋' : type === 'left' ? '🚪' : '🔄';
    notification.innerHTML = `
        <span class="player-notification__icon">${icon}</span>
        <span class="player-notification__message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(notification);
    
    // Trigger animation
    requestAnimationFrame(() => {
        notification.classList.add('player-notification--visible');
    });
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('player-notification--visible');
        notification.classList.add('player-notification--exiting');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateDebugActivities() {
    const container = elements.debugActivitiesList;
    if (!container) return; // Not in dev mode
    
    const playerId = state.player?.id;
    const playerXp = state.player?.xp || 0;
    
    if (!playerId) {
        container.innerHTML = '<p class="debug-activities__empty">Select a player to see activities</p>';
        return;
    }
    
    const activities = client.getAvailableActivities(playerId, playerXp);
    
    if (activities.length === 0) {
        container.innerHTML = '<p class="debug-activities__empty">No available activities (check if activities are seeded)</p>';
        return;
    }
    
    container.innerHTML = activities.map(activity => {
        const kindClass = activity.kind === 'Skill' ? 'skill' : 'activity';
        return `
            <div class="debug-activities__item">
                <div>
                    <span class="debug-activities__name">${escapeHtml(activity.name)}</span>
                    <span class="debug-activities__category">${escapeHtml(activity.category)}</span>
                </div>
                <div>
                    <span class="debug-activities__kind debug-activities__kind--${kindClass}">${activity.kind}</span>
                    <span class="debug-activities__xp">+${activity.xpReward} XP</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateUnlockedActivitiesUI(allActivities, newActivities) {
    const container = elements.lobbyActivities;
    if (!container) return;
    
    // Filter to current player's activities
    const playerId = state.player?.id;
    const playerActivities = playerId 
        ? allActivities.filter(a => a.playerId === playerId)
        : [];
    
    // Update count
    if (elements.activitiesCount) {
        elements.activitiesCount.textContent = playerActivities.length;
    }
    
    // Show/hide new activities toast
    const playerNewActivities = playerId
        ? newActivities.filter(a => a.playerId === playerId)
        : [];
    
    if (playerNewActivities.length > 0 && elements.newActivitiesToast) {
        elements.newActivitiesToast.classList.remove('hidden');
        elements.newActivitiesToast.querySelector('.new-activities-toast__text').textContent = 
            `${playerNewActivities.length} new ${playerNewActivities.length === 1 ? 'activity' : 'activities'} unlocked!`;
    }
    
    if (playerActivities.length === 0) {
        container.innerHTML = '<p class="lobby__empty">No activities available yet. Complete activities to earn XP and unlock more!</p>';
        return;
    }
    
    // Group by category
    const byCategory = {};
    for (const activity of playerActivities) {
        const cat = activity.categoryName || 'Unknown';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(activity);
    }
    
    container.innerHTML = Object.entries(byCategory).map(([category, activities]) => `
        <div class="activity-category">
            <h4 class="activity-category__name">${escapeHtml(category)}</h4>
            <div class="activity-category__list">
                ${activities.map(activity => {
                    const isNew = activity.isNew ? 'activity-card--new' : '';
                    const kindClass = activity.kind === 'Skill' ? 'activity-card--skill' : '';
                    return `
                        <div class="activity-card ${isNew} ${kindClass}" data-activity-id="${activity.activityId}">
                            <div class="activity-card__header">
                                <span class="activity-card__name">${escapeHtml(activity.activityName)}</span>
                                <span class="activity-card__kind">${activity.kind}</span>
                            </div>
                            <p class="activity-card__desc">${escapeHtml(activity.activityDescription)}</p>
                            <div class="activity-card__footer">
                                <span class="activity-card__xp">+${activity.xpReward} XP</span>
                                ${activity.isNew ? '<span class="activity-card__badge">NEW</span>' : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
    
    // Add click handlers to activity cards
    container.querySelectorAll('.activity-card').forEach(card => {
        card.addEventListener('click', () => {
            const activityId = parseInt(card.dataset.activityId);
            if (activityId) {
                handleSelectActivity(activityId);
            }
        });
    });
}

/**
 * Render activities available to ALL room members.
 * Shows the intersection of unlocked activities filtered by preferences.
 */
function renderRoomAvailableActivities() {
    const container = elements.lobbyActivities;
    if (!container) return;
    
    const activities = state.roomAvailableActivities;
    
    // Update count
    if (elements.activitiesCount) {
        elements.activitiesCount.textContent = activities.length;
    }
    
    if (activities.length === 0) {
        const memberCount = state.roomMembers.length;
        container.innerHTML = `
            <p class="lobby__empty">
                No activities available for all ${memberCount} room members yet.<br>
                <small>Activities must be unlocked by all members and match everyone's category preferences.</small>
            </p>
        `;
        return;
    }
    
    // Group by category
    const byCategory = {};
    for (const activity of activities) {
        const cat = activity.category || 'Unknown';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(activity);
    }
    
    container.innerHTML = `
        <div class="room-activities-header">
            <span class="room-activities-badge">${activities.length} activities for all ${state.roomMembers.length} members</span>
        </div>
    ` + Object.entries(byCategory).map(([category, catActivities]) => `
        <div class="activity-category">
            <h4 class="activity-category__name">${escapeHtml(category)}</h4>
            <div class="activity-category__list">
                ${catActivities.map(activity => {
                    const kindClass = activity.kind === 'Skill' ? 'activity-card--skill' : '';
                    return `
                        <div class="activity-card ${kindClass}" data-activity-id="${activity.id}">
                            <div class="activity-card__header">
                                <span class="activity-card__name">${escapeHtml(activity.name)}</span>
                                <span class="activity-card__kind">${activity.kind}</span>
                            </div>
                            <p class="activity-card__desc">${escapeHtml(activity.description)}</p>
                            <div class="activity-card__footer">
                                <span class="activity-card__xp">+${activity.xpReward} XP</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
    
    // Add click handlers to activity cards
    container.querySelectorAll('.activity-card').forEach(card => {
        card.addEventListener('click', () => {
            const activityId = parseInt(card.dataset.activityId);
            if (activityId) {
                handleSelectActivity(activityId);
            }
        });
    });
}

async function dismissNewActivities() {
    if (!state.player?.id) return;
    
    await client.acknowledgeNewActivities(state.player.id);
    
    if (elements.newActivitiesToast) {
        elements.newActivitiesToast.classList.add('hidden');
    }
    
    // Remove "new" badges from activity cards
    document.querySelectorAll('.activity-card--new').forEach(card => {
        card.classList.remove('activity-card--new');
        const badge = card.querySelector('.activity-card__badge');
        if (badge) badge.remove();
    });
}

// =============================================================================
// Video Embed Helper
// =============================================================================

function createVideoEmbed(videoUrl) {
    if (!videoUrl) return null;
    
    // YouTube URL patterns
    const youtubeMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
        const videoId = youtubeMatch[1];
        return `<iframe class="video-embed" src="https://www.youtube.com/embed/${videoId}" 
                frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen></iframe>`;
    }
    
    // Vimeo URL patterns
    const vimeoMatch = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) {
        const videoId = vimeoMatch[1];
        return `<iframe class="video-embed" src="https://player.vimeo.com/video/${videoId}" 
                frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }
    
    // Direct video file
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
    if (videoExtensions.some(ext => videoUrl.toLowerCase().endsWith(ext))) {
        return `<video class="video-embed" controls>
                    <source src="${escapeHtml(videoUrl)}" type="video/${videoUrl.split('.').pop()}">
                    Your browser does not support the video tag.
                </video>`;
    }
    
    // Unknown - just show a link
    return `<a href="${escapeHtml(videoUrl)}" target="_blank" class="video-link">📹 Watch Video</a>`;
}

// =============================================================================
// Activity Detail Functions
// =============================================================================

function showActivityDetail(activity, roomActivity) {
    if (!activity) return;
    
    state.currentRoomActivity = roomActivity;
    
    // Populate activity details
    if (elements.activityCategory) {
        elements.activityCategory.textContent = activity.categoryName || 'Unknown';
    }
    if (elements.activityKind) {
        elements.activityKind.textContent = activity.kind || 'Activity';
        elements.activityKind.className = `activity-detail__kind activity-detail__kind--${(activity.kind || 'activity').toLowerCase()}`;
    }
    if (elements.activityTitle) {
        elements.activityTitle.textContent = activity.name || 'Unnamed Activity';
    }
    if (elements.activityDescription) {
        elements.activityDescription.textContent = activity.description || 'No description available.';
    }
    
    // Video embed
    if (elements.activityVideoContainer) {
        const videoEmbed = createVideoEmbed(activity.videoUrl);
        if (videoEmbed) {
            elements.activityVideoContainer.innerHTML = videoEmbed;
            elements.activityVideoContainer.classList.remove('hidden');
        } else {
            elements.activityVideoContainer.classList.add('hidden');
        }
    }
    
    // Instructions
    if (elements.activityInstructionsContainer && elements.activityInstructions) {
        if (activity.instructions) {
            elements.activityInstructions.textContent = activity.instructions;
            elements.activityInstructionsContainer.classList.remove('hidden');
        } else {
            elements.activityInstructionsContainer.classList.add('hidden');
        }
    }
    
    // XP reward
    if (elements.activityXpReward) {
        elements.activityXpReward.querySelector('.xp-value').textContent = `+${activity.xpReward || 0} XP`;
    }
    
    // Show appropriate action buttons based on status
    updateActivityActionButtons(roomActivity?.status || 'Viewing');
    
    showStep('activity');
}

function updateActivityActionButtons(status) {
    // Hide all action groups
    elements.activityActionsViewing?.classList.add('hidden');
    elements.activityActionsProgress?.classList.add('hidden');
    elements.activityCompletion?.classList.add('hidden');
    
    if (status === 'Viewing') {
        elements.activityActionsViewing?.classList.remove('hidden');
    } else if (status === 'InProgress') {
        elements.activityActionsProgress?.classList.remove('hidden');
        updateParticipantsList();
    } else if (status === 'Completed') {
        elements.activityCompletion?.classList.remove('hidden');
        if (state.currentRoomActivity?.activity?.xpReward && elements.activityXpEarned) {
            elements.activityXpEarned.querySelector('.xp-earned-value').textContent = 
                `+${state.currentRoomActivity.activity.xpReward} XP earned!`;
        }
    }
}

function updateParticipantsList() {
    if (!elements.activityParticipants || !state.currentRoomActivity?.participants) return;
    
    const participants = state.currentRoomActivity.participants;
    if (participants.length === 0) {
        elements.activityParticipants.innerHTML = '<span class="participants-empty">Waiting for participants...</span>';
        return;
    }
    
    elements.activityParticipants.innerHTML = participants.map(p => `
        <span class="participant-chip">
            <span class="participant-role">${getRoleIcon(p.role)}</span>
            <span class="participant-name">${escapeHtml(p.username)}</span>
        </span>
    `).join('');
}

async function handleSelectActivity(activityId) {
    if (!state.player?.id || !state.currentRoom?.id) return;
    
    const result = await client.selectRoomActivity(state.player.id, state.currentRoom.id, activityId);
    if (!result.ok) {
        alert('Failed to select activity: ' + result.error);
        return;
    }
    
    // The room activity update callback will handle showing the detail view
}

async function handleChooseForMe() {
    if (!state.player?.id || !state.currentRoom?.id) return;
    
    // Add rolling animation to button
    elements.btnChooseForMe?.classList.add('btn-dice-roll--rolling');
    
    const result = await client.randomRoomActivity(state.player.id, state.currentRoom.id);
    
    elements.btnChooseForMe?.classList.remove('btn-dice-roll--rolling');
    
    if (!result.ok) {
        alert('Failed to select random activity: ' + result.error);
        return;
    }
    
    // The room activity update callback will handle showing the detail view
}

async function handleStartActivity() {
    if (!state.player?.id || !state.currentRoom?.id) return;
    
    setButtonLoading(elements.btnStartActivity, true);
    
    const result = await client.startRoomActivity(state.player.id, state.currentRoom.id);
    
    setButtonLoading(elements.btnStartActivity, false);
    
    if (!result.ok) {
        alert('Failed to start activity: ' + result.error);
        return;
    }
    
    // The room activity update callback will handle updating the UI
}

async function handleCompleteActivity() {
    if (!state.player?.id || !state.currentRoom?.id) return;
    
    setButtonLoading(elements.btnCompleteActivity, true);
    
    const result = await client.completeRoomActivity(state.player.id, state.currentRoom.id);
    
    setButtonLoading(elements.btnCompleteActivity, false);
    
    if (!result.ok) {
        alert('Failed to complete activity: ' + result.error);
        return;
    }
    
    // Store completed activity ID for rating
    state.completedActivityId = state.currentRoomActivity?.activityId;
    
    // Show completion UI
    updateActivityActionButtons('Completed');
    
    // Reset rating stars
    resetRatingStars();
}

async function handleCancelActivity() {
    if (!state.player?.id || !state.currentRoom?.id) return;
    
    if (!confirm('Cancel this activity? No progress will be saved.')) return;
    
    setButtonLoading(elements.btnCancelActivity, true);
    
    const result = await client.cancelRoomActivity(state.player.id, state.currentRoom.id);
    
    setButtonLoading(elements.btnCancelActivity, false);
    
    if (!result.ok) {
        alert('Failed to cancel activity: ' + result.error);
        return;
    }
    
    // Return to lobby
    state.currentRoomActivity = null;
    showStep('lobby');
}

function handleGoBack() {
    // Cancel any viewing activity and return to lobby
    if (state.currentRoomActivity && state.currentRoomActivity.status === 'Viewing') {
        // Cancel the viewing activity
        client.cancelRoomActivity(state.player.id, state.currentRoom.id);
    }
    
    state.currentRoomActivity = null;
    showStep('lobby');
}

async function handleRateActivity(rating) {
    if (!state.player?.id || !state.completedActivityId) return;
    
    const result = await client.rateActivity(state.player.id, state.completedActivityId, rating);
    if (!result.ok) {
        alert('Failed to rate activity: ' + result.error);
        return;
    }
    
    // Update star display
    highlightRatingStars(rating);
}

function highlightRatingStars(rating) {
    if (!elements.ratingStars) return;
    
    const stars = elements.ratingStars.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        star.classList.toggle('rating-star--active', index < rating);
        star.classList.toggle('rating-star--selected', index < rating);
    });
}

function resetRatingStars() {
    if (!elements.ratingStars) return;
    
    const stars = elements.ratingStars.querySelectorAll('.rating-star');
    stars.forEach(star => {
        star.classList.remove('rating-star--active', 'rating-star--selected');
    });
}

function handleBackToLobby() {
    state.currentRoomActivity = null;
    state.completedActivityId = null;
    showStep('lobby');
    
    // Refresh activities list
    renderUnlockedActivities();
}

async function handleNotWanted() {
    if (!state.player?.id || !state.currentRoomActivity?.activityId) return;
    
    const activityName = state.currentRoomActivity?.activity?.name || 'this activity';
    if (!confirm(`Mark "${activityName}" as not wanted?\n\nThis activity won't appear in any room you're in. You can undo this later from your profile.`)) {
        return;
    }
    
    setButtonLoading(elements.btnNotWanted, true);
    
    const result = await client.markActivityNotWanted(state.player.id, state.currentRoomActivity.activityId);
    
    setButtonLoading(elements.btnNotWanted, false);
    
    if (!result.ok) {
        alert('Failed to mark activity: ' + result.error);
        return;
    }
    
    // Cancel the current viewing activity and return to lobby
    await client.cancelRoomActivity(state.player.id, state.currentRoom.id);
    
    state.currentRoomActivity = null;
    showStep('lobby');
    
    // Refresh activities list (the marked activity should no longer appear)
    renderUnlockedActivities();
}

function setButtonLoading(button, loading) {
    if (!button) return;
    button.classList.toggle('btn--loading', loading);
    button.disabled = loading;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatRoomCode(input) {
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    input.value = value.slice(0, 5);
}

// =============================================================================
// Player Selection Functions
// =============================================================================

function renderPlayerList() {
    const container = elements.playerList;
    if (!container) return;
    
    if (state.players.length === 0) {
        container.innerHTML = '<div class="player-list__empty">No player identities yet. Create one below!</div>';
        return;
    }
    
    container.innerHTML = state.players.map(player => `
        <button class="player-card player-card--selectable" data-player-id="${player.id}">
            <div class="player-card__avatar">🎭</div>
            <div class="player-card__info">
                <span class="player-card__name">${escapeHtml(player.username)}</span>
                <span class="player-card__xp">${player.xp} XP</span>
            </div>
        </button>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.player-card--selectable').forEach(card => {
        card.addEventListener('click', () => selectPlayer(parseInt(card.dataset.playerId)));
    });
}

async function loadPlayers() {
    try {
        const players = await client.getPlayersForUser();
        state.players = players;
        renderPlayerList();
    } catch (error) {
        console.error('Failed to load players:', error);
    }
}

async function selectPlayer(playerId) {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    
    state.player = player;
    localStorage.setItem(CONFIG.storage.playerId, playerId);
    
    if (elements.currentPlayer) {
        elements.currentPlayer.innerHTML = `Playing as: <strong>${player.username}</strong> <span class="player-xp">(${player.xp} XP)</span>`;
    }
    
    // Update UI
    updatePreferencesMenuVisibility();
    updateDebugActivities();
    
    showStep('room');
}

// =============================================================================
// Lobby Functions
// =============================================================================

function getRoleIcon(role) {
    const icons = { 'Top': '👑', 'Bottom': '🌹', 'Observer': '👁', 'Photographer': '📸', 'ActivityAdmin': '⚙️' };
    return icons[role] || '👤';
}

function renderRoomMembers() {
    const container = elements.lobbyPlayers;
    if (!container) return;
    
    if (state.roomMembers.length === 0) {
        container.innerHTML = '<div class="lobby__empty">No players yet</div>';
        return;
    }
    
    container.innerHTML = state.roomMembers.map(member => {
        const isYou = member.playerId === state.player?.id;
        return `
            <div class="player-card ${isYou ? 'player-card--you' : ''}">
                <div class="player-card__avatar">${getRoleIcon(member.role)}</div>
                <div class="player-card__info">
                    <span class="player-card__name">${escapeHtml(member.username)}</span>
                    <span class="player-card__meta">
                        <span class="player-card__role">${member.role}</span>
                        <span class="player-card__xp">${member.xp || 0} XP</span>
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

async function showLobby() {
    if (elements.lobbyRoomName) elements.lobbyRoomName.textContent = state.currentRoom?.name || 'Room';
    if (elements.lobbyRoomCode) elements.lobbyRoomCode.textContent = state.currentRoom?.code || '?????';
    
    const isOwner = state.currentRoom?.ownerId === state.player?.id;
    elements.ownerControls?.classList.toggle('hidden', !isOwner);
    
    renderRoomMembers();
    showStep('lobby');
    
    // Load room-compatible activities (intersection of all members' unlocked activities)
    if (state.currentRoom?.id) {
        state.roomAvailableActivities = client.getRoomAvailableActivities(state.currentRoom.id);
        renderRoomAvailableActivities();
    } else {
        // Fallback to individual player activities if no room
        await renderUnlockedActivities();
    }
}

async function renderUnlockedActivities() {
    if (!state.player?.id) return;
    
    // First try the cache
    let activities = client.getUnlockedActivities(state.player.id);
    
    // If cache is empty, query directly (handles race condition after room join)
    if (activities.length === 0) {
        console.log('[App] Cache empty, querying unlocked activities directly');
        activities = await client.queryUnlockedActivities(state.player.id);
    }
    
    const newActivities = activities.filter(a => a.isNew);
    updateUnlockedActivitiesUI(activities, newActivities);
}

// =============================================================================
// Event Handlers
// =============================================================================

async function handleLogin(e) {
    e.preventDefault();
    const username = elements.usernameInput?.value.trim();
    const password = elements.passwordInput?.value;
    
    if (!username || !password) {
        showError(elements.loginError, 'Please enter username and password');
        return;
    }
    
    setButtonLoading(e.target.querySelector('[data-action="login"]'), true);
    clearError(elements.loginError);
    
    const result = await client.loginUser(username, password);
    setButtonLoading(e.target.querySelector('[data-action="login"]'), false);
    
    if (!result.ok) {
        showError(elements.loginError, result.error || 'Login failed');
        return;
    }
    
    state.user = { username };
    localStorage.setItem(CONFIG.storage.username, username);
    
    if (elements.currentUser) elements.currentUser.textContent = `Welcome, ${username}`;
    updatePreferencesMenuVisibility();
    
    await loadPlayers();
    showStep('player');
}

async function handleRegister() {
    const username = elements.usernameInput?.value.trim();
    const password = elements.passwordInput?.value;
    
    if (!username || !password) {
        showError(elements.loginError, 'Please enter username and password');
        return;
    }
    
    if (password.length < 4) {
        showError(elements.loginError, 'Password must be at least 4 characters');
        return;
    }
    
    setButtonLoading(elements.btnRegister, true);
    clearError(elements.loginError);
    
    const result = await client.registerUser(username, password);
    setButtonLoading(elements.btnRegister, false);
    
    if (!result.ok) {
        showError(elements.loginError, result.error || 'Registration failed');
        return;
    }
    
    state.user = { username };
    localStorage.setItem(CONFIG.storage.username, username);
    
    if (elements.currentUser) elements.currentUser.textContent = `Welcome, ${username}`;
    updatePreferencesMenuVisibility();
    
    await loadPlayers();
    showStep('player');
}

async function handleLogout() {
    console.log('[App] Logging out...');
    
    // Call backend to update last_seen and clear session
    // This also disconnects the WebSocket and stops all reconnection attempts
    await client.logoutUser();
    
    // Clear all local state
    state.user = null;
    state.player = null;
    state.players = [];
    state.currentRoom = null;
    state.currentRole = null;
    state.roomMembers = [];
    state.connected = false;
    state.currentRoomActivity = null;
    state.completedActivityId = null;
    
    localStorage.removeItem(CONFIG.storage.username);
    localStorage.removeItem(CONFIG.storage.playerId);
    
    // Clear inputs
    if (elements.usernameInput) elements.usernameInput.value = '';
    if (elements.passwordInput) elements.passwordInput.value = '';
    
    // Update UI
    updatePreferencesMenuVisibility();
    updateConnectionStatus(false, 'Logged out');
    
    console.log('[App] Logout complete - WebSocket disconnected');
    showStep('login');
}

async function handleCreatePlayer(e) {
    e.preventDefault();
    const playerName = elements.playerNameInput?.value.trim();
    
    if (!playerName) {
        showError(elements.playerError, 'Please enter a player name');
        return;
    }
    
    clearError(elements.playerError);
    
    const result = await client.createPlayer(playerName);
    if (!result.ok) {
        showError(elements.playerError, result.error || 'Failed to create player');
        return;
    }
    
    elements.playerNameInput.value = '';
    await loadPlayers();
}

function handleCreateRoomClick() {
    state.pendingAction = 'create';
    showStep('create-room');
}

async function handleCreateRoom(e) {
    e.preventDefault();
    const roomName = elements.roomNameInput?.value.trim() || `${state.player.username}'s Room`;
    
    clearError(elements.createRoomError);
    setButtonLoading(e.target.querySelector('.login-form__submit'), true);
    
    state.pendingRoomName = roomName;
    showStep('role');
    setButtonLoading(e.target.querySelector('.login-form__submit'), false);
}

async function handleJoinRoom(e) {
    e.preventDefault();
    const roomCode = elements.roomCodeInput?.value.trim().toUpperCase();
    
    if (!roomCode || roomCode.length !== 5) {
        showError(elements.joinError, 'Please enter a 5-character room code');
        return;
    }
    
    clearError(elements.joinError);
    state.pendingAction = 'join';
    state.pendingRoomCode = roomCode;
    showStep('role');
}

async function handleAcceptInvitation(e) {
    e.preventDefault();
    const token = elements.invitationTokenInput?.value.trim();
    
    if (!token) {
        showError(elements.invitationError, 'Please enter an invitation token');
        return;
    }
    
    clearError(elements.invitationError);
    state.pendingAction = 'invitation';
    state.invitationToken = token;
    showStep('role');
}

async function handleRoleSelect(e) {
    const card = e.target.closest('.role-card');
    if (!card) return;
    
    const role = card.dataset.role;
    if (!role) return;
    
    clearError(elements.roleError);
    setButtonLoading(card, true);
    
    let result;
    if (state.pendingAction === 'create') {
        result = await client.createRoom(state.player.id, state.pendingRoomName, role);
    } else if (state.pendingAction === 'join') {
        result = await client.joinRoom(state.player.id, state.pendingRoomCode, role);
    } else if (state.pendingAction === 'invitation') {
        result = await client.acceptInvitation(state.player.id, state.invitationToken, role);
    }
    
    setButtonLoading(card, false);
    
    if (!result?.ok) {
        // Check if player is already in this room - if so, just reload the room
        if (result?.error?.includes('Already in this room')) {
            console.log('[App] Player already in room, reloading...');
            
            // Get room info and members
            let roomCode = state.pendingRoomCode;
            if (state.pendingAction === 'invitation') {
                // For invitations, we need to get the room code differently
                // Try to get from the result or query
                roomCode = result?.roomCode;
            }
            
            if (roomCode) {
                const reloadResult = await client.getRoomByCode(roomCode);
                if (reloadResult?.room) {
                    state.currentRoom = reloadResult.room;
                    state.currentRole = role;
                    state.roomMembers = reloadResult.members || [];
                    
                    if (state.player?.id) {
                        await client.initializeUnlockedActivities(state.player.id);
                    }
                    
                    showPlayerJoinNotification('Rejoined room', 'joined');
                    showLobby();
                    return;
                }
            }
        }
        
        showError(elements.roleError, result?.error || 'Failed to proceed');
        return;
    }
    
    state.currentRoom = result.room;
    state.currentRole = role;
    state.roomMembers = result.members || [];
    
    // Initialize unlocked activities for this player
    if (state.player?.id) {
        await client.initializeUnlockedActivities(state.player.id);
    }
    
    showLobby();
}

async function handleLeaveRoom() {
    if (!state.currentRoom || !state.player) return;
    
    const result = await client.leaveRoom(state.player.id, state.currentRoom.id);
    if (!result.ok) {
        console.error('Failed to leave room:', result.error);
        return;
    }
    
    state.currentRoom = null;
    state.currentRole = null;
    state.roomMembers = [];
    showStep('room');
}

async function handleReloadRoom() {
    if (!state.currentRoom) {
        console.log('[App] No room to reload');
        showPlayerJoinNotification('No room to reload', 'left');
        return;
    }
    
    console.log('[App] Reloading room members for room:', state.currentRoom.id);
    
    try {
        const members = await client.queryRoomMembers(state.currentRoom.id);
        console.log('[App] Reloaded room members:', members.length);
        
        state.roomMembers = members;
        renderRoomMembers();
        
        showPlayerJoinNotification('Room reloaded', 'role');
    } catch (error) {
        console.error('[App] Failed to reload room:', error);
        showPlayerJoinNotification('Failed to reload room', 'left');
    }
}

async function handleCreateInvitation() {
    if (!state.currentRoom || !state.player) return;
    
    const result = await client.createRoomInvitation(state.player.id, state.currentRoom.id);
    if (!result.ok) {
        alert('Failed to create invitation: ' + result.error);
        return;
    }
    
    // The invitation will appear in the table; we need to query for it
    // For now, show a success message
    if (elements.inviteResult) {
        elements.inviteResult.classList.remove('hidden');
        if (elements.inviteTokenDisplay) {
            elements.inviteTokenDisplay.value = 'Check room_invitation table';
        }
    }
}

async function handleCloseRoom() {
    if (!state.currentRoom || !state.player) return;
    if (!confirm('Close this room? All players will be removed.')) return;
    
    const result = await client.closeRoom(state.player.id, state.currentRoom.id);
    if (!result.ok) {
        alert('Failed to close room: ' + result.error);
        return;
    }
    
    state.currentRoom = null;
    state.currentRole = null;
    state.roomMembers = [];
    showStep('room');
}

async function copyRoomCode() {
    const code = state.currentRoom?.code;
    if (!code) return;
    try {
        await navigator.clipboard.writeText(code);
        elements.btnShareCode.textContent = '✓';
        setTimeout(() => elements.btnShareCode.textContent = '📋', 1500);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

async function copyInvitation() {
    const token = elements.inviteTokenDisplay?.value;
    if (!token) return;
    try {
        await navigator.clipboard.writeText(token);
        elements.btnCopyInvite.textContent = 'Copied!';
        setTimeout(() => elements.btnCopyInvite.textContent = 'Copy', 1500);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

// =============================================================================
// Initialization
// =============================================================================

async function init() {
    updateConnectionStatus(false, 'Connecting...');
    
    // Check for invitation in URL
    const urlParams = new URLSearchParams(window.location.search);
    const invitationToken = urlParams.get('invitation') || urlParams.get('invite') || urlParams.get('token');
    if (invitationToken) {
        state.invitationToken = invitationToken;
        if (elements.invitationTokenInput) elements.invitationTokenInput.value = invitationToken;
    }
    
    try {
        // Connect to SpacetimeDB
        client.onConnect = () => {
            state.connected = true;
            state.identity = client.identity;
            updateConnectionStatus(true, 'Connected');
        };
        
        client.onDisconnect = () => {
            state.connected = false;
            updateConnectionStatus(false, 'Disconnected');
        };
        
        client.onError = (error) => {
            console.error('SpacetimeDB error:', error);
            updateConnectionStatus(false, 'Error');
        };
        
        client.onActivitiesUpdate = () => {
            updateDebugActivities();
        };
        
        client.onRoomMembersUpdate = (allMembers) => {
            console.log('[App] Room members update:', allMembers.length, 'total members');
            
            // Filter to current room only
            if (state.currentRoom?.id) {
                const roomMembers = allMembers.filter(m => m.roomId === state.currentRoom.id);
                
                // Check if membership changed
                const currentIds = new Set(state.roomMembers.map(m => m.playerId));
                const newIds = new Set(roomMembers.map(m => m.playerId));
                
                // Find who joined and who left
                const joined = roomMembers.filter(m => !currentIds.has(m.playerId));
                const left = state.roomMembers.filter(m => !newIds.has(m.playerId));
                
                // Check if current player was removed from the room
                if (state.player?.id && currentIds.has(state.player.id) && !newIds.has(state.player.id)) {
                    console.log('[App] Current player was removed from room!');
                    state.currentRoom = null;
                    state.currentRole = null;
                    state.roomMembers = [];
                    showStep('room');
                    showPlayerJoinNotification('You have been removed from the room', 'left');
                    return;
                }
                
                if (joined.length > 0 || left.length > 0) {
                    console.log('[App] Room membership changed!', 
                        'Joined:', joined.map(m => m.username).join(', ') || 'none',
                        'Left:', left.map(m => m.username).join(', ') || 'none');
                    
                    state.roomMembers = roomMembers;
                    
                    // Update UI if we're in the lobby
                    if (state.currentStep === 'lobby') {
                        renderRoomMembers();
                        
                        // Show notifications for joins/leaves
                        for (const member of joined) {
                            if (member.playerId !== state.player?.id) {
                                showPlayerJoinNotification(`${member.username} joined as ${member.role}`, 'joined');
                            }
                        }
                        for (const member of left) {
                            showPlayerJoinNotification(`${member.username} left the room`, 'left');
                        }
                    }
                } else {
                    // Check for role changes
                    const rolesChanged = roomMembers.some(newMember => {
                        const oldMember = state.roomMembers.find(m => m.playerId === newMember.playerId);
                        return oldMember && oldMember.role !== newMember.role;
                    });
                    
                    if (rolesChanged) {
                        console.log('[App] Player roles changed');
                        const changedMembers = roomMembers.filter(newMember => {
                            const oldMember = state.roomMembers.find(m => m.playerId === newMember.playerId);
                            return oldMember && oldMember.role !== newMember.role;
                        });
                        
                        state.roomMembers = roomMembers;
                        if (state.currentStep === 'lobby') {
                            renderRoomMembers();
                            
                            // Notify about role changes
                            for (const member of changedMembers) {
                                showPlayerJoinNotification(`${member.username} changed role to ${member.role}`, 'role');
                            }
                        }
                    }
                }
            }
        };
        
        client.onUnlockedActivitiesUpdate = ({ all, new: newActivities }) => {
            console.log('[App] Unlocked activities update:', all.length, 'total,', newActivities.length, 'new');
            updateUnlockedActivitiesUI(all, newActivities);
        };
        
        client.onRoomActivityUpdate = (activeActivities) => {
            console.log('[App] Room activity update:', activeActivities);
            
            // Find activity for current room
            if (state.currentRoom?.id) {
                const roomActivity = activeActivities.find(ra => ra.roomId === state.currentRoom.id);
                
                if (roomActivity) {
                    // Store the current room activity
                    state.currentRoomActivity = roomActivity;
                    
                    // If we're in the lobby or already viewing activity, show/update detail
                    if (state.currentStep === 'lobby' || state.currentStep === 'activity') {
                        showActivityDetail(roomActivity.activity, roomActivity);
                    }
                } else if (state.currentStep === 'activity' && state.currentRoomActivity) {
                    // Activity was cancelled by another player, return to lobby
                    state.currentRoomActivity = null;
                    showStep('lobby');
                }
            }
        };
        
        // Room available activities callback - called when room membership or preferences change
        client.onRoomAvailableActivitiesUpdate = (roomId, activities) => {
            console.log(`[App] Room ${roomId} available activities:`, activities.length);
            
            // Only update if this is for our current room
            if (state.currentRoom?.id === roomId) {
                state.roomAvailableActivities = activities;
                
                // Update the UI if we're in the lobby
                if (state.currentStep === 'lobby') {
                    renderRoomAvailableActivities();
                }
            }
        };
        
        // Categories loaded callback - enables preferences UI early
        client.onCategoriesLoaded = (categories) => {
            console.log(`[App] Categories ready: ${categories.length} categories available`);
            // Categories are now available for the preferences modal
            // The preferences menu visibility is handled by updatePreferencesMenuVisibility()
        };
        
        await client.connect();
        
        // Pre-fill username if stored
        const storedUsername = localStorage.getItem(CONFIG.storage.username);
        if (storedUsername && elements.usernameInput) {
            elements.usernameInput.value = storedUsername;
        }
        
        // Load dev module if in dev mode
        if (CONFIG.isDev) {
            loadDevModule();
        }
        
    } catch (error) {
        console.error('Failed to connect:', error);
        updateConnectionStatus(false, 'Connection failed');
    }
    
    setupEventListeners();
}

function setupEventListeners() {
    // Login
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.btnRegister?.addEventListener('click', handleRegister);
    
    // Player selection
    elements.btnLogout?.addEventListener('click', handleLogout);
    elements.playerForm?.addEventListener('submit', handleCreatePlayer);
    
    // Room selection
    elements.btnBackPlayer?.addEventListener('click', () => {
        state.player = null;
        updatePreferencesMenuVisibility();
        showStep('player');
    });
    elements.btnCreateRoom?.addEventListener('click', handleCreateRoomClick);
    elements.joinForm?.addEventListener('submit', handleJoinRoom);
    elements.invitationForm?.addEventListener('submit', handleAcceptInvitation);
    elements.roomCodeInput?.addEventListener('input', (e) => formatRoomCode(e.target));
    
    // Room creation
    elements.createRoomForm?.addEventListener('submit', handleCreateRoom);
    elements.btnBackRoom?.addEventListener('click', () => showStep('room'));
    
    // Role selection
    elements.roleCards?.forEach(card => {
        card.addEventListener('click', handleRoleSelect);
    });
    
    // Lobby
    elements.btnShareCode?.addEventListener('click', copyRoomCode);
    elements.btnLeaveRoom?.addEventListener('click', handleLeaveRoom);
    elements.btnCreateInvite?.addEventListener('click', handleCreateInvitation);
    elements.btnCopyInvite?.addEventListener('click', copyInvitation);
    elements.btnCloseRoom?.addEventListener('click', handleCloseRoom);
    elements.btnDismissNew?.addEventListener('click', dismissNewActivities);
    elements.btnChooseForMe?.addEventListener('click', handleChooseForMe);
    
    // Activity Detail
    elements.btnStartActivity?.addEventListener('click', handleStartActivity);
    elements.btnGoBack?.addEventListener('click', handleGoBack);
    elements.btnCompleteActivity?.addEventListener('click', handleCompleteActivity);
    elements.btnCancelActivity?.addEventListener('click', handleCancelActivity);
    elements.btnBackToLobby?.addEventListener('click', handleBackToLobby);
    elements.btnNotWanted?.addEventListener('click', handleNotWanted);
    
    // Rating stars
    elements.ratingStars?.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            if (rating >= 1 && rating <= 5) {
                handleRateActivity(rating);
            }
        });
        
        // Hover effect
        star.addEventListener('mouseenter', () => {
            const rating = parseInt(star.dataset.rating);
            const stars = elements.ratingStars.querySelectorAll('.rating-star');
            stars.forEach((s, index) => {
                s.classList.toggle('rating-star--hover', index < rating);
            });
        });
        
        star.addEventListener('mouseleave', () => {
            const stars = elements.ratingStars.querySelectorAll('.rating-star');
            stars.forEach(s => s.classList.remove('rating-star--hover'));
        });
    });
    
    // Hamburger Menu
    elements.menuToggle?.addEventListener('click', toggleMenu);
    elements.menuPreferences?.addEventListener('click', () => {
        closeMenu();
        openPreferencesModal();
    });
    elements.menuReloadRoom?.addEventListener('click', () => {
        closeMenu();
        handleReloadRoom();
    });
    elements.menuLogout?.addEventListener('click', () => {
        closeMenu();
        handleLogout();
    });
    elements.themeToggle?.addEventListener('change', toggleTheme);
    
    // Preferences Modal
    elements.preferencesClose?.addEventListener('click', closePreferencesModal);
    elements.preferencesDone?.addEventListener('click', closePreferencesModal);
    elements.preferencesSelectAll?.addEventListener('click', selectAllCategories);
    elements.preferencesSelectNone?.addEventListener('click', selectNoCategories);
    elements.preferencesModal?.addEventListener('click', (e) => {
        // Close when clicking outside the modal
        if (e.target === elements.preferencesModal) {
            closePreferencesModal();
        }
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hamburger-menu')) {
            closeMenu();
        }
    });
    
    // Initialize theme from localStorage
    initTheme();
}

// =============================================================================
// Hamburger Menu & Theme
// =============================================================================

function toggleMenu() {
    elements.menuDropdown?.classList.toggle('hidden');
}

function closeMenu() {
    elements.menuDropdown?.classList.add('hidden');
}

function toggleTheme() {
    const isDark = !elements.themeToggle?.checked;
    document.body.classList.toggle('light-mode', !isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const isLight = savedTheme ? savedTheme === 'light' : !prefersDark;
    
    document.body.classList.toggle('light-mode', isLight);
    if (elements.themeToggle) {
        elements.themeToggle.checked = !isLight; // Checkbox checked = dark mode
    }
}

// =============================================================================
// Preferences Modal
// =============================================================================

// Track if we're editing user or player preferences
let preferencesMode = 'user'; // 'user' or 'player'

/**
 * Update the visibility of the preferences menu item based on login state.
 */
function updatePreferencesMenuVisibility() {
    if (!elements.menuPreferences) return;
    
    // Show preferences menu if user is logged in
    if (state.user) {
        elements.menuPreferences.classList.remove('hidden');
        
        // Update the label based on whether we have an active player
        if (state.player) {
            elements.menuPreferences.textContent = `⚙️ Preferences for ${state.player.username}`;
        } else {
            elements.menuPreferences.textContent = '⚙️ Activity Preferences';
        }
    } else {
        elements.menuPreferences.classList.add('hidden');
    }
}

/**
 * Open the preferences modal.
 */
async function openPreferencesModal() {
    if (!elements.preferencesModal) return;
    
    // Determine mode: player preferences if player is active, otherwise user
    preferencesMode = state.player ? 'player' : 'user';
    
    // Update title
    if (elements.preferencesTitle) {
        if (preferencesMode === 'player') {
            elements.preferencesTitle.textContent = `Activity Preferences for ${state.player.username}`;
        } else {
            elements.preferencesTitle.textContent = 'Activity Preferences';
        }
    }
    
    // If user mode and no preferences exist, initialize with defaults
    if (preferencesMode === 'user') {
        const userPrefs = client.getUserCategoryPreferences(state.user?.id || 0);
        if (userPrefs.length === 0) {
            console.log('[Preferences] Initializing user preferences with defaults...');
            try {
                await client.initUserPreferences();
                // Small delay for subscription to update
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error('[Preferences] Failed to initialize:', error);
            }
        }
    }
    
    // Populate the categories
    await renderPreferencesCategories();
    
    // Show the modal
    elements.preferencesModal.classList.remove('hidden');
}

/**
 * Close the preferences modal.
 */
function closePreferencesModal() {
    if (!elements.preferencesModal) return;
    elements.preferencesModal.classList.add('hidden');
}

/**
 * Render the category checkboxes in the preferences modal.
 */
async function renderPreferencesCategories() {
    if (!elements.preferencesCategories) return;
    
    const categories = await client.getAllCategories();
    const selectedIds = getSelectedCategoryIds();
    const defaultIds = client.getDefaultCategoryIds();
    
    // If no selections exist, use defaults for display
    const effectiveSelection = selectedIds.length > 0 ? selectedIds : defaultIds;
    
    elements.preferencesCategories.innerHTML = categories.map(cat => {
        const isSelected = effectiveSelection.includes(cat.id);
        const isAdult = cat.id >= 100;
        
        return `
            <label class="category-checkbox ${isAdult ? 'category-checkbox--adult' : ''} ${isSelected ? 'category-checkbox--selected' : ''}"
                   data-category-id="${cat.id}">
                <input type="checkbox" ${isSelected ? 'checked' : ''}>
                <span class="category-checkbox__label">${cat.name}</span>
                <span class="category-checkbox__id">#${cat.id}</span>
            </label>
        `;
    }).join('');
    
    // Add event listeners to checkboxes
    elements.preferencesCategories.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleCategoryToggle);
    });
}

/**
 * Get the currently selected category IDs based on mode.
 */
function getSelectedCategoryIds() {
    if (preferencesMode === 'player' && state.player) {
        return client.getPlayerCategoryPreferences(state.player.id);
    } else if (state.user) {
        return client.getUserCategoryPreferences(state.user.id);
    }
    return [];
}

/**
 * Handle toggling a category checkbox.
 */
async function handleCategoryToggle(e) {
    const checkbox = e.target;
    const label = checkbox.closest('.category-checkbox');
    const categoryId = parseInt(label.dataset.categoryId);
    const isChecked = checkbox.checked;
    
    // Update visual state immediately
    label.classList.toggle('category-checkbox--selected', isChecked);
    
    try {
        if (preferencesMode === 'player' && state.player) {
            if (isChecked) {
                await client.addPlayerCategoryPreference(state.player.id, categoryId);
            } else {
                await client.removePlayerCategoryPreference(state.player.id, categoryId);
            }
        } else {
            if (isChecked) {
                await client.addUserCategoryPreference(categoryId);
            } else {
                await client.removeUserCategoryPreference(categoryId);
            }
        }
        console.log(`[Preferences] ${isChecked ? 'Added' : 'Removed'} category ${categoryId}`);
    } catch (error) {
        console.error('[Preferences] Failed to update:', error);
        // Revert visual state on error
        checkbox.checked = !isChecked;
        label.classList.toggle('category-checkbox--selected', !isChecked);
    }
}

/**
 * Select all categories.
 */
async function selectAllCategories() {
    const categories = await client.getAllCategories();
    const categoryIds = categories.map(c => c.id);
    
    try {
        if (preferencesMode === 'player' && state.player) {
            await client.setPlayerCategoryPreferences(state.player.id, categoryIds);
        } else {
            await client.setUserCategoryPreferences(categoryIds);
        }
        // Delay then refresh
        await new Promise(resolve => setTimeout(resolve, 200));
        await renderPreferencesCategories();
    } catch (error) {
        console.error('[Preferences] Failed to select all:', error);
    }
}

/**
 * Select no categories (clear all).
 */
async function selectNoCategories() {
    try {
        if (preferencesMode === 'player' && state.player) {
            await client.setPlayerCategoryPreferences(state.player.id, []);
        } else {
            await client.setUserCategoryPreferences([]);
        }
        // Delay then refresh
        await new Promise(resolve => setTimeout(resolve, 200));
        await renderPreferencesCategories();
    } catch (error) {
        console.error('[Preferences] Failed to clear:', error);
    }
}

/**
 * Load dev-only admin module.
 */
async function loadDevModule() {
    try {
        const adminCard = document.getElementById('role-activity-admin');
        if (adminCard) {
            adminCard.style.display = 'flex';
            adminCard.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    const module = await import('./admin.js');
                    module.initAdmin(client, state);
                    showStep('admin');
                } catch (err) {
                    console.error('Failed to load admin module:', err);
                }
            });
        }
    } catch (error) {
        console.log('Dev admin module not available');
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
