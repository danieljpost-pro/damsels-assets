/**
 * Damsels - Client Application
 * 
 * Handles connection to SpacetimeDB and UI state management
 * for login, room creation/joining, and role selection.
 */

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
    // SpacetimeDB connection settings
    spacetimedb: {
        // Local development (Zola proxies to SpacetimeDB)
        host: window.location.hostname === 'localhost' 
            ? 'ws://localhost:3000' 
            : 'wss://spacetimedb.example.com',
        module: 'damsels',
    },
    // Local storage keys
    storage: {
        identity: 'damsels_identity',
        username: 'damsels_username',
    }
};

// =============================================================================
// State Management
// =============================================================================

const state = {
    connected: false,
    identity: null,
    player: null,
    currentRoom: null,
    currentStep: 'login',
};

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Steps
    stepLogin: document.getElementById('step-login'),
    stepRoom: document.getElementById('step-room'),
    stepRole: document.getElementById('step-role'),
    
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
    roleCards: document.querySelectorAll('.role-card'),
    roleError: document.getElementById('role-error'),
    
    // Connection status
    connectionStatus: document.getElementById('connection-status'),
};

// =============================================================================
// UI Helpers
// =============================================================================

/**
 * Show a specific step and hide others.
 */
function showStep(stepName) {
    state.currentStep = stepName;
    
    elements.stepLogin.classList.toggle('step--active', stepName === 'login');
    elements.stepRoom.classList.toggle('step--active', stepName === 'room');
    elements.stepRole.classList.toggle('step--active', stepName === 'role');
}

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
// SpacetimeDB Connection (Placeholder)
// =============================================================================

/**
 * SpacetimeDB client placeholder.
 * 
 * In production, this would be replaced with the actual generated client
 * from `spacetime generate --lang typescript`.
 * 
 * Example usage with real SDK:
 * 
 * import { SpacetimeDBClient, Identity } from '@clockworklabs/spacetimedb-sdk';
 * import { Player, Room, RoomMember } from './module_bindings';
 */

class SpacetimeClient {
    constructor() {
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
        
        // Simulate connection delay
        await this.simulateDelay(500);
        
        // Load or generate identity
        let storedIdentity = localStorage.getItem(CONFIG.storage.identity);
        if (storedIdentity) {
            this.identity = storedIdentity;
        } else {
            this.identity = this.generateIdentity();
            localStorage.setItem(CONFIG.storage.identity, this.identity);
        }
        
        this.connected = true;
        state.connected = true;
        state.identity = this.identity;
        
        if (this.onConnect) this.onConnect();
        
        console.log('Connected with identity:', this.identity);
    }
    
    /**
     * Register a new player.
     */
    async registerPlayer(username) {
        console.log('Registering player:', username);
        
        await this.simulateDelay(300);
        
        // Simulate validation
        if (username.length < 2) {
            throw new Error('Username must be at least 2 characters');
        }
        
        // In production, this would call:
        // await this.client.call('register_player', username);
        
        state.player = {
            id: Math.floor(Math.random() * 10000),
            username: username,
            identity: this.identity,
            xp: 0,
        };
        
        localStorage.setItem(CONFIG.storage.username, username);
        
        return state.player;
    }
    
    /**
     * Create a new room.
     */
    async createRoom(role) {
        console.log('Creating room with role:', role);
        
        await this.simulateDelay(300);
        
        // In production, this would call:
        // await this.client.call('create_room', role);
        
        const code = this.generateRoomCode();
        
        state.currentRoom = {
            id: Math.floor(Math.random() * 10000),
            code: code,
            ownerId: state.player.id,
        };
        
        return state.currentRoom;
    }
    
    /**
     * Join an existing room.
     */
    async joinRoom(roomCode, role) {
        console.log('Joining room:', roomCode, 'with role:', role);
        
        await this.simulateDelay(300);
        
        // In production, this would call:
        // await this.client.call('join_room', roomCode, role);
        
        // Simulate room lookup (in production, would validate against DB)
        state.currentRoom = {
            id: Math.floor(Math.random() * 10000),
            code: roomCode.toUpperCase(),
        };
        
        return state.currentRoom;
    }
    
    // Utility methods
    
    generateIdentity() {
        return 'id_' + Math.random().toString(36).substring(2, 15);
    }
    
    generateRoomCode() {
        // 5 character code, excluding ambiguous characters (0, O, I, L, 1)
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }
    
    simulateDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
        
    } catch (error) {
        console.error('Failed to connect:', error);
        updateConnectionStatus(false, 'Connection failed');
    }
    
    // Set up event listeners
    setupEventListeners();
}

/**
 * Set up all event listeners.
 */
function setupEventListeners() {
    // Login form submission
    elements.loginForm.addEventListener('submit', handleLogin);
    
    // Create room button
    elements.btnCreateRoom.addEventListener('click', handleCreateRoom);
    
    // Join room form
    elements.joinForm.addEventListener('submit', handleJoinRoom);
    
    // Room code formatting
    elements.roomCodeInput.addEventListener('input', (e) => {
        formatRoomCode(e.target);
    });
    
    // Role selection
    elements.roleCards.forEach(card => {
        card.addEventListener('click', () => handleRoleSelect(card));
    });
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
    
    // Visual feedback
    elements.roleCards.forEach(c => c.classList.remove('role-card--selected'));
    card.classList.add('role-card--selected');
    card.classList.add('role-card--loading');
    
    clearError(elements.roleError);
    
    try {
        if (state.pendingAction === 'create') {
            // Create the room with selected role
            const room = await client.createRoom(role);
            
            console.log('Room created:', room.code);
            
            // Show the room code to share
            alert(`Room created!\n\nShare this code: ${room.code}`);
            
            // In a full implementation, would transition to game/lobby view
            
        } else if (state.pendingAction === 'join') {
            // Join the room with selected role
            await client.joinRoom(state.pendingRoomCode, role);
            
            console.log('Joined room:', state.pendingRoomCode);
            
            // In a full implementation, would transition to game/lobby view
            alert(`Joined room ${state.pendingRoomCode} as ${role}!`);
        }
        
        // For now, reset to room step (would normally go to game)
        setTimeout(() => {
            card.classList.remove('role-card--loading');
            showStep('room');
        }, 500);
        
    } catch (error) {
        showError(elements.roleError, error.message);
        card.classList.remove('role-card--loading');
    }
}

// =============================================================================
// Start Application
// =============================================================================

document.addEventListener('DOMContentLoaded', init);

