/**
 * Skone Remote Support - Signaling Server
 * New flow: Admin generates invite code → User downloads BAT agent → Admin gets access
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6 // 5MB for screenshot frames
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── In-memory stores ────────────────────────────────────────────────────────
// pendingInvites[code] = { adminSocketId, createdAt }
const pendingInvites = {};

// sessions[sessionId] = { agentSocketId, adminSocketId, status, code, createdAt }
const sessions = {};

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD="Akku@123";
if (!Akku@123) {
  console.error('Set the ADMIN_PASSWORD environment variable before starting the server.');
  process.exit(1);
}
const ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');

// ─── Support Agents store ─────────────────────────────────────────────────────
// agents[id] = { id, username, password, createdAt }
const agents = {};
function generateAgentId() { return crypto.randomBytes(4).toString('hex'); }

// Validates the runtime admin token OR agent-token-<id>
function validateToken(token) {
  if (token === ADMIN_TOKEN) return { valid: true, role: 'admin' };
  if (token && token.startsWith('agent-token-')) {
    const agentId = token.slice('agent-token-'.length);
    if (agents[agentId]) return { valid: true, role: 'agent', agentId, username: agents[agentId].username };
  }
  return { valid: false };
}


function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F2B1"
}
function generateSessionId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ─── REST: Admin login ────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// ─── REST: Change admin password ──────────────────────────────────────────────
app.post('/api/admin/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Both fields are required' });
  }
  if (currentPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: 'New password must be at least 4 characters' });
  }
  ADMIN_PASSWORD = newPassword;
  console.log('[Admin] Password changed');
  res.json({ success: true, message: 'Password changed successfully' });
});

// ─── REST: List agents (admin only) ───────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN)
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  const list = Object.values(agents).map(({ id, username, createdAt }) => ({ id, username, createdAt }));
  res.json({ success: true, agents: list });
});

// ─── REST: Create agent (admin only) ──────────────────────────────────────────────
app.post('/api/agents', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN)
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  if (username.length < 3)
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
  if (password.length < 4)
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  if (Object.values(agents).find(a => a.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ success: false, message: 'Agent username already exists' });
  const id = generateAgentId();
  agents[id] = { id, username, password, createdAt: new Date().toISOString() };
  console.log(`[Agents] Created: ${username} (${id})`);
  res.json({ success: true, agent: { id, username, createdAt: agents[id].createdAt } });
});

// ─── REST: Change agent password (admin or that agent) ──────────────────────────────
app.put('/api/agents/:id/password', (req, res) => {
  const auth = validateToken(req.headers['x-admin-token']);
  if (!auth.valid || (auth.role === 'agent' && auth.agentId !== req.params.id))
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  const agent = agents[req.params.id];
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
  const { password } = req.body;
  if (!password || password.length < 4)
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  agent.password = password;
  console.log(`[Agents] Password changed for: ${agent.username}`);
  res.json({ success: true, message: 'Agent password updated' });
});

// ─── REST: Delete agent (admin only) ───────────────────────────────────────────────
app.delete('/api/agents/:id', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN)
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  const agent = agents[req.params.id];
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
  delete agents[req.params.id];
  console.log(`[Agents] Deleted: ${agent.username}`);
  res.json({ success: true });
});

// ─── REST: Agent login ───────────────────────────────────────────────────────────
app.post('/api/agent/login', (req, res) => {
  const { username, password } = req.body;
  const agent = Object.values(agents).find(
    a => a.username.toLowerCase() === username?.toLowerCase() && a.password === password
  );
  if (!agent) return res.status(401).json({ success: false, message: 'Invalid username or password' });
  res.json({ success: true, token: `agent-token-${agent.id}`, username: agent.username, agentId: agent.id });
});



// ─── REST: Validate a connection code (used by user page before download) ────
app.get('/api/validate/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (pendingInvites[code]) {
    res.json({ valid: true });
  } else {
    res.status(404).json({ valid: false, message: 'Invalid or expired code' });
  }
});

// ─── REST: Download the agent launcher BAT for a given code ──────────────────
app.get('/download/:code', (req, res) => {
  const code = req.params.code.toUpperCase();

  if (!pendingInvites[code]) {
    return res.status(404).send(`
      <h2>Invalid or Expired Code</h2>
      <p>The connection code <strong>${code}</strong> is not valid or has already been used.</p>
      <p><a href="/">Go back</a></p>
    `);
  }

  // Build the server's public URL (use host header or configured PUBLIC_URL)
  const publicUrl = process.env.PUBLIC_URL ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;

  // Generate a BAT script that:
  // 1. Downloads Node.js portable (if not present) or uses system node
  // 2. Downloads agent.js from the server
  // 3. Runs it with the code and server URL
  const batContent = `@echo off
title Skone Remote Support - Connecting...
color 0A
echo.
echo  =====================================================
echo    Skone Remote Support Agent
echo    Connection Code: ${code}
echo  =====================================================
echo.
echo  [*] Checking for Node.js...

where node >nul 2>&1
if %ERRORLEVEL% NEq 0 (
  echo  [!] Node.js not found. Please install Node.js from https://nodejs.org
  echo      Then re-run this file.
  pause
  exit /b 1
)

echo  [*] Node.js found.

:: Create a dedicated working directory for the agent
set AGENT_DIR=%TEMP%\\skone-session-${code}
mkdir "%AGENT_DIR%" 2>nul

echo  [*] Downloading agent from server...

:: Download agent.js into the agent directory
powershell -Command "Invoke-WebRequest -Uri '${publicUrl}/agent-download/agent.js' -OutFile '%AGENT_DIR%\\agent.js'" 2>nul
if %ERRORLEVEL% NEq 0 (
  :: Fallback: try curl
  curl -s -o "%AGENT_DIR%\\agent.js" "${publicUrl}/agent-download/agent.js"
)

if not exist "%AGENT_DIR%\\agent.js" (
  echo  [!] Failed to download agent. Check your internet connection.
  pause
  exit /b 1
)

echo  [*] Installing dependencies (first run may take a moment)...
cd /d "%AGENT_DIR%"
if not exist "node_modules\\socket.io-client" (
  npm install --save socket.io-client screenshot-desktop @nut-tree-fork/nut-js
)

echo.
echo  =====================================================
echo    Connecting to support session...
echo    DO NOT CLOSE THIS WINDOW
echo  =====================================================
echo.

set SKONE_SERVER=${publicUrl}
set SKONE_CODE=${code}
node "%AGENT_DIR%\\agent.js"

echo.
echo  Session ended. You may close this window.
pause
`;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="SkoneAgent-${code}.bat"`);
  res.send(batContent);
});

// ─── REST: Serve agent.js for download by the BAT script ─────────────────────
app.get('/agent-download/agent.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent.js'));
});

// ─── REST: List active sessions (admin panel) ─────────────────────────────────
app.get('/api/sessions', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  const auth = validateToken(token);
  let entries = Object.entries(sessions)
    .filter(([, s]) => s.agentSocketId && s.status !== 'disconnected');
  if (auth.valid && auth.role === 'agent') {
    entries = entries.filter(([, s]) => s.creatorId === auth.agentId);
  }
  res.json({
    sessions: entries.map(([id, s]) => ({
      id, status: s.status, code: s.code,
      connectedAt: s.createdAt, hasAdmin: !!s.adminSocketId,
      creatorId: s.creatorId, creatorName: s.creatorName
    }))
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── ADMIN: Create invite code ─────────────────────────────────────────────
  socket.on('admin:create-invite', ({ token }) => {
    const auth = validateToken(token);
    if (!auth.valid) { socket.emit('admin:error', { message: 'Unauthorized' }); return; }
    const code = generateCode();
    pendingInvites[code] = {
      adminSocketId: socket.id,
      creatorId: auth.role === 'agent' ? auth.agentId : 'admin',
      creatorName: auth.role === 'agent' ? auth.username : 'Admin',
      createdAt: new Date().toISOString()
    };
    setTimeout(() => {
      if (pendingInvites[code]) { delete pendingInvites[code]; console.log(`[Invite] Expired: ${code}`); }
    }, 30 * 60 * 1000);
    socket.emit('invite:created', { code });
    console.log(`[Invite] Created: ${code} by ${auth.role === 'agent' ? auth.username : 'admin'}`);
  });

  // ── AGENT: Register with connection code ──────────────────────────────────
  socket.on('agent:register', ({ code } = {}) => {
    code = (code || '').toUpperCase();
    const invite = pendingInvites[code];

    if (!invite) {
      socket.emit('agent:error', { message: 'Invalid or expired connection code' });
      console.log(`[Agent] Rejected unknown code: ${code}`);
      return;
    }

    const sessionId = generateSessionId();
    sessions[sessionId] = {
      agentSocketId: socket.id,
      adminSocketId: invite.adminSocketId,
      creatorId: invite.creatorId,
      creatorName: invite.creatorName,
      status: 'waiting',
      code,
      createdAt: new Date().toISOString()
    };


    socket.sessionId = sessionId;
    socket.role = 'agent';

    // Consume the invite so it can't be reused
    delete pendingInvites[code];

    socket.emit('agent:registered', { sessionId });
    console.log(`[Agent] Registered session: ${sessionId} (code: ${code})`);

    // Notify admin that the user's agent is connected
    io.to(invite.adminSocketId).emit('admin:agent-joined', {
      sessionId,
      code,
      connectedAt: sessions[sessionId].createdAt
    });
  });

  // ── AGENT: Send screenshot frame ──────────────────────────────────────────
  socket.on('agent:frame', (frameData) => {
    const session = sessions[socket.sessionId];
    if (session && session.adminSocketId) {
      io.to(session.adminSocketId).emit('admin:frame', frameData);
    }
  });

  // ── AGENT: Ready signal ───────────────────────────────────────────────────
  socket.on('agent:ready', () => {
    const session = sessions[socket.sessionId];
    if (session && session.adminSocketId) {
      io.to(session.adminSocketId).emit('admin:agent-ready');
      session.status = 'connected';
    }
  });

  // ── ADMIN: Connect to a session ───────────────────────────────────────────
  socket.on('admin:connect', ({ sessionId, token }) => {
    const auth = validateToken(token);
    if (!auth.valid) { socket.emit('admin:error', { message: 'Unauthorized' }); return; }
    const session = sessions[sessionId];
    if (!session) {
      socket.emit('admin:error', { message: 'Session not found' });
      return;
    }
    if (session.adminSocketId && session.adminSocketId !== socket.id) {
      socket.emit('admin:error', { message: 'Session already has an admin connected' });
      return;
    }
    session.adminSocketId = socket.id;
    socket.sessionId = sessionId;
    socket.role = 'admin';
    io.to(session.agentSocketId).emit('agent:admin-connected', { adminId: socket.id });
    socket.emit('admin:connected', { sessionId });
    console.log(`[Admin] Connected to session: ${sessionId}`);
  });

  // ── ADMIN → AGENT: Control events (unchanged) ─────────────────────────────
  const relay = (eventIn, eventOut) => {
    socket.on(eventIn, (data) => {
      const session = sessions[socket.sessionId];
      if (session && session.agentSocketId) {
        io.to(session.agentSocketId).emit(eventOut, data);
      }
    });
  };

  relay('admin:mousemove', 'agent:mousemove');
  relay('admin:mouseclick', 'agent:mouseclick');
  relay('admin:rightclick', 'agent:rightclick');
  relay('admin:scroll', 'agent:scroll');
  relay('admin:keypress', 'agent:keypress');
  relay('admin:request-frame', 'agent:capture-frame');

  // ── ADMIN: Disconnect from session ────────────────────────────────────────
  socket.on('admin:disconnect-session', () => {
    const session = sessions[socket.sessionId];
    if (session) {
      session.adminSocketId = null;
      session.status = 'waiting';
      io.to(session.agentSocketId).emit('agent:admin-disconnected');
    }
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Socket disconnected: ${socket.id}`);

    if (socket.role === 'agent' && socket.sessionId) {
      const session = sessions[socket.sessionId];
      if (session) {
        if (session.adminSocketId) {
          io.to(session.adminSocketId).emit('admin:agent-disconnected');
        }
        delete sessions[socket.sessionId];
        console.log(`[Agent] Session removed: ${socket.sessionId}`);
      }
    }

    if (socket.role === 'admin' && socket.sessionId) {
      const session = sessions[socket.sessionId];
      if (session) {
        session.adminSocketId = null;
        session.status = 'waiting';
        io.to(session.agentSocketId).emit('agent:admin-disconnected');
        console.log(`[Admin] Disconnected from session: ${socket.sessionId}`);
      }
    }

    // Clean up any pending invites this admin created on disconnect
    for (const [code, invite] of Object.entries(pendingInvites)) {
      if (invite.adminSocketId === socket.id) {
        delete pendingInvites[code];
        console.log(`[Invite] Removed on admin disconnect: ${code}`);
      }
    }
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Skone Remote Support Server running at http://localhost:${PORT}`);
  console.log('Admin password is configured via the ADMIN_PASSWORD environment variable.\n');
});
