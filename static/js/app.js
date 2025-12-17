/**
 * Damsels - Client Application
 * 
 * Handles connection to SpacetimeDB and UI state management
 * for login, room creation/joining, and role selection.
 */

import { SpacetimeDBClient } from './spacetimedb-client.js';

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
    // SpacetimeDB connection settings
    spacetimedb: {
        // Local development
        host: window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://spacetimedb.example.com',
        module: 'damsels',
        pollRate: 2000, // Poll every 2 seconds for room updates
    },
    // Local storage keys
    storage: {
        identity: 'damsels_identity',
        username: 'damsels_username',
    },
    // Development mode detection
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
};

// =============================================================================
// State Management
// =============================================================================

const state = {
    connected: false,
    identity: null,
    player: null,
    currentRoom: null,
    currentRole: null,
    currentStep: 'login',
    // Room members (populated by SpacetimeDB subscription in production)
    roomMembers: [],
};

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Steps
    stepLogin: document.getElementById('step-login'),
    stepRoom: document.getElementById('step-room'),
    stepRole: document.getElementById('step-role'),
    stepLobby: document.getElementById('step-lobby'),
    stepAdmin: document.getElementById('step-admin'),
    
    // Login form
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    loginError: document.getElementById('login-error'),
    
    // Room selection
    playerGreeting: document.getElementById('player-greeting'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    joinForm: document.getElementById('join-form'),
    roomCodeInput: document.getElementById('room-code'),
    joinError: document.getElementById('join-error'),
    
    // Role selection
    currentRoomCode: document.getElementById('current-room-code'),
    roleCards: document.querySelectorAll('.role-card:not(.role-card--dev)'),
    roleError: document.getElementById('role-error'),
    
    // Lobby
    lobbyRoomCode: document.getElementById('lobby-room-code'),
    lobbyPlayers: document.getElementById('lobby-players'),
    btnShareCode: document.getElementById('btn-share-code'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    
    // Connection status
    connectionStatus: document.getElementById('connection-status'),
};

// =============================================================================
// UI Helpers
// =============================================================================

/**
 * Show a specific step and hide others.
 * Exported to window for admin.js to use.
 */
function showStep(stepName) {
    state.currentStep = stepName;
    
    elements.stepLogin?.classList.toggle('step--active', stepName === 'login');
    elements.stepRoom?.classList.toggle('step--active', stepName === 'room');
    elements.stepRole?.classList.toggle('step--active', stepName === 'role');
    elements.stepLobby?.classList.toggle('step--active', stepName === 'lobby');
    elements.stepAdmin?.classList.toggle('step--active', stepName === 'admin');
}
window.showStep = showStep;

/**
 * Display an error message in the specified container.
 */
function showError(element, message) {
    element.textContent = message;
    element.classList.add('login-form__error--visible');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        element.classList.remove('login-form__error--visible');
    }, 5000);
}

/**
 * Clear error message from container.
 */
function clearError(element) {
    element.textContent = '';
    element.classList.remove('login-form__error--visible');
}

/**
 * Update connection status indicator.
 */
function updateConnectionStatus(connected, text = null) {
    const statusEl = elements.connectionStatus;
    if (!statusEl) return;
    
    statusEl.classList.toggle('connection-status--connected', connected);
    statusEl.classList.toggle('connection-status--disconnected', !connected);
    
    if (text) {
        statusEl.querySelector('.connection-status__text').textContent = text;
    }
}

/**
 * Set loading state on a button.
 */
function setButtonLoading(button, loading) {
    button.classList.toggle('btn--loading', loading);
    button.disabled = loading;
}

/**
 * Format room code input as user types.
 */
function formatRoomCode(input) {
    // 5 character room code, uppercase alphanumeric only
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    input.value = value.slice(0, 5);
}

// =============================================================================
// Lobby Functions
// =============================================================================

/**
 * Get the icon for a role.
 */
function getRoleIcon(role) {
    const icons = {
        'Top': '👑',
        'Bottom': '🌹',
        'Observer': '👁',
        'Photographer': '📸',
        'ActivityAdmin': '⚙️',
    };
    return icons[role] || '👤';
}

/**
 * Render the player list in the lobby.
 */
function renderPlayerList() {
    const container = elements.lobbyPlayers;
    if (!container) return;
    
    if (state.roomMembers.length === 0) {
        container.innerHTML = '<div class="lobby__empty">No players yet</div>';
        return;
    }
    
    container.innerHTML = state.roomMembers.map(member => {
        const isYou = member.playerId === state.player?.id;
        const roleClass = `player-card__role--${member.role.toLowerCase()}`;
        
        return `
            <div class="player-card ${isYou ? 'player-card--you' : ''}">
                <div class="player-card__avatar">${getRoleIcon(member.role)}</div>
                <div class="player-card__info">
                    <span class="player-card__name">${escapeHtml(member.username)}</span>
                    <span class="player-card__role ${roleClass}">${member.role}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Add a player to the room (called when someone joins).
 */
function addPlayerToRoom(playerId, username, role) {
    // Check if already in list
    const existing = state.roomMembers.find(m => m.playerId === playerId);
    if (existing) return;
    
    state.roomMembers.push({ playerId, username, role });
    renderPlayerList();
}

/**
 * Remove a player from the room (called when someone leaves).
 */
function removePlayerFromRoom(playerId) {
    state.roomMembers = state.roomMembers.filter(m => m.playerId !== playerId);
    renderPlayerList();
}

/**
 * Show the lobby with the current room info.
 */
function showLobby() {
    // Set room code display
    if (elements.lobbyRoomCode) {
        elements.lobbyRoomCode.textContent = state.currentRoom?.code || '?????';
    }
    
    // Render current players
    renderPlayerList();
    
    // Show lobby step
    showStep('lobby');
}

/**
 * Copy room code to clipboard.
 */
async function copyRoomCode() {
    const code = state.currentRoom?.code;
    if (!code) return;
    
    try {
        await navigator.clipboard.writeText(code);
        
        // Visual feedback
        const btn = elements.btnShareCode;
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1500);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

/**
 * Leave the current room.
 */
async function leaveRoom() {
    console.log('Leaving room:', state.currentRoom?.code);
    
    // Call SpacetimeDB to leave the room
    await client.leaveCurrentRoom();
    
    // Clear room state
    state.currentRoom = null;
    state.currentRole = null;
    state.roomMembers = [];
    
    // Go back to room selection
    showStep('room');
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// SpacetimeDB Connection (Real HTTP Client)
// =============================================================================

/**
 * SpacetimeDB client wrapper.
 * Uses HTTP API for reducer calls and SQL queries.
 */
class SpacetimeClient {
    constructor() {
        this.client = new SpacetimeDBClient(CONFIG.spacetimedb);
        this.connected = false;
        this.identity = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
    }
    
    /**
     * Connect to SpacetimeDB.
     */
    async connect() {
        console.log('Connecting to SpacetimeDB...');
        
        // Set up callbacks
        this.client.onConnect = () => {
            this.connected = true;
            state.connected = true;
            state.identity = this.client.identity;
            if (this.onConnect) this.onConnect();
        };
        
        this.client.onDisconnect = () => {
            this.connected = false;
            state.connected = false;
            if (this.onDisconnect) this.onDisconnect();
        };
        
        this.client.onError = (error) => {
            if (this.onError) this.onError(error);
        };
        
        // Set up room members update callback
        this.client.onRoomMembersUpdate = (members) => {
            state.roomMembers = members;
            renderPlayerList();
        };
        
        await this.client.connect();
        
        this.identity = this.client.identity;
        console.log('Connected with identity:', this.identity);
    }
    
    /**
     * Register a new player.
     */
    async registerPlayer(username) {
        console.log('Registering player:', username);
        
        if (username.length < 2) {
            throw new Error('Username must be at least 2 characters');
        }
        
        try {
            const player = await this.client.registerPlayer(username);
            
            state.player = {
                id: player.id,
                username: player.username,
                identity: player.identity,
                xp: player.xp || 0,
            };
            
            localStorage.setItem(CONFIG.storage.username, username);
            
            return state.player;
        } catch (error) {
            console.error('Registration failed:', error);
            throw new Error(error.message || 'Registration failed');
        }
    }
    
    /**
     * Create a new room (sign in with room).
     */
    async createRoom(role) {
        console.log('Creating room with role:', role);
        
        try {
            const result = await this.client.signInWithRoom(state.player.username, role);
            
            if (result.room) {
                state.currentRoom = {
                    id: result.room.id,
                    code: result.room.code,
                    ownerId: result.room.ownerId,
                };
            }
            
            state.currentRole = role;
            state.roomMembers = result.members || [];
            
            // Start polling for real-time updates
            if (state.currentRoom) {
                this.client.startPolling(state.currentRoom.id, state.player.id);
            }
            
            return state.currentRoom;
        } catch (error) {
            console.error('Room creation failed:', error);
            throw new Error(error.message || 'Failed to create room');
        }
    }
    
    /**
     * Join an existing room.
     */
    async joinRoom(roomCode, role) {
        console.log('Joining room:', roomCode, 'with role:', role);
        
        try {
            const result = await this.client.joinRoom(roomCode, role);
            
            state.currentRoom = {
                id: result.room.id,
                code: result.room.code,
                ownerId: result.room.ownerId,
            };
            
            state.currentRole = role;
            state.roomMembers = result.members || [];
            
            // Start polling for real-time updates
            this.client.startPolling(state.currentRoom.id, state.player.id);
            
            return state.currentRoom;
        } catch (error) {
            console.error('Join room failed:', error);
            throw new Error(error.message || 'Failed to join room');
        }
    }
    
    /**
     * Leave the current room.
     */
    async leaveCurrentRoom() {
        if (!state.currentRoom) return;
        
        try {
            await this.client.leaveRoom(state.currentRoom.id);
            this.client.stopPolling();
        } catch (error) {
            console.error('Leave room failed:', error);
        }
    }
}

// =============================================================================
// Application Logic
// =============================================================================

const client = new SpacetimeClient();

/**
 * Initialize the application.
 */
async function init() {
    updateConnectionStatus(false, 'Connecting...');
    
    try {
        // Set up connection callbacks
        client.onConnect = () => {
            updateConnectionStatus(true, 'Connected');
        };
        
        client.onDisconnect = () => {
            updateConnectionStatus(false, 'Disconnected');
        };
        
        client.onError = (error) => {
            console.error('SpacetimeDB error:', error);
            updateConnectionStatus(false, 'Error');
        };
        
        // Connect to SpacetimeDB
        await client.connect();
        
        // Check for existing session
        const storedUsername = localStorage.getItem(CONFIG.storage.username);
        if (storedUsername) {
            elements.usernameInput.value = storedUsername;
        }
        
        // Load dev admin module if in dev mode
        if (CONFIG.isDev) {
            loadDevModule();
        }
        
    } catch (error) {
        console.error('Failed to connect:', error);
        updateConnectionStatus(false, 'Connection failed');
    }
    
    // Set up event listeners
    setupEventListeners();
}

/**
 * Dynamically load the dev admin module.
 */
function loadDevModule() {
    const script = document.createElement('script');
    script.src = '/js/dev/admin.js';
    script.type = 'module';
    script.onerror = () => console.warn('Dev admin module not found (expected in production)');
    document.head.appendChild(script);
}

function setupEventListeners() {
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.btnCreateRoom?.addEventListener('click', handleCreateRoom);
    elements.joinForm?.addEventListener('submit', handleJoinRoom);
    
    elements.roomCodeInput?.addEventListener('input', (e) => {
        formatRoomCode(e.target);
    });
    
    // Role selection
    elements.roleCards.forEach(card => {
        card.addEventListener('click', () => handleRoleSelect(card));
    });
    
    // Lobby actions
    elements.btnShareCode?.addEventListener('click', copyRoomCode);
    elements.btnLeaveRoom?.addEventListener('click', leaveRoom);
}

/**
 * Handle login form submission.
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const username = elements.usernameInput.value.trim();
    const submitBtn = elements.loginForm.querySelector('.login-form__submit');
    
    clearError(elements.loginError);
    setButtonLoading(submitBtn, true);
    
    try {
        await client.registerPlayer(username);
        
        // Update greeting
        elements.playerGreeting.innerHTML = `
            <span class="greeting__welcome">Welcome,</span>
            <span class="greeting__name">${username}</span>
        `;
        
        // Transition to room selection
        showStep('room');
        
    } catch (error) {
        showError(elements.loginError, error.message);
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

/**
 * Handle create room button click.
 */
async function handleCreateRoom() {
    setButtonLoading(elements.btnCreateRoom, true);
    clearError(elements.joinError);
    
    try {
        // Store pending room creation (role selected next)
        state.pendingAction = 'create';
        
        // Show role selection
        elements.currentRoomCode.textContent = 'New Room';
        showStep('role');
        
    } catch (error) {
        showError(elements.joinError, error.message);
    } finally {
        setButtonLoading(elements.btnCreateRoom, false);
    }
}

/**
 * Handle join room form submission.
 */
async function handleJoinRoom(e) {
    e.preventDefault();
    
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    const submitBtn = elements.joinForm.querySelector('.join-form__submit');
    
    clearError(elements.joinError);
    
    if (!roomCode || roomCode.length !== 5) {
        showError(elements.joinError, 'Room code must be 5 characters');
        return;
    }
    
    setButtonLoading(submitBtn, true);
    
    try {
        // Store pending room join (role selected next)
        state.pendingAction = 'join';
        state.pendingRoomCode = roomCode;
        
        // Show role selection
        elements.currentRoomCode.textContent = roomCode;
        showStep('role');
        
    } catch (error) {
        showError(elements.joinError, error.message);
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

/**
 * Handle role card selection.
 */
async function handleRoleSelect(card) {
    const role = card.dataset.role;
    
    // Handle ActivityAdmin - delegate to dev module
    if (role === 'ActivityAdmin') {
        if (window.showAdminPanel) {
            window.showAdminPanel();
        }
        return;
    }
    
    // Visual feedback
    elements.roleCards.forEach(c => c.classList.remove('role-card--selected'));
    card.classList.add('role-card--selected');
    card.classList.add('role-card--loading');
    
    clearError(elements.roleError);
    
    try {
        if (state.pendingAction === 'create') {
            // Create the room with selected role
            await client.createRoom(role);
            console.log('Room created:', state.currentRoom.code);
            
        } else if (state.pendingAction === 'join') {
            // Join the room with selected role
            await client.joinRoom(state.pendingRoomCode, role);
            console.log('Joined room:', state.pendingRoomCode);
        }
        
        // Clear pending action
        state.pendingAction = null;
        state.pendingRoomCode = null;
        
        // Remove loading state and show lobby
        card.classList.remove('role-card--loading');
        card.classList.remove('role-card--selected');
        showLobby();
        
    } catch (error) {
        showError(elements.roleError, error.message);
        card.classList.remove('role-card--loading');
    }
}

// =============================================================================
// Start Application
// =============================================================================

document.addEventListener('DOMContentLoaded', init);
