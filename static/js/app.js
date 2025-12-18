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
    btnShareCode: document.getElementById('btn-share-code'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    btnLobbyLogout: document.getElementById('btn-lobby-logout'),
    ownerControls: document.getElementById('owner-controls'),
    btnCreateInvite: document.getElementById('btn-create-invite'),
    inviteResult: document.getElementById('invite-result'),
    inviteTokenDisplay: document.getElementById('invite-token-display'),
    btnCopyInvite: document.getElementById('btn-copy-invite'),
    btnCloseRoom: document.getElementById('btn-close-room'),
    
    // Connection status
    connectionStatus: document.getElementById('connection-status'),
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
        elements.currentPlayer.textContent = `Playing as: ${player.username}`;
    }
    
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
                    <span class="player-card__role">${member.role}</span>
                </div>
            </div>
        `;
    }).join('');
}

function showLobby() {
    if (elements.lobbyRoomName) elements.lobbyRoomName.textContent = state.currentRoom?.name || 'Room';
    if (elements.lobbyRoomCode) elements.lobbyRoomCode.textContent = state.currentRoom?.code || '?????';
    
    const isOwner = state.currentRoom?.ownerId === state.player?.id;
    elements.ownerControls?.classList.toggle('hidden', !isOwner);
    
    renderRoomMembers();
    showStep('lobby');
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
    
    try {
        await client.loginUser(username, password);
        state.user = { username };
        localStorage.setItem(CONFIG.storage.username, username);
        
        if (elements.currentUser) elements.currentUser.textContent = `Welcome, ${username}`;
        
        await loadPlayers();
        showStep('player');
    } catch (error) {
        showError(elements.loginError, error.message || 'Login failed');
    } finally {
        setButtonLoading(e.target.querySelector('[data-action="login"]'), false);
    }
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
    
    try {
        await client.registerUser(username, password);
        state.user = { username };
        localStorage.setItem(CONFIG.storage.username, username);
        
        if (elements.currentUser) elements.currentUser.textContent = `Welcome, ${username}`;
        
        await loadPlayers();
        showStep('player');
    } catch (error) {
        showError(elements.loginError, error.message || 'Registration failed');
    } finally {
        setButtonLoading(elements.btnRegister, false);
    }
}

async function handleLogout() {
    // Call backend to update last_seen and clear session
    await client.logoutUser();
    
    // Clear all local state
    state.user = null;
    state.player = null;
    state.players = [];
    state.currentRoom = null;
    state.currentRole = null;
    state.roomMembers = [];
    
    localStorage.removeItem(CONFIG.storage.username);
    localStorage.removeItem(CONFIG.storage.playerId);
    
    // Clear inputs
    if (elements.usernameInput) elements.usernameInput.value = '';
    if (elements.passwordInput) elements.passwordInput.value = '';
    
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
    
    try {
        await client.createPlayer(playerName);
        elements.playerNameInput.value = '';
        await loadPlayers();
    } catch (error) {
        showError(elements.playerError, error.message || 'Failed to create player');
    }
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
    
    try {
        if (state.pendingAction === 'create') {
            const result = await client.createRoom(state.player.id, state.pendingRoomName, role);
            state.currentRoom = result.room;
            state.currentRole = role;
            state.roomMembers = result.members || [];
        } else if (state.pendingAction === 'join') {
            const result = await client.joinRoom(state.player.id, state.pendingRoomCode, role);
            state.currentRoom = result.room;
            state.currentRole = role;
            state.roomMembers = result.members || [];
        } else if (state.pendingAction === 'invitation') {
            const result = await client.acceptInvitation(state.player.id, state.invitationToken, role);
            state.currentRoom = result.room;
            state.currentRole = role;
            state.roomMembers = result.members || [];
        }
        
        showLobby();
    } catch (error) {
        showError(elements.roleError, error.message || 'Failed to proceed');
    } finally {
        setButtonLoading(card, false);
    }
}

async function handleLeaveRoom() {
    if (!state.currentRoom || !state.player) return;
    
    try {
        await client.leaveRoom(state.player.id);
        state.currentRoom = null;
        state.currentRole = null;
        state.roomMembers = [];
        showStep('room');
    } catch (error) {
        console.error('Failed to leave room:', error);
    }
}

async function handleCreateInvitation() {
    if (!state.currentRoom || !state.player) return;
    
    try {
        await client.createRoomInvitation(state.player.id);
        // The invitation will appear in the table; we need to query for it
        // For now, show a success message
        if (elements.inviteResult) {
            elements.inviteResult.classList.remove('hidden');
            if (elements.inviteTokenDisplay) {
                elements.inviteTokenDisplay.value = 'Check room_invitation table';
            }
        }
    } catch (error) {
        alert('Failed to create invitation: ' + error.message);
    }
}

async function handleCloseRoom() {
    if (!state.currentRoom || !state.player) return;
    if (!confirm('Close this room? All players will be removed.')) return;
    
    try {
        await client.closeRoom(state.player.id);
        state.currentRoom = null;
        state.currentRole = null;
        state.roomMembers = [];
        showStep('room');
    } catch (error) {
        alert('Failed to close room: ' + error.message);
    }
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
    elements.btnBackPlayer?.addEventListener('click', () => showStep('player'));
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
    elements.btnLobbyLogout?.addEventListener('click', handleLogout);
    elements.btnCreateInvite?.addEventListener('click', handleCreateInvitation);
    elements.btnCopyInvite?.addEventListener('click', copyInvitation);
    elements.btnCloseRoom?.addEventListener('click', handleCloseRoom);
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
