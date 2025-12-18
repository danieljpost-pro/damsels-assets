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
│                              │  • Owner controls (invitations) │           │
│                              │  • Leave room / Logout          │           │
│                              └─────────────────────────────────┘           │
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
- **Available Activities**: Lists activities unlocked for the player
- **Owner Controls**: Create invitations, close room
- **New Activities Toast**: Notifies when new activities are unlocked

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
- **Client Cache**: Maps for `user`, `player`, `room`, `room_member`, `activity`, etc.
- **Identity Management**: Stores/retrieves identity token from localStorage

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

## Related Layers

- **[damsels-spacetimedb](../damsels-spacetimedb/)** — Rust backend (SpacetimeDB module)
- **[damsels-pingora](../damsels-pingora/)** — Reverse proxy (routes API and static assets)
