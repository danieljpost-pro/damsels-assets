/**
 * SpacetimeDB Client with WebSocket Subscriptions
 * 
 * Uses WebSocket for real-time subscriptions and HTTP for reducer calls.
 * Supports the new User + Player authentication model.
 */

export class SpacetimeDBClient {
    constructor(config) {
        this.httpHost = config.host.replace('ws://', 'http://').replace('wss://', 'https://');
        this.wsHost = config.wsHost || 'ws://localhost:3000';
        this.module = config.module;
        this.identity = null;
        this.token = null;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 120000;
        this.isReconnecting = false;
        
        // Client cache - mirrors subscribed tables
        this.cache = {
            user: new Map(),
            player: new Map(),
            room: new Map(),
            room_member: new Map(),
            room_invitation: new Map(),
            category: new Map(),
            activity: new Map(),
            player_activity: new Map(),
            player_unlocked_activity: new Map(),
        };
        
        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
        this.onRoomMembersUpdate = null;
        this.onActivitiesUpdate = null;
        this.onUnlockedActivitiesUpdate = null;
        
        // Local storage keys
        this.storageKeys = {
            identity: 'stdb_identity',
            token: 'stdb_token',
        };
    }
    
    get baseUrl() {
        return `${this.httpHost}/v1/database/${this.module}`;
    }
    
    get wsUrl() {
        return `${this.wsHost}/v1/database/${this.module}/subscribe`;
    }
    
    // =========================================================================
    // Connection Management
    // =========================================================================
    
    async connect() {
        console.log('[STDB] Connecting to:', this.wsUrl);
        
        this.identity = localStorage.getItem(this.storageKeys.identity);
        this.token = localStorage.getItem(this.storageKeys.token);
        
        return new Promise((resolve, reject) => {
            try {
                let url = this.wsUrl;
                if (this.token) {
                    url += '?token=' + encodeURIComponent(this.token);
                }
                
                this.ws = new WebSocket(url, 'v1.json.spacetimedb');
                this.ws.binaryType = 'arraybuffer';
                
                this.ws.onopen = () => {
                    console.log('[STDB] WebSocket connected');
                    this.reconnectAttempts = 0;
                    
                    this.sendSubscription([
                        "SELECT * FROM user",
                        "SELECT * FROM player",
                        "SELECT * FROM room",
                        "SELECT * FROM room_member",
                        "SELECT * FROM room_invitation",
                        "SELECT * FROM category",
                        "SELECT * FROM activity",
                        "SELECT * FROM player_activity",
                        "SELECT * FROM player_unlocked_activity",
                    ]);
                    
                    if (this.onConnect) this.onConnect();
                    resolve(true);
                };
                
                this.ws.onmessage = (event) => this.handleMessage(event.data);
                this.ws.onerror = (error) => {
                    console.error('[STDB] WebSocket error:', error);
                    if (this.onError) this.onError(error);
                };
                this.ws.onclose = (event) => {
                    console.log('[STDB] WebSocket closed:', event.code);
                    if (this.onDisconnect) this.onDisconnect();
                    this.attemptReconnect();
                };
                
            } catch (error) {
                console.error('[STDB] Connection failed:', error);
                reject(error);
            }
        });
    }
    
    attemptReconnect() {
        if (this.isReconnecting) {
            return; // Already attempting reconnection
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[STDB] Max reconnect attempts reached, giving up');
            this.isReconnecting = false;
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            30000 // Cap at 30 seconds
        );
        console.log(`[STDB] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.isReconnecting = false; // Allow next attempt after timeout
            this.connect()
                .then(() => {
                    // Don't reset attempts here - wait until identity token is received
                    console.log('[STDB] Reconnection established, awaiting identity...');
                })
                .catch((error) => {
                    console.error('[STDB] Reconnect failed:', error.message || error);
                    // Continue backing off on failure
                    this.attemptReconnect();
                });
        }, delay);
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.onDisconnect) this.onDisconnect();
    }
    
    // =========================================================================
    // WebSocket Subscription
    // =========================================================================
    
    sendSubscription(queries) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        // request_id must fit in u32 (max ~4.2 billion)
        this.subscriptionCounter = (this.subscriptionCounter || 0) + 1;
        
        const message = {
            Subscribe: {
                query_strings: queries,
                request_id: this.subscriptionCounter,
            }
        };
        
        this.ws.send(JSON.stringify(message));
    }
    
    handleMessage(data) {
        let message;
        if (typeof data === 'string') {
            message = JSON.parse(data);
        } else {
            const decoder = new TextDecoder('utf-8');
            message = JSON.parse(decoder.decode(data));
        }
        
        console.log('[STDB] Message received:', Object.keys(message));
        
        if (message.IdentityToken) {
            this.handleIdentityToken(message.IdentityToken);
        } else if (message.InitialSubscription) {
            this.handleInitialSubscription(message.InitialSubscription);
        } else if (message.TransactionUpdate) {
            this.handleTransactionUpdate(message.TransactionUpdate);
        } else if (message.SubscriptionUpdate) {
            this.handleSubscriptionUpdate(message.SubscriptionUpdate);
        } else {
            console.log('[STDB] Unhandled message type:', message);
        }
    }
    
    handleIdentityToken(data) {
        // Identity may come as hex string, byte array, or object
        let identity = data.identity;
        if (typeof identity === 'object' && identity !== null) {
            // Handle SpacetimeDB identity object format: {"__identity__":"0x..."}
            if (identity.__identity__) {
                identity = identity.__identity__;
            } else if (identity.__identity_bytes) {
                identity = Array.from(identity.__identity_bytes).map(b => b.toString(16).padStart(2, '0')).join('');
            } else if (Array.isArray(identity) || identity instanceof Uint8Array) {
                identity = Array.from(identity).map(b => b.toString(16).padStart(2, '0')).join('');
            } else {
                identity = JSON.stringify(identity);
            }
        }
        
        this.identity = identity;
        this.token = data.token;
        localStorage.setItem(this.storageKeys.identity, this.identity);
        localStorage.setItem(this.storageKeys.token, this.token);
        
        // Reset reconnect attempts only after successful identity token
        if (this.reconnectAttempts > 0) {
            console.log('[STDB] Connection stable, resetting reconnect counter');
            this.reconnectAttempts = 0;
        }
        
        console.log('[STDB] Identity:', this.identity.slice(0, 20) + '...');
    }
    
    handleInitialSubscription(data) {
        console.log('[STDB] Initial subscription received:', data);
        if (data.database_update?.tables) {
            console.log('[STDB] Tables in update:', data.database_update.tables.map(t => t.table_name));
            for (const tableUpdate of data.database_update.tables) {
                this.applyTableUpdate(tableUpdate);
            }
        }
        console.log('[STDB] Cache after subscription:', {
            users: this.cache.user.size,
            players: this.cache.player.size,
            rooms: this.cache.room.size,
        });
        this.notifyRoomMembersUpdate();
    }
    
    handleTransactionUpdate(data) {
        if (data.status?.Committed) {
            const tables = data.status.Committed.tables || [];
            for (const tableUpdate of tables) {
                this.applyTableUpdate(tableUpdate);
            }
            this.notifyRoomMembersUpdate();
        }
    }
    
    handleSubscriptionUpdate(data) {
        if (data.table_updates) {
            for (const tableUpdate of data.table_updates) {
                this.applyTableUpdate(tableUpdate);
            }
        }
        this.notifyRoomMembersUpdate();
    }
    
    applyTableUpdate(tableUpdate) {
        const tableName = tableUpdate.table_name;
        const cache = this.cache[tableName];
        if (!cache) {
            console.log('[STDB] No cache for table:', tableName);
            return;
        }
        
        console.log('[STDB] Applying update to', tableName, '- inserts:', tableUpdate.inserts?.length || 0, 'deletes:', tableUpdate.deletes?.length || 0);
        
        if (tableUpdate.inserts) {
            for (const row of tableUpdate.inserts) {
                const parsed = this.parseRow(tableName, row);
                console.log('[STDB] Parsed row for', tableName, ':', parsed);
                if (parsed?.id !== undefined) cache.set(parsed.id, parsed);
            }
        }
        
        if (tableUpdate.deletes) {
            for (const row of tableUpdate.deletes) {
                const parsed = this.parseRow(tableName, row);
                if (parsed?.id !== undefined) cache.delete(parsed.id);
            }
        }
        
        // Trigger callbacks for specific tables
        if (tableName === 'player_unlocked_activity' && this.onUnlockedActivitiesUpdate) {
            this.notifyUnlockedActivitiesUpdate();
        }
    }
    
    notifyUnlockedActivitiesUpdate() {
        if (!this.onUnlockedActivitiesUpdate) return;
        
        const unlockedActivities = [];
        const newActivities = [];
        
        for (const ua of this.cache.player_unlocked_activity.values()) {
            unlockedActivities.push(ua);
            if (ua.isNew) {
                newActivities.push(ua);
            }
        }
        
        this.onUnlockedActivitiesUpdate({
            all: unlockedActivities,
            new: newActivities,
        });
    }
    
    parseRow(tableName, row) {
        if (!Array.isArray(row)) return row;
        
        switch (tableName) {
            case 'user':
                return { id: row[0], identity: row[1], username: row[2], passwordHash: row[3], role: row[4], createdAt: row[5], lastSeen: row[6] };
            case 'player':
                return { id: row[0], userId: row[1], username: row[2], xp: row[3], createdAt: row[4] };
            case 'room':
                return { id: row[0], code: row[1], name: row[2], ownerId: row[3], isOpen: row[4], createdAt: row[5] };
            case 'room_member':
                return { id: row[0], roomId: row[1], playerId: row[2], role: this.parseRole(row[3]), joinedAt: row[4] };
            case 'room_invitation':
                return { id: row[0], roomId: row[1], token: row[2], createdBy: row[3], forUsername: row[4], status: row[5], createdAt: row[6], acceptedBy: row[7] };
            case 'category':
                return { id: row[0], name: row[1], description: row[2], displayOrder: row[3] };
            case 'activity':
                return { id: row[0], categoryId: row[1], kind: this.parseKind(row[2]), name: row[3], description: row[4], instructions: row[5], videoUrl: row[6], xpRequired: row[7], xpReward: row[8] };
            case 'player_activity':
                return { id: row[0], playerId: row[1], activityId: row[2], status: this.parseActivityStatus(row[3]), completedAt: row[4], completedBy: row[5], vouched: row[6] };
            case 'player_unlocked_activity':
                return { 
                    id: row[0], 
                    playerId: row[1], 
                    activityId: row[2], 
                    activityName: row[3], 
                    activityDescription: row[4], 
                    categoryId: row[5], 
                    categoryName: row[6], 
                    kind: this.parseKind(row[7]), 
                    xpRequired: row[8], 
                    xpReward: row[9], 
                    unlockedAt: row[10], 
                    isNew: row[11] 
                };
            default:
                return row;
        }
    }
    
    parseKind(kindValue) {
        if (typeof kindValue === 'object') return Object.keys(kindValue)[0] || 'Activity';
        return kindValue || 'Activity';
    }
    
    parseActivityStatus(statusValue) {
        if (typeof statusValue === 'object') return Object.keys(statusValue)[0] || 'Available';
        return statusValue || 'Available';
    }
    
    parseRole(roleValue) {
        if (typeof roleValue === 'object') return Object.keys(roleValue)[0] || 'Observer';
        if (typeof roleValue === 'number') return ['Top', 'Bottom', 'Observer', 'Photographer'][roleValue] || 'Observer';
        return roleValue || 'Observer';
    }
    
    notifyRoomMembersUpdate() {
        if (!this.onRoomMembersUpdate) return;
        
        const members = [];
        for (const member of this.cache.room_member.values()) {
            const player = this.cache.player.get(member.playerId);
            if (player) {
                members.push({
                    playerId: member.playerId,
                    username: player.username,
                    role: member.role,
                    roomId: member.roomId,
                });
            }
        }
        this.onRoomMembersUpdate(members);
        
        // Also notify activities update
        if (this.onActivitiesUpdate) {
            this.onActivitiesUpdate();
        }
    }
    
    /**
     * Get available activities for a player based on their XP and completed prerequisites.
     * For debugging: shows all activities that the player can currently do.
     */
    getAvailableActivities(playerId, playerXp = 0) {
        const activities = [];
        
        for (const activity of this.cache.activity.values()) {
            // Check XP requirement
            if (activity.xpRequired > playerXp) continue;
            
            // Check player_activity status (if exists)
            const playerActivity = Array.from(this.cache.player_activity.values())
                .find(pa => pa.playerId === playerId && pa.activityId === activity.id);
            
            // If already completed, skip
            if (playerActivity?.status === 'Completed') continue;
            
            // Get category name
            const category = this.cache.category.get(activity.categoryId);
            
            activities.push({
                id: activity.id,
                name: activity.name,
                description: activity.description,
                kind: activity.kind,
                category: category?.name || 'Unknown',
                xpRequired: activity.xpRequired,
                xpReward: activity.xpReward,
                status: playerActivity?.status || 'Available',
            });
        }
        
        return activities;
    }
    
    /**
     * Get all activities (for debugging).
     */
    getAllActivities() {
        const activities = [];
        for (const activity of this.cache.activity.values()) {
            const category = this.cache.category.get(activity.categoryId);
            activities.push({
                id: activity.id,
                name: activity.name,
                description: activity.description,
                kind: activity.kind,
                category: category?.name || 'Unknown',
                xpRequired: activity.xpRequired,
                xpReward: activity.xpReward,
            });
        }
        return activities;
    }
    
    // =========================================================================
    // Unlocked Activities (Push-based)
    // =========================================================================
    
    /**
     * Get all unlocked activities for a player from the cache.
     * These are pushed by the server when XP changes or prerequisites are met.
     */
    getUnlockedActivities(playerId) {
        const activities = [];
        for (const ua of this.cache.player_unlocked_activity.values()) {
            if (ua.playerId === playerId) {
                activities.push(ua);
            }
        }
        return activities;
    }
    
    /**
     * Get newly unlocked activities (is_new = true) for a player.
     */
    getNewUnlockedActivities(playerId) {
        return this.getUnlockedActivities(playerId).filter(ua => ua.isNew);
    }
    
    /**
     * Initialize unlocked activities for a player.
     * Call this after creating a player or logging in to populate their available activities.
     */
    async initializeUnlockedActivities(playerId) {
        const result = await this.callReducer('initialize_unlocked_activities', [playerId]);
        if (!result.ok) {
            console.error('[STDB] Failed to initialize unlocked activities:', result.error);
        }
        return result;
    }
    
    /**
     * Acknowledge new activities (marks them as seen by the user).
     */
    async acknowledgeNewActivities(playerId) {
        const result = await this.callReducer('acknowledge_new_activities', [playerId]);
        if (!result.ok) {
            console.error('[STDB] Failed to acknowledge new activities:', result.error);
        }
        return result;
    }
    
    /**
     * Award XP to a player (triggers refresh of unlocked activities).
     */
    async awardXp(playerId, xpAmount) {
        const result = await this.callReducer('award_xp', [playerId, xpAmount]);
        if (!result.ok) {
            console.error('[STDB] Failed to award XP:', result.error);
        }
        return result;
    }
    
    /**
     * Query unlocked activities directly from the database (bypasses cache).
     * Use this when the cache may not be populated yet.
     */
    async queryUnlockedActivities(playerId) {
        try {
            const query = `SELECT * FROM player_unlocked_activity WHERE player_id = ${playerId}`;
            const response = await fetch(`${this.baseUrl}/sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: query,
            });
            
            if (!response.ok) {
                console.error('[STDB] Failed to query unlocked activities');
                return [];
            }
            
            const data = await response.json();
            const rows = data?.[0]?.rows || [];
            
            // Parse rows into activity objects
            return rows.map(row => ({
                id: row[0],
                playerId: row[1],
                activityId: row[2],
                activityName: row[3],
                activityDescription: row[4],
                categoryId: row[5],
                categoryName: row[6],
                kind: Array.isArray(row[7]) ? (row[7][0] === 0 ? 'Skill' : 'Activity') : row[7],
                xpRequired: row[8],
                xpReward: row[9],
                unlockedAt: row[10],
                isNew: row[11],
            }));
        } catch (error) {
            console.error('[STDB] Error querying unlocked activities:', error);
            return [];
        }
    }
    
    // =========================================================================
    // HTTP API
    // =========================================================================
    
    async callReducer(reducerName, args = []) {
        const url = `${this.baseUrl}/call/${reducerName}`;
        // Ensure args is an array (SpacetimeDB HTTP API expects array format)
        const argsArray = Array.isArray(args) ? args : Object.values(args);
        console.log('[STDB] Calling reducer:', reducerName, argsArray);
        
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (this.identity) headers['spacetime-identity'] = this.identity;
        
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(argsArray),
        });
        
        // Update identity from response
        const newIdentity = response.headers.get('spacetime-identity');
        const newToken = response.headers.get('spacetime-identity-token');
        if (newIdentity) {
            this.identity = newIdentity;
            localStorage.setItem(this.storageKeys.identity, newIdentity);
        }
        if (newToken) {
            this.token = newToken;
            localStorage.setItem(this.storageKeys.token, newToken);
        }
        
        const text = await response.text();
        if (!response.ok) {
            const errorMsg = text || `Reducer ${reducerName} failed`;
            console.error('[STDB] Reducer error:', reducerName, errorMsg);
            return { ok: false, error: errorMsg };
        }
        
        return { ok: true, data: text ? JSON.parse(text) : null };
    }
    
    async sql(query) {
        const url = `${this.baseUrl}/sql`;
        const headers = { 'Content-Type': 'text/plain' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (this.identity) headers['spacetime-identity'] = this.identity;
        
        const response = await fetch(url, { method: 'POST', headers, body: query });
        if (!response.ok) throw new Error(await response.text() || 'SQL query failed');
        
        const results = await response.json();
        return this.parseQueryResults(results);
    }
    
    parseQueryResults(results) {
        if (!results?.length) return [];
        const { schema, rows } = results[0];
        return rows.map(row => {
            const obj = {};
            schema.elements.forEach((field, i) => {
                const name = field.name.some || `field_${i}`;
                let value = row[i];
                if (Array.isArray(value) && value.length === 1) value = value[0];
                obj[name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
            });
            return obj;
        });
    }
    
    // =========================================================================
    // Authentication Methods (New User + Player model)
    // =========================================================================
    
    async registerUser(username, password) {
        const result = await this.callReducer('register_user', [username, password]);
        if (!result.ok) return result;
        console.log('[STDB] User registered:', username);
        return result;
    }
    
    async loginUser(username, password) {
        const result = await this.callReducer('login_user', [username, password]);
        if (!result.ok) return result;
        console.log('[STDB] User logged in:', username);
        return result;
    }
    
    async logoutUser() {
        const result = await this.callReducer('logout_user', []);
        if (!result.ok) {
            console.warn('[STDB] Logout failed (user may not be logged in):', result.error);
        } else {
            console.log('[STDB] User logged out');
        }
        
        // Clear local storage regardless of server response
        localStorage.removeItem(this.storageKeys.identity);
        localStorage.removeItem(this.storageKeys.token);
        this.identity = null;
        this.token = null;
        
        // Clear cache
        for (const cache of Object.values(this.cache)) {
            cache.clear();
        }
        return result;
    }
    
    async createPlayer(playerName) {
        const result = await this.callReducer('create_player', [playerName]);
        if (!result.ok) return result;
        console.log('[STDB] Player created:', playerName);
        return result;
    }
    
    async getPlayersForUser() {
        // Query the API to get the current user and their players
        if (!this.identity) {
            console.log('[STDB] No identity, cannot get players');
            return [];
        }
        
        try {
            console.log('[STDB] Getting players for identity:', this.identity);
            
            // First get the current user by identity - try different formats
            let identityHex = this.identity.replace('0x', '');
            let query = `SELECT id, username FROM user WHERE identity = X'${identityHex}'`;
            console.log('[STDB] User query:', query);
            
            let users = await this.sql(query);
            console.log('[STDB] Users found:', users);
            
            if (users.length === 0) {
                // Try querying all users to debug
                const allUsers = await this.sql('SELECT id, username, identity FROM user');
                console.log('[STDB] All users in DB:', allUsers);
                return [];
            }
            
            const userId = users[0].id;
            
            // Get all players for this user
            const players = await this.sql(`SELECT id, user_id, username, xp, created_at FROM player WHERE user_id = ${userId}`);
            console.log('[STDB] Players found:', players);
            
            // Update cache with these players
            for (const player of players) {
                this.cache.player.set(player.id, player);
            }
            
            return players;
        } catch (error) {
            console.error('[STDB] Failed to get players:', error);
            return [];
        }
    }
    
    // =========================================================================
    // Room Methods (Now require player_id)
    // =========================================================================
    
    async createRoom(playerId, roomName, role) {
        const result = await this.callReducer('create_room', [playerId, roomName || '', { [role]: {} }]);
        if (!result.ok) return result;
        
        // Query API for the room we just created
        const rooms = await this.sql(`SELECT id, code, name, owner_id, is_open, created_at FROM room WHERE owner_id = ${playerId} AND is_open = true`);
        const room = rooms.length > 0 ? rooms[0] : null;
        console.log('[STDB] Created room:', room);
        
        const members = room ? await this.queryRoomMembers(room.id) : [];
        return { ok: true, room, members };
    }
    
    async joinRoom(playerId, roomCode, role) {
        const result = await this.callReducer('join_room', [playerId, roomCode, { [role]: {} }]);
        if (!result.ok) return result;
        
        // Query API for the room we just joined
        const rooms = await this.sql(`SELECT id, code, name, owner_id, is_open, created_at FROM room WHERE code = '${roomCode}'`);
        const room = rooms.length > 0 ? rooms[0] : null;
        console.log('[STDB] Joined room:', room);
        
        const members = room ? await this.queryRoomMembers(room.id) : [];
        return { ok: true, room, members };
    }
    
    async acceptInvitation(playerId, invitationToken, role) {
        const result = await this.callReducer('accept_invitation', [playerId, invitationToken, { [role]: {} }]);
        if (!result.ok) return result;
        
        // Query API for the invitation to get room_id
        const invitations = await this.sql(`SELECT room_id FROM room_invitation WHERE token = '${invitationToken}'`);
        if (invitations.length === 0) {
            return { ok: true, room: null, members: [] };
        }
        
        const roomId = invitations[0].roomId;
        const rooms = await this.sql(`SELECT id, code, name, owner_id, is_open, created_at FROM room WHERE id = ${roomId}`);
        const room = rooms.length > 0 ? rooms[0] : null;
        console.log('[STDB] Accepted invitation, room:', room);
        
        const members = room ? await this.queryRoomMembers(room.id) : [];
        return { ok: true, room, members };
    }
    
    async queryRoomMembers(roomId) {
        const members = await this.sql(`
            SELECT rm.id, rm.room_id, rm.player_id, rm.role, rm.joined_at, p.username 
            FROM room_member rm 
            JOIN player p ON rm.player_id = p.id 
            WHERE rm.room_id = ${roomId}
        `);
        return members.map(m => ({
            playerId: m.playerId,
            username: m.username,
            role: this.parseRole(m.role),
            roomId: m.roomId,
        }));
    }
    
    async leaveRoom(playerId, roomId) {
        return await this.callReducer('leave_room', [playerId, roomId]);
    }
    
    async changeRole(playerId, roomId, role) {
        return await this.callReducer('change_role', [playerId, roomId, { [role]: {} }]);
    }
    
    async createRoomInvitation(playerId, roomId, forUsername = null) {
        return await this.callReducer('create_room_invitation', [playerId, roomId, forUsername]);
    }
    
    async closeRoom(playerId, roomId) {
        return await this.callReducer('close_room', [playerId, roomId]);
    }
    
    async getRoomMembers(roomId) {
        // Use API query instead of cache
        return this.queryRoomMembers(roomId);
    }
}
