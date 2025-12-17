/**
 * SpacetimeDB HTTP Client
 * 
 * A simple HTTP-based client for SpacetimeDB that bypasses the SDK.
 * Uses the REST API for reducer calls and SQL queries.
 * 
 * Note: For real-time subscriptions, WebSocket would be needed.
 * This implementation uses polling for simplicity.
 */

export class SpacetimeDBClient {
    constructor(config) {
        this.host = config.host.replace('ws://', 'http://').replace('wss://', 'https://');
        this.module = config.module;
        this.identity = null;
        this.token = null;
        this.pollInterval = null;
        this.pollRate = config.pollRate || 2000; // 2 seconds
        
        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
        this.onPlayerUpdate = null;
        this.onRoomUpdate = null;
        this.onRoomMembersUpdate = null;
        
        // Local storage keys
        this.storageKeys = {
            identity: 'stdb_identity',
            token: 'stdb_token',
        };
    }
    
    /**
     * Base URL for API calls
     */
    get baseUrl() {
        return `${this.host}/v1/database/${this.module}`;
    }
    
    /**
     * Connect to SpacetimeDB (initialize identity)
     */
    async connect() {
        console.log('[STDB] Connecting to:', this.baseUrl);
        
        try {
            // Load stored identity/token
            this.identity = localStorage.getItem(this.storageKeys.identity);
            this.token = localStorage.getItem(this.storageKeys.token);
            
            // Verify connection by querying the database
            await this.sql('SELECT 1');
            
            console.log('[STDB] Connected. Identity:', this.identity || '(anonymous)');
            
            if (this.onConnect) {
                this.onConnect();
            }
            
            return true;
        } catch (error) {
            console.error('[STDB] Connection failed:', error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }
    
    /**
     * Disconnect and stop polling
     */
    disconnect() {
        this.stopPolling();
        if (this.onDisconnect) {
            this.onDisconnect();
        }
    }
    
    /**
     * Call a reducer
     */
    async callReducer(reducerName, args = {}) {
        const url = `${this.baseUrl}/call/${reducerName}`;
        
        console.log('[STDB] Calling reducer:', reducerName, args);
        
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Add auth token if available (SpacetimeDB uses Authorization header with token)
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        // Also add identity header for SpacetimeDB
        if (this.identity) {
            headers['spacetime-identity'] = this.identity;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(args),
        });
        
        // Check for new identity in response headers (SpacetimeDB uses lowercase header names)
        const newIdentity = response.headers.get('spacetime-identity');
        const newToken = response.headers.get('spacetime-identity-token');
        
        if (newIdentity) {
            this.identity = newIdentity;
            localStorage.setItem(this.storageKeys.identity, newIdentity);
            console.log('[STDB] New identity:', newIdentity);
        }
        
        if (newToken) {
            this.token = newToken;
            localStorage.setItem(this.storageKeys.token, newToken);
            console.log('[STDB] Token received');
        }
        
        const text = await response.text();
        
        if (!response.ok) {
            throw new Error(text || `Reducer ${reducerName} failed`);
        }
        
        console.log('[STDB] Reducer response:', text || '(empty)');
        
        return text ? JSON.parse(text) : null;
    }
    
    /**
     * Execute a SQL query
     */
    async sql(query) {
        const url = `${this.baseUrl}/sql`;
        
        const headers = {
            'Content-Type': 'text/plain',
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        if (this.identity) {
            headers['spacetime-identity'] = this.identity;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: query,
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'SQL query failed');
        }
        
        const results = await response.json();
        return this.parseQueryResults(results);
    }
    
    /**
     * Parse SQL query results into usable objects
     */
    parseQueryResults(results) {
        if (!results || results.length === 0) return [];
        
        const result = results[0];
        const schema = result.schema.elements;
        const rows = result.rows;
        
        return rows.map(row => {
            const obj = {};
            schema.forEach((field, index) => {
                const fieldName = field.name.some || `field_${index}`;
                let value = row[index];
                
                // Handle special types
                if (Array.isArray(value) && value.length === 1) {
                    // Unwrap single-element arrays (identity, timestamps)
                    value = value[0];
                }
                
                // Convert field names to camelCase
                const camelName = fieldName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                obj[camelName] = value;
            });
            return obj;
        });
    }
    
    // =========================================================================
    // Game-specific methods
    // =========================================================================
    
    /**
     * Register a player or sign in existing player
     */
    async registerPlayer(username) {
        await this.callReducer('register_player', { username });
        
        // Fetch player data
        const players = await this.sql(
            `SELECT * FROM player WHERE username = '${username.replace(/'/g, "''")}'`
        );
        
        if (players.length === 0) {
            throw new Error('Player registration failed');
        }
        
        return players[0];
    }
    
    /**
     * Sign in and create a room
     */
    async signInWithRoom(username, role) {
        await this.callReducer('sign_in_with_room', { username, role: { [role]: {} } });
        
        // Fetch player and room data
        const players = await this.sql(
            `SELECT * FROM player WHERE username = '${username.replace(/'/g, "''")}'`
        );
        
        if (players.length === 0) {
            throw new Error('Sign in failed');
        }
        
        const player = players[0];
        
        // Find the room owned by this player
        const rooms = await this.sql(
            `SELECT * FROM room WHERE owner_id = ${player.id}`
        );
        
        const room = rooms.length > 0 ? rooms[0] : null;
        
        // Get room members if we have a room
        let members = [];
        if (room) {
            members = await this.getRoomMembers(room.id);
        }
        
        return { player, room, members };
    }
    
    /**
     * Join an existing room
     * Note: This uses the combined sign_in_and_join_room reducer to avoid
     * CORS issues with token persistence between separate HTTP requests.
     */
    async joinRoom(roomCode, role, username) {
        // Use combined reducer that handles both sign-in and join atomically
        await this.callReducer('sign_in_and_join_room', { 
            username,
            room_code: roomCode, 
            role: { [role]: {} } 
        });
        
        // Fetch player data
        const players = await this.sql(
            `SELECT * FROM player WHERE username = '${username.replace(/'/g, "''")}'`
        );
        
        const player = players.length > 0 ? players[0] : null;
        
        // Fetch room data
        const rooms = await this.sql(
            `SELECT * FROM room WHERE code = '${roomCode.replace(/'/g, "''")}'`
        );
        
        if (rooms.length === 0) {
            throw new Error('Room not found');
        }
        
        const room = rooms[0];
        const members = await this.getRoomMembers(room.id);
        
        return { player, room, members };
    }
    
    /**
     * Leave a room
     */
    async leaveRoom(roomId) {
        await this.callReducer('leave_room', { room_id: roomId });
    }
    
    /**
     * Get room members with player info
     */
    async getRoomMembers(roomId) {
        const members = await this.sql(`
            SELECT rm.player_id, rm.role, p.username 
            FROM room_member rm 
            JOIN player p ON rm.player_id = p.id 
            WHERE rm.room_id = ${roomId}
        `);
        
        return members.map(m => ({
            playerId: m.playerId,
            username: m.username,
            role: this.parseRole(m.role),
        }));
    }
    
    /**
     * Parse role from database format
     */
    parseRole(roleValue) {
        // Role is stored as an enum, might come as object or string
        if (typeof roleValue === 'object') {
            return Object.keys(roleValue)[0] || 'Observer';
        }
        if (typeof roleValue === 'number') {
            const roles = ['Top', 'Bottom', 'Observer', 'Photographer'];
            return roles[roleValue] || 'Observer';
        }
        return roleValue || 'Observer';
    }
    
    // =========================================================================
    // Polling for real-time updates
    // =========================================================================
    
    /**
     * Start polling for updates
     */
    startPolling(roomId, playerId) {
        if (this.pollInterval) {
            this.stopPolling();
        }
        
        this.currentRoomId = roomId;
        this.currentPlayerId = playerId;
        
        console.log('[STDB] Starting polling for room:', roomId);
        
        this.pollInterval = setInterval(() => {
            this.pollUpdates();
        }, this.pollRate);
        
        // Poll immediately
        this.pollUpdates();
    }
    
    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    
    /**
     * Poll for updates
     */
    async pollUpdates() {
        if (!this.currentRoomId) return;
        
        try {
            const members = await this.getRoomMembers(this.currentRoomId);
            
            if (this.onRoomMembersUpdate) {
                this.onRoomMembersUpdate(members);
            }
        } catch (error) {
            console.error('[STDB] Poll error:', error);
        }
    }
}

