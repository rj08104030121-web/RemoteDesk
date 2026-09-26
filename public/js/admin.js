/**
 * Admin Panel JavaScript
 * Handles login, session management, screen viewing, and remote control
 */

// --- State ---
let socket = null;
let authToken = null;
let currentSessionId = null;
let mouseControlEnabled = true;
let keyboardControlEnabled = true;
let frameCount = 0;
let fpsInterval = null;
let lastFrameTime = null;
let canvasNativeW = 1920;
let canvasNativeH = 1080;
let currentLoginMode = 'admin'; // 'admin' | 'agent'
let loggedInRole = null;        // 'admin' | 'agent'
let loggedInAgentId = null;

// --- Canvas ---
const canvas = document.getElementById('screen-canvas');
const ctx = canvas.getContext('2d');

// --- DOM Elements ---
const loginScreen         = document.getElementById('login-screen');
const adminApp            = document.getElementById('admin-app');
const loginForm           = document.getElementById('login-form');
const loginError          = document.getElementById('login-error');
const adminStatusBadge    = document.getElementById('admin-status-badge');
const sessionsList        = document.getElementById('sessions-list');
const sessionCount        = document.getElementById('session-count');
const viewerEmpty         = document.getElementById('viewer-empty');
const viewerContainer     = document.getElementById('viewer-container');
const canvasOverlay       = document.getElementById('canvas-overlay');
const overlayMsg          = document.getElementById('overlay-msg');
const toolbarSessionId    = document.getElementById('toolbar-session-id');
const toolbarStatus       = document.getElementById('toolbar-status');
const fpsBadge            = document.getElementById('fps-badge');
const statusBarCoords     = document.getElementById('status-bar-coords');
const statusBarResolution = document.getElementById('status-bar-resolution');
const statusBarLatency    = document.getElementById('status-bar-latency');

// Invite panel
const generateCodeBtn   = document.getElementById('generate-code-btn');
const inviteCodeDisplay = document.getElementById('invite-code-display');
const inviteLinkText    = document.getElementById('invite-link-text');
const copyLinkBtn       = document.getElementById('copy-link-btn');
const inviteExpire      = document.getElementById('invite-expire');
let inviteExpireTimer   = null;

// ===================================================
// LOGIN MODE TOGGLE
// ===================================================
function setLoginMode(mode) {
  currentLoginMode = mode;
  const isAgent = mode === 'agent';

  // Tab styles
  document.getElementById('tab-login-admin').style.background = isAgent ? 'none' : 'rgba(0,212,255,0.15)';
  document.getElementById('tab-login-admin').style.color      = isAgent ? 'rgba(255,255,255,0.4)' : '#00d4ff';
  document.getElementById('tab-login-agent').style.background = isAgent ? 'rgba(139,92,246,0.18)' : 'none';
  document.getElementById('tab-login-agent').style.color      = isAgent ? '#a78bfa' : 'rgba(255,255,255,0.4)';

  // Show/hide fields
  document.getElementById('field-admin-password').style.display = isAgent ? 'none' : 'block';
  document.getElementById('field-agent-username').style.display  = isAgent ? 'block' : 'none';
  document.getElementById('field-agent-password').style.display  = isAgent ? 'block' : 'none';

  // Update button & subtitle
  document.getElementById('login-btn').innerHTML = isAgent
    ? '<span>🤝</span> Login as Agent'
    : '<span>🔐</span> Login as Admin';
  document.getElementById('login-subtitle').textContent = isAgent ? 'Agent Login' : 'Admin Panel';

  document.getElementById('login-error').classList.add('hidden');
}

// ===================================================
// LOGIN
// ===================================================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');

  try {
    let res, data;

    if (currentLoginMode === 'admin') {
      const password = document.getElementById('admin-password').value;
      res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      data = await res.json();
      if (data.success) {
        authToken = data.token;
        loggedInRole = 'admin';
        loggedInAgentId = null;
        onLoginSuccess();
      } else {
        loginError.textContent = '❌ Incorrect admin password';
        loginError.classList.remove('hidden');
        document.getElementById('admin-password').value = '';
      }
    } else {
      // Agent login
      const username = document.getElementById('agent-username').value.trim();
      const password = document.getElementById('agent-password').value;
      if (!username || !password) {
        loginError.textContent = '❌ Please enter username and password';
        loginError.classList.remove('hidden');
        return;
      }
      res = await fetch('/api/agent/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      data = await res.json();
      if (data.success) {
        authToken = data.token;
        loggedInRole = 'agent';
        loggedInAgentId = data.agentId;
        onLoginSuccess(data.username);
      } else {
        loginError.textContent = '❌ ' + (data.message || 'Invalid username or password');
        loginError.classList.remove('hidden');
        document.getElementById('agent-password').value = '';
      }
    }
  } catch (err) {
    loginError.textContent = '❌ Server error. Is the server running?';
    loginError.classList.remove('hidden');
  }
});

function onLoginSuccess(agentUsername) {
  loginScreen.classList.add('hidden');
  adminApp.classList.remove('hidden');

  if (loggedInRole === 'agent') {
    // Hide admin-only tabs, show agent password tab
    document.getElementById('tab-agents').classList.add('hidden');
    document.getElementById('tab-password').classList.add('hidden');
    document.getElementById('tab-my-password').classList.remove('hidden');
    // Update navbar badge
    document.getElementById('role-badge').textContent = 'AGENT';
    document.getElementById('role-badge').style.background = 'linear-gradient(135deg,#8b5cf6,#6d28d9)';
  } else {
    document.getElementById('tab-agents').classList.remove('hidden');
    document.getElementById('tab-password').classList.remove('hidden');
    document.getElementById('tab-my-password').classList.add('hidden');
    document.getElementById('role-badge').textContent = 'ADMIN';
    document.getElementById('role-badge').style.background = '';
  }

  initSocket();
  startFpsCounter();
  loadSessions();
}

document.getElementById('admin-logout-btn').addEventListener('click', () => {
  if (socket) socket.disconnect();
  authToken = null;
  loggedInRole = null;
  loggedInAgentId = null;
  loginScreen.classList.remove('hidden');
  adminApp.classList.add('hidden');
  currentSessionId = null;
  viewerEmpty.classList.remove('hidden');
  viewerContainer.classList.add('hidden');
  // Reset login UI
  setLoginMode('admin');
  document.getElementById('admin-password').value = '';
  document.getElementById('agent-username').value = '';
  document.getElementById('agent-password').value = '';
});

// ===================================================
// SOCKET CONNECTION
// ===================================================
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    adminStatusBadge.textContent = '🟢 Connected';
    adminStatusBadge.style.color = '#10b981';
  });

  socket.on('disconnect', () => {
    adminStatusBadge.textContent = '🔴 Disconnected';
    adminStatusBadge.style.color = '#ef4444';
    toolbarStatus.textContent = 'Disconnected';
  });

  // Admin successfully connected to a session
  socket.on('admin:connected', ({ sessionId }) => {
    currentSessionId = sessionId;
    toolbarSessionId.textContent = `Session: ${sessionId}`;
    toolbarStatus.textContent = 'Waiting for agent...';
    viewerEmpty.classList.add('hidden');
    viewerContainer.classList.remove('hidden');
    canvasOverlay.style.display = 'flex';
    overlayMsg.innerHTML = '<div class="spin">🔄</div><span>Waiting for screen stream...</span>';
  });

  socket.on('admin:agent-ready', () => {
    canvasOverlay.style.display = 'none';
    toolbarStatus.textContent = 'Connected';
  });

  // Receive screen frame
  socket.on('admin:frame', ({ data, timestamp }) => {
    if (!data) return;
    frameCount++;

    // Calculate latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      statusBarLatency.textContent = `Latency: ${latency}ms`;
    }

    // Draw frame on canvas
    const img = new Image();
    img.onload = () => {
      // Set canvas resolution to match image on first frame
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvasNativeW = img.naturalWidth;
        canvasNativeH = img.naturalHeight;
        statusBarResolution.textContent = `Resolution: ${canvasNativeW}x${canvasNativeH}`;
      }
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${data}`;
  });

  socket.on('admin:agent-disconnected', () => {
    toolbarStatus.textContent = 'Agent disconnected';
    canvasOverlay.style.display = 'flex';
    overlayMsg.innerHTML = '❌ Agent disconnected';
    currentSessionId = null;
    loadSessions();
  });

  // A user's agent connected via our invite code
  socket.on('admin:agent-joined', ({ sessionId, code }) => {
    showToast(`✅ User connected! Code: ${code}`, 'success');
    loadSessions();
    // Auto-connect admin to this session
    connectToSession(sessionId);
  });

  socket.on('invite:created', ({ code }) => {
    const link = `${location.origin}/?code=${code}`;
    inviteCodeDisplay.textContent = code;
    inviteCodeDisplay.classList.remove('empty');
    inviteLinkText.textContent = link;
    inviteExpire.textContent = '⏱ Expires in 30:00';
    inviteExpire.classList.add('active');

    // Countdown timer
    clearInterval(inviteExpireTimer);
    let remaining = 30 * 60;
    inviteExpireTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(inviteExpireTimer);
        inviteExpire.textContent = 'Code expired';
        inviteExpire.classList.remove('active');
        inviteCodeDisplay.textContent = 'Expired';
        inviteCodeDisplay.classList.add('empty');
        inviteLinkText.textContent = 'Generate a new code';
        return;
      }
      const m = String(Math.floor(remaining / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      inviteExpire.textContent = `⏱ Expires in ${m}:${s}`;
    }, 1000);
  });

  socket.on('admin:error', ({ message }) => {
    showToast('Error: ' + message, 'error');
  });
}

// ===================================================
// FPS Counter
// ===================================================
function startFpsCounter() {
  fpsInterval = setInterval(() => {
    fpsBadge.textContent = `${frameCount} fps`;
    frameCount = 0;
  }, 1000);
}

// ===================================================
// SESSION MANAGEMENT
// ===================================================
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions', {
      headers: { 'x-admin-token': authToken }
    });
    const { sessions } = await res.json();
    renderSessionList(sessions);
  } catch (e) {
    console.error('Failed to load sessions:', e);
  }
}

function renderSessionList(sessions) {
  sessionCount.textContent = sessions.length;
  if (sessions.length === 0) {
    sessionsList.innerHTML = `
      <div class="no-sessions">
        <div>📡</div>
        <span>Waiting for users to connect</span>
      </div>`;
    return;
  }

  sessionsList.innerHTML = sessions.map(s => `
    <div class="session-item ${s.id === currentSessionId ? 'active-session' : ''}"
         id="session-item-${s.id}"
         onclick="connectToSession('${s.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="session-item-id">${s.id}</div>
        ${s.code ? `<span class="session-item-code">code: ${s.code}</span>` : ''}
      </div>
      <div class="session-item-meta">
        ${s.hasAdmin ? '👤 Admin connected' : '<span class="waiting-badge">⏳ Waiting</span>'} &nbsp;·&nbsp;
        ${new Date(s.connectedAt).toLocaleTimeString()}
      </div>
    </div>
  `).join('');
}

document.getElementById('refresh-sessions-btn').addEventListener('click', loadSessions);
setInterval(loadSessions, 5000); // Auto-refresh every 5s

// ===================================================
// GENERATE INVITE CODE
// ===================================================
generateCodeBtn.addEventListener('click', () => {
  if (!socket || !authToken) return;
  socket.emit('admin:create-invite', { token: authToken });
  generateCodeBtn.textContent = '⏳ Generating...';
  generateCodeBtn.disabled = true;
  setTimeout(() => {
    generateCodeBtn.textContent = '⚡ Generate Connection Code';
    generateCodeBtn.disabled = false;
  }, 1500);
});

copyLinkBtn.addEventListener('click', () => {
  const link = inviteLinkText.textContent;
  if (!link || link === 'Generate a code to get a link') return;
  navigator.clipboard.writeText(link).then(() => {
    copyLinkBtn.textContent = '✅';
    setTimeout(() => copyLinkBtn.textContent = '📋', 2000);
  });
});

// ===================================================
// CONNECT TO SESSION
// ===================================================
function connectToSession(id) {
  if (!socket || !authToken) return;
  socket.emit('admin:connect', { sessionId: id, token: authToken });
}

document.getElementById('viewer-disconnect-btn').addEventListener('click', () => {
  if (!socket) return;
  socket.emit('admin:disconnect-session');
  currentSessionId = null;
  viewerEmpty.classList.remove('hidden');
  viewerContainer.classList.add('hidden');
  toolbarStatus.textContent = 'Disconnected';
  loadSessions();
});

// ===================================================
// REMOTE CONTROL — MOUSE
// ===================================================
const canvasWrapper = document.getElementById('canvas-wrapper');

canvasWrapper.addEventListener('mousemove', (e) => {
  if (!mouseControlEnabled || !currentSessionId) return;
  const { x, y } = getCanvasCoords(e);
  statusBarCoords.textContent = `Mouse: (${Math.round(x)}, ${Math.round(y)})`;
  socket.emit('admin:mousemove', {
    x, y,
    screenW: canvasNativeW,
    screenH: canvasNativeH
  });
});

canvasWrapper.addEventListener('click', (e) => {
  if (!mouseControlEnabled || !currentSessionId) return;
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  socket.emit('admin:mouseclick', {
    x, y,
    screenW: canvasNativeW,
    screenH: canvasNativeH,
    button: 'left'
  });
});

canvasWrapper.addEventListener('dblclick', (e) => {
  if (!mouseControlEnabled || !currentSessionId) return;
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  // Double-click = two rapid clicks
  socket.emit('admin:mouseclick', { x, y, screenW: canvasNativeW, screenH: canvasNativeH, button: 'left' });
  setTimeout(() => {
    socket.emit('admin:mouseclick', { x, y, screenW: canvasNativeW, screenH: canvasNativeH, button: 'left' });
  }, 80);
});

canvasWrapper.addEventListener('contextmenu', (e) => {
  if (!mouseControlEnabled || !currentSessionId) return;
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  socket.emit('admin:rightclick', {
    x, y,
    screenW: canvasNativeW,
    screenH: canvasNativeH
  });
});

canvasWrapper.addEventListener('wheel', (e) => {
  if (!mouseControlEnabled || !currentSessionId) return;
  e.preventDefault();
  socket.emit('admin:scroll', { deltaY: e.deltaY });
}, { passive: false });

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvasNativeW / rect.width;
  const scaleY = canvasNativeH / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// ===================================================
// REMOTE CONTROL — KEYBOARD
// ===================================================
document.addEventListener('keydown', (e) => {
  if (!keyboardControlEnabled || !currentSessionId) return;
  // Don't capture when user is typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  e.preventDefault();
  socket.emit('admin:keypress', {
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey
  });
});

// ===================================================
// TOOLBAR CONTROLS
// ===================================================
const mouseControlBtn = document.getElementById('mouse-control-btn');
const keyboardControlBtn = document.getElementById('keyboard-control-btn');

mouseControlBtn.addEventListener('click', () => {
  mouseControlEnabled = !mouseControlEnabled;
  mouseControlBtn.classList.toggle('active', mouseControlEnabled);
  mouseControlBtn.classList.toggle('disabled', !mouseControlEnabled);
  canvasWrapper.style.cursor = mouseControlEnabled ? 'crosshair' : 'default';
  showToast(mouseControlEnabled ? '🖱️ Mouse control ON' : '🖱️ Mouse control OFF');
});

keyboardControlBtn.addEventListener('click', () => {
  keyboardControlEnabled = !keyboardControlEnabled;
  keyboardControlBtn.classList.toggle('active', keyboardControlEnabled);
  keyboardControlBtn.classList.toggle('disabled', !keyboardControlEnabled);
  showToast(keyboardControlEnabled ? '⌨️ Keyboard control ON' : '⌨️ Keyboard control OFF');
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    canvasWrapper.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

// ===================================================
// SIDEBAR TABS
// ===================================================
function switchTab(name) {
  ['sessions', 'agents', 'password', 'my-password'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === name);
    document.getElementById(`panel-${t}`)?.classList.toggle('active', t === name);
  });
  if (name === 'agents') loadAgents();
}

// ===================================================
// HELPERS
// ===================================================
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================================================
// AGENT MANAGEMENT
// ===================================================
let editingAgentId = null;

async function loadAgents() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/agents', { headers: { 'x-admin-token': authToken } });
    const data = await res.json();
    renderAgents(data.agents || []);
  } catch (e) { console.error('Failed to load agents:', e); }
}

function renderAgents(list) {
  const el = document.getElementById('ag-list');
  if (!list.length) {
    el.innerHTML = '<div class="ag-empty">No agents yet. Create one above.</div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="ag-item" id="ag-item-${a.id}">
      <div style="min-width:0">
        <div class="ag-name">🤝 ${escHtml(a.username)}</div>
        <div class="ag-meta">ID: ${a.id} &middot; ${new Date(a.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="ag-actions">
        <button class="ag-pwd-btn" onclick="openAgentPwdModal('${a.id}','${escHtml(a.username)}')">&#128273;</button>
        <button class="ag-del-btn" onclick="deleteAgent('${a.id}','${escHtml(a.username)}')">&#128465;</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('ag-create-btn').addEventListener('click', async () => {
  const username = document.getElementById('ag-username').value.trim();
  const password = document.getElementById('ag-password').value;
  const msg = document.getElementById('ag-msg');
  msg.className = 'ag-msg'; msg.textContent = '';
  if (!username || !password) { msg.className='ag-msg err'; msg.textContent='⚠️ Both fields required'; return; }
  if (username.length < 3)   { msg.className='ag-msg err'; msg.textContent='⚠️ Username min 3 chars'; return; }
  if (password.length < 4)   { msg.className='ag-msg err'; msg.textContent='⚠️ Password min 4 chars'; return; }
  try {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      msg.className = 'ag-msg ok';
      msg.textContent = `✅ Agent "${username}" created! Share login URL: /support.html`;
      document.getElementById('ag-username').value = '';
      document.getElementById('ag-password').value = '';
      loadAgents();
    } else { msg.className='ag-msg err'; msg.textContent='❌ '+data.message; }
  } catch (e) { msg.className='ag-msg err'; msg.textContent='❌ Server error'; }
});

async function deleteAgent(id, username) {
  if (!confirm(`Delete agent "${username}"?`)) return;
  try {
    const res = await fetch(`/api/agents/${id}`, { method: 'DELETE', headers: { 'x-admin-token': authToken } });
    const data = await res.json();
    if (data.success) { showToast(`🗑 Agent "${username}" deleted`, 'warn'); loadAgents(); }
    else showToast('❌ ' + data.message, 'error');
  } catch (e) { showToast('❌ Server error', 'error'); }
}

document.getElementById('ag-refresh-btn').addEventListener('click', loadAgents);

// Agent Password Modal
function openAgentPwdModal(id, username) {
  editingAgentId = id;
  document.getElementById('modal-agent-name').textContent = username;
  document.getElementById('modal-agent-pwd').value = '';
  document.getElementById('modal-agent-confirm').value = '';
  document.getElementById('modal-msg').textContent = '';
  document.getElementById('modal-msg').className = 'modal-msg';
  document.getElementById('agent-pwd-modal').classList.remove('hidden');
}
function closeAgentPwdModal() {
  document.getElementById('agent-pwd-modal').classList.add('hidden');
  editingAgentId = null;
}
document.getElementById('modal-cancel-btn').addEventListener('click', closeAgentPwdModal);
document.getElementById('agent-pwd-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAgentPwdModal(); });
document.getElementById('modal-save-btn').addEventListener('click', async () => {
  const pwd     = document.getElementById('modal-agent-pwd').value;
  const confirm = document.getElementById('modal-agent-confirm').value;
  const msg     = document.getElementById('modal-msg');
  msg.className = 'modal-msg'; msg.textContent = '';
  if (!pwd || !confirm)  { msg.className='modal-msg err'; msg.textContent='⚠️ Both fields required'; return; }
  if (pwd.length < 4)    { msg.className='modal-msg err'; msg.textContent='⚠️ Min 4 characters'; return; }
  if (pwd !== confirm)   { msg.className='modal-msg err'; msg.textContent='⚠️ Passwords do not match'; return; }
  try {
    const res = await fetch(`/api/agents/${editingAgentId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.success) { showToast('🔑 Agent password updated', 'success'); closeAgentPwdModal(); }
    else { msg.className='modal-msg err'; msg.textContent='❌ '+data.message; }
  } catch (e) { msg.className='modal-msg err'; msg.textContent='❌ Server error'; }
});

// ===================================================
// CHANGE PASSWORD
// ===================================================
document.getElementById('cp-save-btn').addEventListener('click', async () => {
  const current  = document.getElementById('cp-current').value;
  const newPass  = document.getElementById('cp-new').value;
  const confirm  = document.getElementById('cp-confirm').value;
  const msg      = document.getElementById('cp-msg');
  msg.className  = 'cp-msg';
  msg.textContent = '';

  if (!current || !newPass || !confirm) { msg.className = 'cp-msg err'; msg.textContent = '⚠️ All fields are required'; return; }
  if (newPass.length < 4) { msg.className = 'cp-msg err'; msg.textContent = '⚠️ New password must be at least 4 chars'; return; }
  if (newPass !== confirm) { msg.className = 'cp-msg err'; msg.textContent = '⚠️ Passwords do not match'; return; }

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass })
    });
    const data = await res.json();
    if (data.success) {
      msg.className = 'cp-msg ok';
      msg.textContent = '✅ Password changed successfully!';
      document.getElementById('cp-current').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
      showToast('🔑 Admin password updated', 'success');
    } else {
      msg.className = 'cp-msg err';
      msg.textContent = '❌ ' + data.message;
    }
  } catch (e) {
    msg.className = 'cp-msg err';
    msg.textContent = '❌ Server error';
  }
});

// ===================================================
// MY PASSWORD (agent changes own password)
// ===================================================
document.getElementById('my-cp-save-btn').addEventListener('click', async () => {
  const newPass  = document.getElementById('my-cp-new').value;
  const confirm  = document.getElementById('my-cp-confirm').value;
  const msg      = document.getElementById('my-cp-msg');
  msg.className  = 'cp-msg';
  msg.textContent = '';

  if (!newPass || !confirm) { msg.className = 'cp-msg err'; msg.textContent = '⚠️ Both fields are required'; return; }
  if (newPass.length < 4)   { msg.className = 'cp-msg err'; msg.textContent = '⚠️ New password must be at least 4 chars'; return; }
  if (newPass !== confirm)  { msg.className = 'cp-msg err'; msg.textContent = '⚠️ Passwords do not match'; return; }

  try {
    const res = await fetch(`/api/agents/${loggedInAgentId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
      body: JSON.stringify({ password: newPass })
    });
    const data = await res.json();
    if (data.success) {
      msg.className = 'cp-msg ok';
      msg.textContent = '✅ Password changed! Use the new password next time you log in.';
      document.getElementById('my-cp-new').value = '';
      document.getElementById('my-cp-confirm').value = '';
      showToast('🔑 Password updated', 'success');
    } else {
      msg.className = 'cp-msg err';
      msg.textContent = '❌ ' + data.message;
    }
  } catch (e) {
    msg.className = 'cp-msg err';
    msg.textContent = '❌ Server error';
  }
});

// ===================================================
// TOAST NOTIFICATIONS
// ===================================================
function showToast(msg, type = 'info') {
  const colors = {
    info: { bg: 'rgba(0,212,255,0.15)', border: 'rgba(0,212,255,0.3)', color: '#00d4ff' },
    error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' },
    warn: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' },
    success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', color: '#10b981' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: ${c.bg}; border: 1px solid ${c.border};
    color: ${c.color}; padding: 12px 24px; border-radius: 100px;
    font-size: 14px; font-weight: 500; z-index: 9999;
    backdrop-filter: blur(10px); white-space: nowrap;
    animation: fadeSlideDown 0.3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
