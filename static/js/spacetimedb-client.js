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
            room_activity: new Map(),
            activity_participant: new Map(),
            player_not_wanted_activity: new Map(),
            user_category_preference: new Map(),
            player_category_preference: new Map(),
        };
        
        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
        this.onRoomMembersUpdate = null;
        this.onActivitiesUpdate = null;
        this.onUnlockedActivitiesUpdate = null;
        this.onRoomActivityUpdate = null;
        this.onRoomAvailableActivitiesUpdate = null;  // Called when room-compatible activities change
        this.onPreferencesUpdate = null;
        this.onCategoriesLoaded = null;
        
        // Categories loading state - prioritized for early availability
        this.categoriesLoaded = false;
        
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
        
        // Reset intentional disconnect flag when connecting
        this.intentionalDisconnect = false;
        
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
                    
                    // Phase 1: Subscribe to categories FIRST for early availability
                    // Categories are needed immediately for the preferences UI
                    console.log('[STDB] Phase 1: Subscribing to categories...');
                    this.sendSubscription([
                        "SELECT * FROM category",
                    ]);
                    
                    // Phase 2: Subscribe to all other tables
                    // These load in parallel but categories should arrive first
                    console.log('[STDB] Phase 2: Subscribing to remaining tables...');
                    this.sendSubscription([
                        "SELECT * FROM user",
                        "SELECT * FROM player",
                        "SELECT * FROM room",
                        "SELECT * FROM room_member",
                        "SELECT * FROM room_invitation",
                        "SELECT * FROM activity",
                        "SELECT * FROM player_activity",
                        "SELECT * FROM player_unlocked_activity",
                        "SELECT * FROM room_activity",
                        "SELECT * FROM activity_participant",
                        "SELECT * FROM player_not_wanted_activity",
                        "SELECT * FROM user_category_preference",
                        "SELECT * FROM player_category_preference",
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
        
        // Don't reconnect if intentionally disconnected
        if (this.intentionalDisconnect) {
            console.log('[STDB] Skipping reconnect - intentional disconnect');
            return;
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
        
        this.reconnectTimeoutId = setTimeout(() => {
            this.isReconnecting = false; // Allow next attempt after timeout
            
            // Check again in case disconnect was called during timeout
            if (this.intentionalDisconnect) {
                console.log('[STDB] Reconnect cancelled - intentional disconnect');
                return;
            }
            
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
    
    /**
     * Disconnect the WebSocket and stop all reconnection attempts.
     * Call this when the user logs out.
     */
    disconnect() {
        console.log('[STDB] Disconnecting WebSocket...');
        
        // Mark as intentional disconnect to prevent auto-reconnect
        this.intentionalDisconnect = true;
        this.isReconnecting = false;
        
        // Clear any pending reconnection timeout
        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Reset reconnection state
        this.reconnectAttempts = 0;
        
        console.log('[STDB] Disconnected successfully');
        if (this.onDisconnect) this.onDisconnect();
    }
    
    /**
     * Check if WebSocket is connected and ready.
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * Wait for WebSocket connection to be ready.
     */
    async waitForConnection(timeoutMs = 5000) {
        if (this.isConnected()) return true;
        
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (this.isConnected()) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
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
        
        // Handle both old format (inserts/deletes at top level) and new format (nested in updates array)
        let inserts = tableUpdate.inserts || [];
        let deletes = tableUpdate.deletes || [];
        
        // New SpacetimeDB format: data is nested in updates[].inserts/deletes
        if (tableUpdate.updates && Array.isArray(tableUpdate.updates)) {
            for (const update of tableUpdate.updates) {
                if (update.inserts) inserts = inserts.concat(update.inserts);
                if (update.deletes) deletes = deletes.concat(update.deletes);
            }
        }
        
        console.log('[STDB] Applying update to', tableName, '- inserts:', inserts.length, 'deletes:', deletes.length);
        
        // Process deletes FIRST, then inserts (important for updates which are delete+insert pairs)
        for (const row of deletes) {
            const parsed = this.parseRow(tableName, row);
            if (parsed?.id !== undefined) cache.delete(parsed.id);
        }
        
        for (const row of inserts) {
            const parsed = this.parseRow(tableName, row);
            if (parsed?.id !== undefined) {
                cache.set(parsed.id, parsed);
            } else {
                console.log('[STDB] Failed to parse row for', tableName, '- id is undefined, parsed:', parsed);
            }
        }
        
        // Trigger callbacks for specific tables
        if (tableName === 'category') {
            // Categories loaded - notify immediately for preferences UI
            if (!this.categoriesLoaded && this.cache.category.size > 0) {
                this.categoriesLoaded = true;
                console.log(`[STDB] Categories loaded: ${this.cache.category.size} categories available`);
                if (this.onCategoriesLoaded) {
                    this.onCategoriesLoaded(Array.from(this.cache.category.values()));
                }
            }
        }
        if (tableName === 'player_unlocked_activity') {
            if (this.onUnlockedActivitiesUpdate) {
                this.notifyUnlockedActivitiesUpdate();
            }
            // Also update room available activities
            this.notifyRoomAvailableActivitiesUpdate();
        }
        if (tableName === 'player_not_wanted_activity') {
            // Update room available activities when "not wanted" changes
            this.notifyRoomAvailableActivitiesUpdate();
        }
        if ((tableName === 'room_activity' || tableName === 'activity_participant') && this.onRoomActivityUpdate) {
            this.notifyRoomActivityUpdate();
        }
        if ((tableName === 'user_category_preference' || tableName === 'player_category_preference')) {
            if (this.onPreferencesUpdate) {
                this.notifyPreferencesUpdate();
            }
            // notifyPreferencesUpdate already updates room available activities
        }
    }
    
    /**
     * Notify all rooms about their available activities.
     */
    notifyRoomAvailableActivitiesUpdate() {
        if (!this.onRoomAvailableActivitiesUpdate) return;
        
        const roomIds = new Set();
        for (const member of this.cache.room_member.values()) {
            roomIds.add(member.roomId);
        }
        for (const roomId of roomIds) {
            const activities = this.getRoomAvailableActivities(roomId);
            this.onRoomAvailableActivitiesUpdate(roomId, activities);
        }
    }
    
    notifyPreferencesUpdate() {
        // Get current user's preferences
        const user = this.getCurrentUser();
        const userPrefs = user ? this.getUserCategoryPreferences(user.id) : [];
        
        if (this.onPreferencesUpdate) {
            this.onPreferencesUpdate({
                userPreferences: userPrefs,
                // Player preferences will be looked up by the app as needed
            });
        }
        
        // Also update room available activities since preferences affect them
        this.notifyRoomAvailableActivitiesUpdate();
    }
    
    notifyRoomActivityUpdate() {
        if (!this.onRoomActivityUpdate) return;
        
        // Find active room activities (Viewing or InProgress)
        const activeActivities = [];
        for (const ra of this.cache.room_activity.values()) {
            if (ra.status === 'Viewing' || ra.status === 'InProgress') {
                // Get activity details
                const activity = this.cache.activity.get(ra.activityId);
                const category = activity ? this.cache.category.get(activity.categoryId) : null;
                
                // Get participants
                const participants = [];
                for (const ap of this.cache.activity_participant.values()) {
                    if (ap.roomActivityId === ra.id) {
                        const player = this.cache.player.get(ap.playerId);
                        participants.push({
                            ...ap,
                            username: player?.username || 'Unknown',
                        });
                    }
                }
                
                activeActivities.push({
                    ...ra,
                    activity,
                    categoryName: category?.name || 'Unknown',
                    participants,
                });
            }
        }
        
        this.onRoomActivityUpdate(activeActivities);
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
        // First, parse JSON string if needed (SpacetimeDB sends stringified data)
        if (typeof row === 'string') {
            try {
                row = JSON.parse(row);
            } catch (e) {
                console.log('[STDB] Failed to parse row string:', e);
                return null;
            }
        }
        
        // Helper to unwrap nested arrays and special SpacetimeDB types
        const unwrap = (val) => {
            if (val === null || val === undefined) return val;
            // Unwrap SpacetimeDB Option format: [0, value] = Some(value), [1, {}] = None
            if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number') {
                if (val[0] === 0) return val[1];  // Some(value)
                if (val[0] === 1) return null;     // None
            }
            // Unwrap single-element arrays (e.g., timestamps, identities in array format)
            if (Array.isArray(val) && val.length === 1) return val[0];
            // Unwrap SpacetimeDB identity objects
            if (val && typeof val === 'object' && val.__identity__) return val.__identity__;
            // Unwrap SpacetimeDB timestamp objects
            if (val && typeof val === 'object' && val.__timestamp_micros_since_unix_epoch__ !== undefined) {
                return val.__timestamp_micros_since_unix_epoch__;
            }
            return val;
        };
        
        // Handle object format (from InitialSubscription) - convert snake_case to camelCase
        if (row && typeof row === 'object' && !Array.isArray(row)) {
            switch (tableName) {
                case 'user':
                    return { 
                        id: row.id, 
                        identity: unwrap(row.identity), 
                        username: row.username, 
                        passwordHash: row.password_hash, 
                        role: row.role, 
                        createdAt: unwrap(row.created_at), 
                        lastSeen: unwrap(row.last_seen) 
                    };
                case 'player':
                    return { id: row.id, userId: row.user_id, username: row.username, xp: row.xp, createdAt: unwrap(row.created_at) };
                case 'room':
                    return { id: row.id, code: row.code, name: row.name, ownerId: row.owner_id, isOpen: row.is_open, createdAt: unwrap(row.created_at) };
                case 'room_member':
                    return { id: row.id, roomId: row.room_id, playerId: row.player_id, role: this.parseRole(row.role), joinedAt: unwrap(row.joined_at) };
                case 'room_invitation':
                    return { id: row.id, roomId: row.room_id, token: row.token, createdBy: row.created_by, forUsername: row.for_username, status: row.status, createdAt: unwrap(row.created_at), acceptedBy: row.accepted_by };
                case 'category':
                    return { id: row.id, name: row.name, description: row.description, displayOrder: row.display_order };
                case 'activity':
                    return { id: row.id, categoryId: row.category_id, kind: this.parseKind(row.kind), name: row.name, description: row.description, instructions: row.instructions, videoUrl: unwrap(row.video_url), xpRequired: row.xp_required, xpReward: row.xp_reward };
                case 'player_activity':
                    return { id: row.id, playerId: row.player_id, activityId: row.activity_id, status: this.parseActivityStatus(row.status), completedAt: unwrap(row.completed_at), completedBy: row.completed_by, vouched: row.vouched, rating: row.rating };
                case 'player_unlocked_activity':
                    return { id: row.id, playerId: row.player_id, activityId: row.activity_id, activityName: row.activity_name, activityDescription: row.activity_description, categoryId: row.category_id, categoryName: row.category_name, kind: this.parseKind(row.kind), xpRequired: row.xp_required, xpReward: row.xp_reward, unlockedAt: unwrap(row.unlocked_at), isNew: row.is_new };
                case 'room_activity':
                    return { id: row.id, roomId: row.room_id, activityId: row.activity_id, status: this.parseRoomActivityStatus(row.status), startedBy: row.started_by, createdAt: unwrap(row.created_at), startedAt: unwrap(row.started_at), completedAt: unwrap(row.completed_at) };
                case 'activity_participant':
                    return { id: row.id, roomActivityId: row.room_activity_id, playerId: row.player_id, role: this.parseRole(row.role), xpEarned: row.xp_earned, completed: row.completed };
                case 'player_not_wanted_activity':
                    return { id: row.id, playerId: row.player_id, activityId: row.activity_id, createdAt: unwrap(row.created_at) };
                case 'user_category_preference':
                    return { id: row.id, userId: row.user_id, categoryId: row.category_id };
                case 'player_category_preference':
                    return { id: row.id, playerId: row.player_id, categoryId: row.category_id };
                default:
                    return row;
            }
        }
        
        // Handle array format (from TransactionUpdate) - convert array-like objects to real arrays
        if (!Array.isArray(row)) {
            if (row && typeof row === 'object' && row.length !== undefined) {
                row = Array.from(row);
            } else {
                return row;
            }
        }
        
        switch (tableName) {
            case 'user':
                return { 
                    id: unwrap(row[0]), 
                    identity: unwrap(row[1]),  // Identity comes as ["0x..."]
                    username: unwrap(row[2]), 
                    passwordHash: unwrap(row[3]), 
                    role: row[4],  // Keep role as-is (enum format)
                    createdAt: unwrap(row[5]),  // Timestamp comes as [number]
                    lastSeen: unwrap(row[6]) 
                };
            case 'player':
                return { id: unwrap(row[0]), userId: unwrap(row[1]), username: unwrap(row[2]), xp: unwrap(row[3]), createdAt: unwrap(row[4]) };
            case 'room':
                return { id: unwrap(row[0]), code: unwrap(row[1]), name: unwrap(row[2]), ownerId: unwrap(row[3]), isOpen: unwrap(row[4]), createdAt: unwrap(row[5]) };
            case 'room_member':
                return { id: unwrap(row[0]), roomId: unwrap(row[1]), playerId: unwrap(row[2]), role: this.parseRole(row[3]), joinedAt: unwrap(row[4]) };
            case 'room_invitation':
                return { id: unwrap(row[0]), roomId: unwrap(row[1]), token: unwrap(row[2]), createdBy: unwrap(row[3]), forUsername: unwrap(row[4]), status: row[5], createdAt: unwrap(row[6]), acceptedBy: unwrap(row[7]) };
            case 'category':
                return { id: unwrap(row[0]), name: unwrap(row[1]), description: unwrap(row[2]), displayOrder: unwrap(row[3]) };
            case 'activity':
                return { id: unwrap(row[0]), categoryId: unwrap(row[1]), kind: this.parseKind(row[2]), name: unwrap(row[3]), description: unwrap(row[4]), instructions: unwrap(row[5]), videoUrl: unwrap(row[6]), xpRequired: unwrap(row[7]), xpReward: unwrap(row[8]) };
            case 'player_activity':
                return { id: unwrap(row[0]), playerId: unwrap(row[1]), activityId: unwrap(row[2]), status: this.parseActivityStatus(row[3]), completedAt: unwrap(row[4]), completedBy: unwrap(row[5]), vouched: unwrap(row[6]), rating: unwrap(row[7]) };
            case 'player_unlocked_activity':
                return { 
                    id: unwrap(row[0]), 
                    playerId: unwrap(row[1]), 
                    activityId: unwrap(row[2]), 
                    activityName: unwrap(row[3]), 
                    activityDescription: unwrap(row[4]), 
                    categoryId: unwrap(row[5]), 
                    categoryName: unwrap(row[6]), 
                    kind: this.parseKind(row[7]), 
                    xpRequired: unwrap(row[8]), 
                    xpReward: unwrap(row[9]), 
                    unlockedAt: unwrap(row[10]), 
                    isNew: unwrap(row[11]) 
                };
            case 'room_activity':
                return {
                    id: unwrap(row[0]),
                    roomId: unwrap(row[1]),
                    activityId: unwrap(row[2]),
                    status: this.parseRoomActivityStatus(row[3]),
                    startedBy: unwrap(row[4]),
                    createdAt: unwrap(row[5]),
                    startedAt: unwrap(row[6]),
                    completedAt: unwrap(row[7]),
                };
            case 'activity_participant':
                return {
                    id: unwrap(row[0]),
                    roomActivityId: unwrap(row[1]),
                    playerId: unwrap(row[2]),
                    role: this.parseRole(row[3]),
                    xpEarned: unwrap(row[4]),
                    completed: unwrap(row[5]),
                };
            case 'player_not_wanted_activity':
                return {
                    id: unwrap(row[0]),
                    playerId: unwrap(row[1]),
                    activityId: unwrap(row[2]),
                    createdAt: unwrap(row[3]),
                };
            case 'user_category_preference':
                return {
                    id: unwrap(row[0]),
                    userId: unwrap(row[1]),
                    categoryId: unwrap(row[2]),
                };
            case 'player_category_preference':
                return {
                    id: unwrap(row[0]),
                    playerId: unwrap(row[1]),
                    categoryId: unwrap(row[2]),
                };
            default:
                return row;
        }
    }
    
    parseKind(kindValue) {
        // Handle array format [enum_index, {}] from SpacetimeDB
        if (Array.isArray(kindValue)) {
            const index = kindValue[0];
            if (typeof index === 'number') {
                return ['Skill', 'Activity'][index] || 'Activity';
            }
            return 'Activity';
        }
        if (typeof kindValue === 'object' && kindValue !== null) return Object.keys(kindValue)[0] || 'Activity';
        return kindValue || 'Activity';
    }
    
    parseActivityStatus(statusValue) {
        // Handle array format [enum_index, {}] from SpacetimeDB
        if (Array.isArray(statusValue)) {
            const index = statusValue[0];
            if (typeof index === 'number') {
                return ['Locked', 'Available', 'Completed'][index] || 'Available';
            }
            return 'Available';
        }
        if (typeof statusValue === 'object' && statusValue !== null) return Object.keys(statusValue)[0] || 'Available';
        return statusValue || 'Available';
    }
    
    parseRoomActivityStatus(statusValue) {
        // Handle array format [enum_index, {}] from SpacetimeDB
        if (Array.isArray(statusValue)) {
            const index = statusValue[0];
            if (typeof index === 'number') {
                return ['Viewing', 'InProgress', 'Completed', 'Cancelled'][index] || 'Viewing';
            }
            return 'Viewing';
        }
        if (typeof statusValue === 'object' && statusValue !== null) return Object.keys(statusValue)[0] || 'Viewing';
        return statusValue || 'Viewing';
    }
    
    parseRole(roleValue) {
        // Handle array format [enum_index, {}] from SpacetimeDB
        if (Array.isArray(roleValue)) {
            const index = roleValue[0];
            if (typeof index === 'number') {
                return ['Top', 'Bottom', 'Observer', 'Photographer'][index] || 'Observer';
            }
            return 'Observer';
        }
        if (typeof roleValue === 'object' && roleValue !== null) return Object.keys(roleValue)[0] || 'Observer';
        if (typeof roleValue === 'number') return ['Top', 'Bottom', 'Observer', 'Photographer'][roleValue] || 'Observer';
        return roleValue || 'Observer';
    }
    
    notifyRoomMembersUpdate() {
        const members = [];
        const roomIds = new Set();
        
        for (const member of this.cache.room_member.values()) {
            const player = this.cache.player.get(member.playerId);
            if (player) {
                members.push({
                    playerId: member.playerId,
                    username: player.username,
                    xp: player.xp,
                    role: member.role,
                    roomId: member.roomId,
                });
                roomIds.add(member.roomId);
            }
        }
        
        if (this.onRoomMembersUpdate) {
            this.onRoomMembersUpdate(members);
        }
        
        // Notify room available activities update for each room
        if (this.onRoomAvailableActivitiesUpdate) {
            for (const roomId of roomIds) {
                const activities = this.getRoomAvailableActivities(roomId);
                this.onRoomAvailableActivitiesUpdate(roomId, activities);
            }
        }
        
        // Also notify activities update (for debug panel)
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
    
    /**
     * Get activities available for ALL players in a room.
     * This is the intersection of unlocked activities filtered by:
     * - Category preferences (must be in ALL members' preferences)
     * - Not wanted (excluded if ANY member marked it as not wanted)
     * 
     * @param {number} roomId - The room ID
     * @returns {Array} Activities available to all room members
     */
    getRoomAvailableActivities(roomId) {
        // Get all room members
        const roomMembers = [];
        for (const member of this.cache.room_member.values()) {
            if (member.roomId === roomId) {
                roomMembers.push(member);
            }
        }
        
        if (roomMembers.length === 0) {
            console.log('[STDB] No room members found for room:', roomId);
            return [];
        }
        
        console.log('[STDB] Calculating room activities for', roomMembers.length, 'members');
        
        // Get category preferences for each member (intersection)
        let allowedCategories = null;
        for (const member of roomMembers) {
            const memberCategories = new Set();
            for (const pref of this.cache.player_category_preference.values()) {
                if (pref.playerId === member.playerId) {
                    memberCategories.add(pref.categoryId);
                }
            }
            
            if (allowedCategories === null) {
                allowedCategories = memberCategories;
            } else {
                // Intersect: keep only categories that are in both sets
                allowedCategories = new Set(
                    [...allowedCategories].filter(catId => memberCategories.has(catId))
                );
            }
        }
        
        console.log('[STDB] Allowed categories (intersection):', allowedCategories?.size || 0);
        
        // Get unlocked activities for each member (intersection)
        let unlockedActivityIds = null;
        for (const member of roomMembers) {
            const memberUnlocked = new Set();
            for (const ua of this.cache.player_unlocked_activity.values()) {
                if (ua.playerId === member.playerId) {
                    memberUnlocked.add(ua.activityId);
                }
            }
            
            if (unlockedActivityIds === null) {
                unlockedActivityIds = memberUnlocked;
            } else {
                // Intersect: keep only activities unlocked by ALL members
                unlockedActivityIds = new Set(
                    [...unlockedActivityIds].filter(actId => memberUnlocked.has(actId))
                );
            }
        }
        
        console.log('[STDB] Unlocked activities (intersection):', unlockedActivityIds?.size || 0);
        
        // Get "not wanted" activities for any member (union - exclude if ANY member doesn't want it)
        const notWantedActivityIds = new Set();
        for (const member of roomMembers) {
            for (const nw of this.cache.player_not_wanted_activity.values()) {
                if (nw.playerId === member.playerId) {
                    notWantedActivityIds.add(nw.activityId);
                }
            }
        }
        
        console.log('[STDB] Not wanted activities (union):', notWantedActivityIds.size);
        
        // Build the final list
        const activities = [];
        for (const activityId of (unlockedActivityIds || [])) {
            // Skip if not wanted by any member
            if (notWantedActivityIds.has(activityId)) continue;
            
            const activity = this.cache.activity.get(activityId);
            if (!activity) continue;
            
            // Skip if category not in allowed categories
            if (allowedCategories && !allowedCategories.has(activity.categoryId)) continue;
            
            const category = this.cache.category.get(activity.categoryId);
            
            activities.push({
                id: activity.id,
                name: activity.name,
                description: activity.description,
                instructions: activity.instructions,
                kind: activity.kind,
                category: category?.name || 'Unknown',
                categoryId: activity.categoryId,
                xpRequired: activity.xpRequired,
                xpReward: activity.xpReward,
            });
        }
        
        console.log('[STDB] Room available activities:', activities.length);
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
     * Get unlocked activities for a player from the subscription cache.
     * The cache is populated via WebSocket subscriptions.
     */
    getUnlockedActivitiesFromCache(playerId) {
        const unlocked = [];
        for (const activity of this.cache.player_unlocked_activity.values()) {
            if (activity.playerId === playerId) {
                unlocked.push(activity);
            }
        }
        return unlocked;
    }
    
    /**
     * Wait for cache to contain data matching a condition, with timeout.
     * Returns true if condition was met, false on timeout.
     */
    async waitForCache(cacheKey, predicate, timeoutMs = 2000, intervalMs = 50) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const cache = this.cache[cacheKey];
            if (cache && cache.size > 0) {
                for (const item of cache.values()) {
                    if (predicate(item)) {
                        return true;
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
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
    
    // =========================================================================
    // Cache Lookup Helpers
    // =========================================================================
    
    /**
     * Get user from cache by identity.
     */
    getUserFromCache() {
        if (!this.identity) return null;
        const identityHex = this.identity.replace('0x', '').toLowerCase();
        for (const user of this.cache.user.values()) {
            // Compare identity - handle different formats
            const userIdentityHex = (user.identity || '').replace('0x', '').toLowerCase();
            if (userIdentityHex === identityHex) {
                return user;
            }
        }
        return null;
    }
    
    /**
     * Get players for a user from cache.
     */
    getPlayersFromCache(userId) {
        const players = [];
        for (const player of this.cache.player.values()) {
            if (player.userId === userId) {
                players.push(player);
            }
        }
        return players;
    }
    
    /**
     * Get room from cache by code.
     */
    getRoomFromCacheByCode(roomCode) {
        for (const room of this.cache.room.values()) {
            if (room.code === roomCode) {
                return room;
            }
        }
        return null;
    }
    
    /**
     * Get room from cache by owner (most recent open room).
     */
    getRoomFromCacheByOwner(ownerId) {
        for (const room of this.cache.room.values()) {
            if (room.ownerId === ownerId && room.isOpen) {
                return room;
            }
        }
        return null;
    }
    
    /**
     * Get room members from cache.
     */
    getRoomMembersFromCache(roomId) {
        const members = [];
        for (const member of this.cache.room_member.values()) {
            if (member.roomId === roomId) {
                // Get player info
                const player = this.cache.player.get(member.playerId);
                members.push({
                    playerId: member.playerId,
                    username: player?.username || 'Unknown',
                    role: this.parseRole(member.role),
                    roomId: member.roomId,
                });
            }
        }
        return members;
    }
    
    /**
     * Get invitation from cache by token.
     */
    getInvitationFromCacheByToken(token) {
        for (const invitation of this.cache.room_invitation.values()) {
            if (invitation.token === token) {
                return invitation;
            }
        }
        return null;
    }
    
    // =========================================================================
    // Authentication Methods (New User + Player model)
    // =========================================================================
    
    async registerUser(username, password) {
        // Ensure WebSocket is connected before registering
        if (!this.isConnected()) {
            console.log('[STDB] Reconnecting WebSocket for registration...');
            await this.connect();
        }
        
        const result = await this.callReducer('register_user', [username, password]);
        if (!result.ok) return result;
        console.log('[STDB] User registered:', username);
        return result;
    }
    
    async loginUser(username, password) {
        // Ensure WebSocket is connected before logging in
        if (!this.isConnected()) {
            console.log('[STDB] Reconnecting WebSocket for login...');
            await this.connect();
        }
        
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
        
        // Disconnect WebSocket and stop all polling/reconnection
        this.disconnect();
        
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
        
        console.log('[STDB] Getting players for identity from cache:', this.identity);
        
        // Wait for user cache to be populated (subscription may still be loading)
        const identityHex = this.identity.replace('0x', '').toLowerCase();
        await this.waitForCache('user', u => {
            const userIdentityHex = (u.identity || '').replace('0x', '').toLowerCase();
            return userIdentityHex === identityHex;
        }, 3000);
        
        // Get user from cache
        const user = this.getUserFromCache();
        if (!user) {
            console.log('[STDB] User not found in cache after waiting');
            // Debug: log all users in cache
            console.log('[STDB] Users in cache:', Array.from(this.cache.user.values()));
            return [];
        }
        
        console.log('[STDB] Found user in cache:', user);
        
        // Get players for this user from cache
        const players = this.getPlayersFromCache(user.id);
        console.log('[STDB] Players found in cache:', players);
        
        return players;
    }
    
    // =========================================================================
    // Room Methods (Now require player_id)
    // =========================================================================
    
    async createRoom(playerId, roomName, role) {
        const result = await this.callReducer('create_room', [playerId, roomName || '', { [role]: {} }]);
        if (!result.ok) return result;
        
        // Wait for room to appear in cache (subscription update)
        await this.waitForCache('room', r => r.ownerId === playerId && r.isOpen, 2000);
        
        // Get room from cache
        const room = this.getRoomFromCacheByOwner(playerId);
        console.log('[STDB] Created room (from cache):', room);
        
        const members = room ? this.getRoomMembersFromCache(room.id) : [];
        return { ok: true, room, members };
    }
    
    async joinRoom(playerId, roomCode, role) {
        const result = await this.callReducer('join_room', [playerId, roomCode, { [role]: {} }]);
        if (!result.ok) return result;
        
        // Wait for room_member to appear in cache (subscription update)
        await this.waitForCache('room_member', m => m.playerId === playerId, 2000);
        
        // Get room from cache
        const room = this.getRoomFromCacheByCode(roomCode);
        console.log('[STDB] Joined room (from cache):', room);
        
        const members = room ? this.getRoomMembersFromCache(room.id) : [];
        return { ok: true, room, members };
    }
    
    async acceptInvitation(playerId, invitationToken, role) {
        const result = await this.callReducer('accept_invitation', [playerId, invitationToken, { [role]: {} }]);
        if (!result.ok) return result;
        
        // Wait for room_member to appear in cache (subscription update)
        await this.waitForCache('room_member', m => m.playerId === playerId, 2000);
        
        // Get invitation from cache to find room_id
        const invitation = this.getInvitationFromCacheByToken(invitationToken);
        if (!invitation) {
            console.log('[STDB] Invitation not found in cache');
            return { ok: true, room: null, members: [] };
        }
        
        const room = this.cache.room.get(invitation.roomId);
        console.log('[STDB] Accepted invitation, room (from cache):', room);
        
        const members = room ? this.getRoomMembersFromCache(room.id) : [];
        return { ok: true, room, members };
    }
    
    /**
     * Get room members from cache.
     * @deprecated Use getRoomMembersFromCache() directly
     */
    queryRoomMembers(roomId) {
        return this.getRoomMembersFromCache(roomId);
    }
    
    /**
     * Get a room by its code along with its members from cache.
     * Useful for reloading a room the player is already in.
     */
    getRoomByCode(roomCode) {
        const room = this.getRoomFromCacheByCode(roomCode);
        
        if (!room) {
            return { room: null, members: [] };
        }
        
        const members = this.getRoomMembersFromCache(room.id);
        return { room, members };
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
    
    // =========================================================================
    // Room Activity Methods
    // =========================================================================
    
    /**
     * Select an activity to view in detail.
     */
    async selectRoomActivity(playerId, roomId, activityId) {
        return await this.callReducer('select_room_activity', [playerId, roomId, activityId]);
    }
    
    /**
     * Randomly select an activity (weighted by ratings).
     */
    async randomRoomActivity(playerId, roomId) {
        return await this.callReducer('random_room_activity', [playerId, roomId]);
    }
    
    /**
     * Start the currently viewed activity.
     */
    async startRoomActivity(playerId, roomId) {
        return await this.callReducer('start_room_activity', [playerId, roomId]);
    }
    
    /**
     * Complete the current room activity (awards XP to all participants).
     */
    async completeRoomActivity(playerId, roomId) {
        return await this.callReducer('complete_room_activity', [playerId, roomId]);
    }
    
    /**
     * Cancel the current room activity (deletes all records).
     */
    async cancelRoomActivity(playerId, roomId) {
        return await this.callReducer('cancel_room_activity', [playerId, roomId]);
    }
    
    /**
     * Rate a completed activity (1-5 stars).
     */
    async rateActivity(playerId, activityId, rating) {
        return await this.callReducer('rate_activity', [playerId, activityId, rating]);
    }
    
    /**
     * Get the current room activity for a specific room from cache.
     */
    getRoomActivity(roomId) {
        for (const ra of this.cache.room_activity.values()) {
            if (ra.roomId === roomId && (ra.status === 'Viewing' || ra.status === 'InProgress')) {
                const activity = this.cache.activity.get(ra.activityId);
                const category = activity ? this.cache.category.get(activity.categoryId) : null;
                
                const participants = [];
                for (const ap of this.cache.activity_participant.values()) {
                    if (ap.roomActivityId === ra.id) {
                        const player = this.cache.player.get(ap.playerId);
                        participants.push({
                            ...ap,
                            username: player?.username || 'Unknown',
                        });
                    }
                }
                
                return {
                    ...ra,
                    activity,
                    categoryName: category?.name || 'Unknown',
                    participants,
                };
            }
        }
        return null;
    }
    
    /**
     * Get activity details by ID from cache.
     */
    getActivity(activityId) {
        const activity = this.cache.activity.get(activityId);
        if (!activity) return null;
        
        const category = this.cache.category.get(activity.categoryId);
        return {
            ...activity,
            categoryName: category?.name || 'Unknown',
        };
    }
    
    // =========================================================================
    // Not Wanted Activity Methods
    // =========================================================================
    
    /**
     * Mark an activity as "not wanted" by the player.
     * Activities marked by any room member won't appear in that room.
     */
    async markActivityNotWanted(playerId, activityId) {
        return await this.callReducer('mark_activity_not_wanted', [playerId, activityId]);
    }
    
    /**
     * Remove an activity from the player's "not wanted" list.
     */
    async unmarkActivityNotWanted(playerId, activityId) {
        return await this.callReducer('unmark_activity_not_wanted', [playerId, activityId]);
    }
    
    /**
     * Get all activities marked as "not wanted" by a player from cache.
     */
    getNotWantedActivities(playerId) {
        const notWanted = [];
        for (const nw of this.cache.player_not_wanted_activity.values()) {
            if (nw.playerId === playerId) {
                const activity = this.cache.activity.get(nw.activityId);
                const category = activity ? this.cache.category.get(activity.categoryId) : null;
                notWanted.push({
                    ...nw,
                    activity,
                    categoryName: category?.name || 'Unknown',
                });
            }
        }
        return notWanted;
    }
    
    /**
     * Check if a specific activity is in the player's not-wanted list.
     */
    isActivityNotWanted(playerId, activityId) {
        for (const nw of this.cache.player_not_wanted_activity.values()) {
            if (nw.playerId === playerId && nw.activityId === activityId) {
                return true;
            }
        }
        return false;
    }
    
    // =========================================================================
    // Category Preferences
    // =========================================================================
    
    /**
     * Initialize user preferences with default categories (ID < 100).
     * Called automatically when opening preferences dialog.
     */
    async initUserPreferences() {
        return await this.callReducer('init_user_preferences', []);
    }
    
    /**
     * Add a category to user preferences.
     */
    async addUserCategoryPreference(categoryId) {
        return await this.callReducer('add_user_category_preference', [categoryId]);
    }
    
    /**
     * Remove a category from user preferences.
     */
    async removeUserCategoryPreference(categoryId) {
        return await this.callReducer('remove_user_category_preference', [categoryId]);
    }
    
    /**
     * Set all user category preferences at once.
     */
    async setUserCategoryPreferences(categoryIds) {
        return await this.callReducer('set_user_category_preferences', [categoryIds]);
    }
    
    /**
     * Add a category to player preferences.
     */
    async addPlayerCategoryPreference(playerId, categoryId) {
        return await this.callReducer('add_player_category_preference', [playerId, categoryId]);
    }
    
    /**
     * Remove a category from player preferences.
     */
    async removePlayerCategoryPreference(playerId, categoryId) {
        return await this.callReducer('remove_player_category_preference', [playerId, categoryId]);
    }
    
    /**
     * Set all player category preferences at once.
     */
    async setPlayerCategoryPreferences(playerId, categoryIds) {
        return await this.callReducer('set_player_category_preferences', [playerId, categoryIds]);
    }
    
    /**
     * Get all categories from cache.
     * 
     * Categories are loaded via WebSocket subscription immediately on connect
     * (before other tables). If categories aren't loaded yet, waits for them.
     * 
     * Use `onCategoriesLoaded` callback for proactive notification.
     */
    async getAllCategories() {
        // If categories are already loaded, return immediately
        if (this.categoriesLoaded && this.cache.category.size > 0) {
            return Array.from(this.cache.category.values())
                .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        }
        
        // First, ensure we're connected
        if (!this.isConnected()) {
            console.log('[STDB] Not connected, waiting for connection...');
            const connected = await this.waitForConnection(5000);
            if (!connected) {
                console.error('[STDB] Failed to connect - cannot load categories');
                return [];
            }
        }
        
        // Wait for categories to load (max 5 seconds)
        console.log('[STDB] Waiting for categories to load from subscription...');
        const maxWait = 5000;
        const checkInterval = 100;
        let waited = 0;
        
        while (waited < maxWait && this.cache.category.size === 0) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        if (this.cache.category.size === 0) {
            console.error('[STDB] Categories not loaded after waiting - subscription may have failed');
            console.log('[STDB] Connection state:', this.ws?.readyState, 'Cache size:', this.cache.category.size);
        } else {
            this.categoriesLoaded = true;
            console.log(`[STDB] Categories ready: ${this.cache.category.size}`);
        }
        
        return Array.from(this.cache.category.values())
            .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    }
    
    /**
     * Check if categories are already loaded.
     */
    areCategoriesLoaded() {
        return this.categoriesLoaded && this.cache.category.size > 0;
    }
    
    /**
     * Get user's selected category IDs from cache.
     * Returns IDs of categories the user has selected.
     */
    getUserCategoryPreferences(userId) {
        const prefs = [];
        for (const pref of this.cache.user_category_preference.values()) {
            if (pref.userId === userId) {
                prefs.push(pref.categoryId);
            }
        }
        return prefs;
    }
    
    /**
     * Get player's selected category IDs from cache.
     * Returns IDs of categories the player has selected.
     */
    getPlayerCategoryPreferences(playerId) {
        const prefs = [];
        for (const pref of this.cache.player_category_preference.values()) {
            if (pref.playerId === playerId) {
                prefs.push(pref.categoryId);
            }
        }
        return prefs;
    }
    
    /**
     * Get the current user from cache.
     */
    getCurrentUser() {
        if (!this.identity) return null;
        for (const user of this.cache.user.values()) {
            // Identity matching - the identity stored is the hex string
            if (user.identity === this.identity) {
                return user;
            }
        }
        return null;
    }
    
    /**
     * Check if a category is selected for a user.
     */
    isUserCategorySelected(userId, categoryId) {
        for (const pref of this.cache.user_category_preference.values()) {
            if (pref.userId === userId && pref.categoryId === categoryId) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if a category is selected for a player.
     */
    isPlayerCategorySelected(playerId, categoryId) {
        for (const pref of this.cache.player_category_preference.values()) {
            if (pref.playerId === playerId && pref.categoryId === categoryId) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Get default category IDs (those with ID < 100).
     */
    getDefaultCategoryIds() {
        const defaults = [];
        for (const cat of this.cache.category.values()) {
            if (cat.id < 100) {
                defaults.push(cat.id);
            }
        }
        return defaults;
    }
}
