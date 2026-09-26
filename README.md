# ⚡ Skone Remote Support — Web-Based Remote Access App

A professional **TeamViewer-like** web app where an admin can view and fully control a user's computer through a browser.

## Features

- 🖥️ **Live Screen Streaming** — Real-time JPEG screen capture (10 FPS)
- 🖱️ **Full OS Mouse Control** — Move, left-click, right-click, double-click, scroll
- ⌨️ **Full Keyboard Control** — Type text, use shortcuts, function keys
- 🔐 **Session-Based Access** — Unique 6-char session IDs
- 🎨 **Beautiful UI** — Dark glassmorphism design with animations
- 👤 **Admin Panel** — Session list, FPS counter, latency display, fullscreen

---

## Architecture

```
User PC                          Admin Browser
  |                                    |
  |--- agent.js (Node.js) -------------|
  |    ↕ screenshots                   |
  |    ↕ mouse/keyboard events         |
  |         ↕                          |
  |    [server.js - Socket.io]         |
  |         ↕                          |
  |    browser (user.html)        admin.html
```

---

## Setup & Installation

### Prerequisites
- **Node.js** v16+ — Download from https://nodejs.org/

### Step 1: Install Dependencies

```bash
cd remote-access-app
npm install
```

> ⚠️ `@nut-tree-fork/nut-js` may require build tools on Windows:
> ```bash
> npm install --global --production windows-build-tools
> ```
> Or install Visual Studio Build Tools from https://aka.ms/vs/17/release/vs_BuildTools.exe

### Step 2: Start the Server

Set an administrator password in your terminal before starting the server:

PowerShell:
```powershell
$env:ADMIN_PASSWORD = "replace-with-a-strong-password"
```

Command Prompt:
```bat
set "ADMIN_PASSWORD=replace-with-a-strong-password"
```

```bash
node server.js
```

The server starts at **http://localhost:3000**. It refuses to start if
`ADMIN_PASSWORD` is not set. The password is never printed to the console.

### Deploy to Render

1. In Render, choose **New > Blueprint** and connect the
   `rj08104030121-web/RemoteDesk` GitHub repository.
2. Render reads `render.yaml`, creates the web service, and generates a
   private `ADMIN_PASSWORD` value for it.
3. When deployment finishes, open the service's `onrender.com` URL and log in
   with the `ADMIN_PASSWORD` shown in the service's environment settings.

The free web service may sleep when idle. Sessions and agent accounts are
stored in memory, so they are cleared whenever the service restarts.

### Step 3: Run the Agent (on USER's computer)

In a separate terminal:
```bash
node agent.js
```

The agent will print a **Session ID** like: `A3F2B1`

### Step 4: Admin Connects

1. Open **http://localhost:3000/admin.html** in browser
2. Log in with the `ADMIN_PASSWORD` value you configured above.
3. Enter the Session ID from Step 3
4. Click **Connect** — see the user's screen live!

---

## Configuration

### Change Admin Password
Set `ADMIN_PASSWORD` in the environment before starting the server. The
in-app password change applies until the server restarts; set the environment
variable to the new value to keep it across restarts.

### Change Server URL (for remote access)
In `agent.js`, line 10:
```js
const SERVER_URL = 'http://localhost:3000'; // Change to your server's IP
```

### Change Frame Rate
In `agent.js`, line 11:
```js
const FRAME_INTERVAL_MS = 100; // 100ms = 10 FPS, lower = faster
```

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/user.html` | User side — shows session status |
| `/admin.html` | Admin panel — view & control |

---

## Security Notes

> ⚠️ This app is for **authorized remote support only**.
> - Change the admin password before deployment
> - Use HTTPS in production (add SSL certificate)
> - Add session expiry for production use
> - Consider IP whitelisting for the admin panel

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js + Express |
| Real-time | Socket.io (WebSocket) |
| Screen Capture | `screenshot-desktop` |
| Mouse/Keyboard | `@nut-tree-fork/nut-js` |
| Frontend | Vanilla HTML/CSS/JS |
| Design | Dark Glassmorphism |
