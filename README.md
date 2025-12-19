# Damsels - Frontend Assets

A single-page web application serving the **Damsels** real-time multiplayer game UI, built with [Zola](https://www.getzola.org/) (Rust-based static site generator) and vanilla JavaScript.

## UI Flow Overview

The application guides users through a multi-step authentication and room-joining flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER JOURNEY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │   Step 1    │────▶│   Step 2    │────▶│   Step 3    │────▶│  Step 4   │ │
│  │   LOGIN     │     │   PLAYER    │     │    ROOM     │     │   ROLE    │ │
│  │             │     │  SELECTION  │     │  SELECTION  │     │ SELECTION │ │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
│        │                   │                   │                    │       │
│        ▼                   ▼                   ▼                    ▼       │
│  • Login/Register    • View players      • Create Room       • Choose role │
│  • Password auth     • Create new        • Join by Code      • Top/Bottom  │
│                      • Select player     • Accept Invite     • Observer    │
│                                                               • Photographer│
│                                                                             │
│                              ┌─────────────────────────────────┐           │
│                              │           Step 5                │           │
│                              │        ROOM LOBBY               │           │
│                              │                                 │           │
│                              │  • See room members             │           │
│                              │  • View available activities    │           │
│                              │  • "Choose For Me" (dice roll)  │           │
│                              │  • Owner controls (invitations) │           │
│                              │  • Leave room / Logout          │           │
│                              └────────────────┬────────────────┘           │
│                                               │                             │
│                                               ▼                             │
│                              ┌─────────────────────────────────┐           │
│                              │           Step 6                │           │
│                              │     ACTIVITY DETAIL VIEW        │           │
│                              │                                 │           │
│                              │  • Full activity description    │           │
│                              │  • Video embed (YouTube/Vimeo)  │           │
│                              │  • Instructions panel           │           │
│                              │  • "Do This Activity" / "Back"  │           │
│                              │  • Participant list (in progress)│          │
│                              │  • Completion & rating UI       │           │
│                              └─────────────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      HAMBURGER MENU                                  │   │
│  │  ⚙️ Activity Preferences  (opens modal)                             │   │
│  │  🔄 Reload Room                                                      │   │
│  │  🚪 Log Out                                                          │   │
│  │  🌙 Dark Mode Toggle                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PREFERENCES MODAL                                 │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  Displays all activity categories with checkboxes                   │   │
│  │  • Categories with ID ≥ 100 highlighted (adult content)            │   │
│  │  • Auto-saves on checkbox change                                    │   │
│  │  • "Select All" / "Select None" buttons                            │   │
│  │  • User preferences when logged in as user                          │   │
│  │  • Player preferences when logged in as player                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step UI Flow

#### Step 1: Login/Register (`#step-login`)
- User enters username and password
- **Login**: Authenticates existing user account
- **Register**: Creates new user account with password
- Identity token stored in localStorage for session persistence

#### Step 2: Player Selection (`#step-player`)
- Displays all player identities belonging to the authenticated user
- A single user can have multiple player personas
- Each player has their own XP and activity progress
- Users can create new player identities

#### Step 3: Room Selection (`#step-room`)
- **Create Room**: Opens room creation form with optional name
- **Join Room**: Enter a 5-character room code (e.g., `ABCD1`)
- **Accept Invitation**: Use an invitation token from a room owner

#### Step 4: Role Selection (`#step-role`)
- Choose a role for the session:
  - **👑 Top** - Lead the encounter
  - **🌹 Bottom** - Surrender control
  - **👁 Observer** - Watch in silence
  - **📸 Photographer** - Document the moment
  - **⚙️ Admin** (DEV only) - Manage activities

#### Step 5: Room Lobby (`#step-lobby`)
- Displays room name and shareable code
- Shows all current room members with their roles
- **Room Available Activities**: Shows the **intersection** of activities available to ALL room members
  - Only activities unlocked by ALL members are shown
  - Only categories in ALL members' preferences are included
  - Activities marked "not wanted" by ANY member are excluded
  - Updates automatically when members join/leave or change preferences
- **"Choose For Me" Button**: Random weighted activity selection (dice roll animation)
- **Owner Controls**: Create invitations, close room
- **New Activities Toast**: Notifies when new activities are unlocked

#### Hamburger Menu
Available in the top-right corner on all screens:
- **Activity Preferences**: Opens modal to select which activity categories to show
  - When logged in as User: "Activity Preferences" (edits User preferences)
  - When logged in as Player: "Preferences for {Player Name}" (edits Player preferences)
- **Reload Room**: Refresh room member list
- **Log Out**: Clear session and return to login
- **Dark Mode Toggle**: Switch between dark and light themes

#### Preferences Modal
- Displays all activity categories as checkboxes
- Categories with ID ≥ 100 are highlighted (adult-oriented content)
- Changes auto-save immediately when clicking checkboxes
- **Select All / Select None** buttons for quick selection
- User preferences act as templates for new Players
- Player preferences filter which activities are available in rooms

#### Step 6: Activity Detail View (`#step-activity`)
- **Full Activity Display**: Title, category, kind (Skill/Activity), description
- **Video Embedding**: Supports YouTube, Vimeo, and direct video URLs
- **Instructions Panel**: Step-by-step activity instructions
- **XP Reward Display**: Shows potential XP earned
- **Viewing State Actions**:
  - ✨ **Do This Activity**: Start the activity for all room members
  - ← **Go Back**: Return to lobby (cancels the viewing state)
  - 🚫 **Don't show me this activity again**: Mark as not wanted (hides from all rooms)
- **In Progress State**:
  - Shows all participants with their roles
  - ✅ **Completed This Activity**: Awards XP to all participants
  - ✕ **Cancel**: Cancels without saving any record
- **Completion State**:
  - Celebration animation and XP earned display
  - ⭐ **Rating Stars**: 1-5 star rating (influences future "Choose For Me" selections)
  - ← **Back to Lobby**: Returns to activity list

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │   index.html │    │              app.js                  │  │
│  │  (Tera/Zola) │    │   • State management                 │  │
│  │              │───▶│   • UI step transitions              │  │
│  │  Steps 1-5   │    │   • Event handlers                   │  │
│  │  forms/cards │    │   • SpacetimeDBClient wrapper        │  │
│  └──────────────┘    └──────────────────────────────────────┘  │
│                                    │                            │
│                                    ▼                            │
│                      ┌──────────────────────────────────────┐  │
│                      │      spacetimedb-client.js           │  │
│                      │                                      │  │
│                      │  • WebSocket connection (real-time)  │  │
│                      │  • HTTP reducer calls                │  │
│                      │  • Client-side cache (Map objects)   │  │
│                      │  • Table subscriptions               │  │
│                      └──────────────────────────────────────┘  │
│                                    │                            │
│                          ┌─────────┴─────────┐                 │
│                          │                   │                  │
│                     WebSocket           HTTP REST              │
│                    (subscribe)        (call reducers)          │
│                          │                   │                  │
└──────────────────────────┼───────────────────┼──────────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────────────────────────┐
                    │       Pingora Proxy (:8088)     │
                    │   /v1/* → SpacetimeDB           │
                    │   /*    → Zola (static)         │
                    └─────────────────────────────────┘
```

## File Structure

```
damsels-assets/
├── config.toml              # Zola configuration
├── content/
│   └── _index.md            # Homepage content/tagline
├── templates/
│   ├── base.html            # Base layout (fonts, CSS)
│   └── index.html           # Main SPA template with all steps
├── sass/
│   └── main.scss            # SCSS stylesheets (dark/light themes)
├── static/
│   ├── favicon.ico
│   └── js/
│       ├── app.js               # Main application logic
│       ├── spacetimedb-client.js # SpacetimeDB WebSocket/HTTP client
│       └── dev/
│           └── admin.js         # Admin panel (dev mode only)
└── build/                   # Generated output (gitignored)
```

## Key Components

### `app.js` - Main Application

Manages the entire UI flow with:
- **State Object**: Tracks current user, player, room, role, and UI step
- **DOM Element References**: Cached for performance
- **Step Navigation**: `showStep(stepName)` transitions between UI states
- **Event Handlers**: Form submissions, button clicks, role selection
- **Real-time Updates**: Callbacks for room member changes, activity unlocks

### `spacetimedb-client.js` - SpacetimeDB Client

Handles all backend communication:
- **WebSocket Connection**: Subscribes to tables for real-time updates
- **HTTP Reducer Calls**: Invokes backend functions (login, create_room, etc.)
- **Client Cache**: Maps for `user`, `player`, `room`, `room_member`, `activity`, `room_activity`, `activity_participant`, etc.
- **Identity Management**: Stores/retrieves identity token from localStorage

#### Room Activity Methods
```javascript
// Select a specific activity to view
await client.selectRoomActivity(playerId, roomId, activityId);

// Random weighted selection (based on ratings)
await client.randomRoomActivity(playerId, roomId);

// Start the currently viewed activity
await client.startRoomActivity(playerId, roomId);

// Complete and award XP to all participants
await client.completeRoomActivity(playerId, roomId);

// Cancel without saving any record
await client.cancelRoomActivity(playerId, roomId);

// Rate a completed activity (1-5 stars)
await client.rateActivity(playerId, activityId, rating);

// Mark activity as "not wanted"
await client.markActivityNotWanted(playerId, activityId);

// Remove from not-wanted list
await client.unmarkActivityNotWanted(playerId, activityId);

// Get all not-wanted activities for a player
const notWanted = client.getNotWantedActivities(playerId);

// Get activities available to ALL room members (intersection)
const roomActivities = client.getRoomAvailableActivities(roomId);
```

#### Room Available Activities Callback
```javascript
// Called when room membership, preferences, or unlocked activities change
client.onRoomAvailableActivitiesUpdate = (roomId, activities) => {
    console.log(`Room ${roomId} has ${activities.length} available activities`);
    // activities = intersection of all members' unlocked activities
    // filtered by category preferences and "not wanted" lists
};
```

#### Category Preference Methods
```javascript
// Initialize user preferences with defaults (categories ID < 100)
await client.initUserPreferences();

// Add/remove user category preference
await client.addUserCategoryPreference(categoryId);
await client.removeUserCategoryPreference(categoryId);

// Bulk set all user preferences
await client.setUserCategoryPreferences([1, 2, 5, 11, 12]);

// Add/remove player category preference
await client.addPlayerCategoryPreference(playerId, categoryId);
await client.removePlayerCategoryPreference(playerId, categoryId);

// Bulk set all player preferences
await client.setPlayerCategoryPreferences(playerId, [1, 2, 5]);

// Get all categories sorted by display order
const categories = client.getAllCategories();

// Get user/player selected category IDs
const userPrefs = client.getUserCategoryPreferences(userId);
const playerPrefs = client.getPlayerCategoryPreferences(playerId);

// Get default category IDs (ID < 100)
const defaults = client.getDefaultCategoryIds();
```

### Theming

- **Dark Mode** (default): Deep blacks with golden accents
- **Light Mode**: Toggle via hamburger menu
- **Color Palette**:
  - Background: `#0a0a0f`
  - Surface: `#12121a`
  - Accent (gold): `#c9a227`
  - Error: `#b35252`
  - Success: `#4a9e6a`

## Prerequisites

- [Zola](https://www.getzola.org/documentation/getting-started/installation/) (0.18+)

## Development

```bash
# Navigate to assets directory
cd damsels-assets

# Serve locally with hot reload (port 1111)
zola serve

# Or specify a different port
zola serve --port 1111
```

Visit `http://127.0.0.1:1111` (or use the Pingora proxy at `:8088`).

## Build

```bash
# Build to /build directory
zola build
```

## Dev Mode Features

When `dev_mode = true` in `config.toml`:
- **ActivityAdmin Role**: Visible in role selection
- **Admin Panel**: Manage categories, activities, prerequisites, equipment
- **Debug Activities Panel**: Shows available activities in lobby

## Connection Flow

1. On page load, `init()` establishes WebSocket connection to SpacetimeDB
2. Client subscribes to relevant tables (`user`, `player`, `room`, etc.)
3. Identity token is retrieved from localStorage or generated fresh
4. UI updates reactively as subscription data arrives
5. User actions trigger HTTP reducer calls, which update the database
6. WebSocket pushes changes back to all subscribed clients

## Future Features

- [ ] Display of activities the Player marked as Not Wanted, with ability to remove items from the list
- [ ] Activity ratings display on activity cards
- [ ] Aggregate activity ratings visible to help Players choose

## Related Layers

- **[damsels-spacetimedb](../damsels-spacetimedb/)** — Rust backend (SpacetimeDB module)
- **[damsels-pingora](../damsels-pingora/)** — Reverse proxy (routes API and static assets)
