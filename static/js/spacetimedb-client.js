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
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // Client cache - mirrors subscribed tables
        this.cache = {
            user: new Map(),
            player: new Map(),
            room: new Map(),
            room_member: new Map(),
            room_invitation: new Map(),
        };
        
        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
        this.onRoomMembersUpdate = null;
        
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
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[STDB] Max reconnect attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[STDB] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => this.connect().catch(console.error), delay);
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
        
        const message = {
            Subscribe: {
                query_strings: queries,
                request_id: Date.now(),
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
        
        if (message.IdentityToken) {
            this.handleIdentityToken(message.IdentityToken);
        } else if (message.InitialSubscription) {
            this.handleInitialSubscription(message.InitialSubscription);
        } else if (message.TransactionUpdate) {
            this.handleTransactionUpdate(message.TransactionUpdate);
        } else if (message.SubscriptionUpdate) {
            this.handleSubscriptionUpdate(message.SubscriptionUpdate);
        }
    }
    
    handleIdentityToken(data) {
        this.identity = data.identity;
        this.token = data.token;
        localStorage.setItem(this.storageKeys.identity, this.identity);
        localStorage.setItem(this.storageKeys.token, this.token);
        console.log('[STDB] Identity:', this.identity?.slice(0, 20) + '...');
    }
    
    handleInitialSubscription(data) {
        console.log('[STDB] Initial subscription received');
        if (data.database_update?.tables) {
            for (const tableUpdate of data.database_update.tables) {
                this.applyTableUpdate(tableUpdate);
            }
        }
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
        if (!cache) return;
        
        if (tableUpdate.inserts) {
            for (const row of tableUpdate.inserts) {
                const parsed = this.parseRow(tableName, row);
                if (parsed?.id !== undefined) cache.set(parsed.id, parsed);
            }
        }
        
        if (tableUpdate.deletes) {
            for (const row of tableUpdate.deletes) {
                const parsed = this.parseRow(tableName, row);
                if (parsed?.id !== undefined) cache.delete(parsed.id);
            }
        }
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
            default:
                return row;
        }
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
    }
    
    // =========================================================================
    // HTTP API
    // =========================================================================
    
    async callReducer(reducerName, args = {}) {
        const url = `${this.baseUrl}/call/${reducerName}`;
        console.log('[STDB] Calling reducer:', reducerName, args);
        
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (this.identity) headers['spacetime-identity'] = this.identity;
        
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(args),
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
        if (!response.ok) throw new Error(text || `Reducer ${reducerName} failed`);
        
        return text ? JSON.parse(text) : null;
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
        await this.callReducer('register_user', { username, password });
        console.log('[STDB] User registered:', username);
    }
    
    async loginUser(username, password) {
        await this.callReducer('login_user', { username, password });
        console.log('[STDB] User logged in:', username);
    }
    
    async logoutUser() {
        try {
            await this.callReducer('logout_user', {});
            console.log('[STDB] User logged out');
        } catch (error) {
            console.warn('[STDB] Logout failed (user may not be logged in):', error.message);
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
    }
    
    async createPlayer(playerName) {
        await this.callReducer('create_player', { player_name: playerName });
        console.log('[STDB] Player created:', playerName);
    }
    
    async getPlayersForUser() {
        // Get players from cache that belong to current user
        const players = [];
        for (const player of this.cache.player.values()) {
            players.push(player);
        }
        return players;
    }
    
    // =========================================================================
    // Room Methods (Now require player_id)
    // =========================================================================
    
    async createRoom(playerId, roomName, role) {
        await this.callReducer('create_room', {
            player_id: playerId,
            room_name: roomName || '',
            role: { [role]: {} }
        });
        
        // Get room from cache
        let room = null;
        for (const r of this.cache.room.values()) {
            if (r.ownerId === playerId && r.isOpen) {
                room = r;
                break;
            }
        }
        
        const members = room ? await this.getRoomMembers(room.id) : [];
        return { room, members };
    }
    
    async joinRoom(playerId, roomCode, role) {
        await this.callReducer('join_room', {
            player_id: playerId,
            room_code: roomCode,
            role: { [role]: {} }
        });
        
        // Get room from cache
        let room = null;
        for (const r of this.cache.room.values()) {
            if (r.code === roomCode) {
                room = r;
                break;
            }
        }
        
        const members = room ? await this.getRoomMembers(room.id) : [];
        return { room, members };
    }
    
    async acceptInvitation(playerId, invitationToken, role) {
        await this.callReducer('accept_invitation', {
            player_id: playerId,
            invitation_token: invitationToken,
            role: { [role]: {} }
        });
        
        // Find room from invitation
        let roomId = null;
        for (const inv of this.cache.room_invitation.values()) {
            if (inv.token === invitationToken) {
                roomId = inv.roomId;
                break;
            }
        }
        
        let room = roomId ? this.cache.room.get(roomId) : null;
        const members = room ? await this.getRoomMembers(room.id) : [];
        return { room, members };
    }
    
    async leaveRoom(playerId) {
        await this.callReducer('leave_room', { player_id: playerId });
    }
    
    async createRoomInvitation(playerId, forUsername = null) {
        await this.callReducer('create_room_invitation', {
            player_id: playerId,
            for_username: forUsername
        });
    }
    
    async closeRoom(playerId) {
        await this.callReducer('close_room', { player_id: playerId });
    }
    
    async getRoomMembers(roomId) {
        const members = [];
        for (const member of this.cache.room_member.values()) {
            if (member.roomId === roomId) {
                const player = this.cache.player.get(member.playerId);
                if (player) {
                    members.push({
                        playerId: member.playerId,
                        username: player.username,
                        role: member.role,
                    });
                }
            }
        }
        return members;
    }
}
