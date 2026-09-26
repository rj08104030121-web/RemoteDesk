/**
 * User Page JavaScript
 * Connects to the server and displays session ID (relayed from agent)
 */

const socket = io();
let sessionId = null;
let authToken = null;

// --- Panel Management ---
const panels = {
  connecting: document.getElementById('panel-connecting'),
  start: document.getElementById('panel-start'),
  waiting: document.getElementById('panel-waiting'),
  active: document.getElementById('panel-active'),
};

function showPanel(name) {
  Object.values(panels).forEach(p => p.classList.add('hidden'));
  if (panels[name]) panels[name].classList.remove('hidden');
}

// --- Status Badge ---
const statusBadge = document.getElementById('connection-status-badge');

function setStatus(text, color = '') {
  statusBadge.textContent = text;
  statusBadge.style.color = color || '';
}

// --- Socket Events ---
socket.on('connect', () => {
  setStatus('🟢 Connected to Server', '#10b981');
  showPanel('start');
});

socket.on('disconnect', () => {
  setStatus('🔴 Disconnected', '#ef4444');
  showPanel('connecting');
  sessionId = null;
});

// The browser page doesn't run the agent itself — it just shows status.
// The agent.js runs separately and registers the session.
// For convenience, we allow this browser page to simulate the session display
// by receiving a session ID from the server if it was already registered via agent.

// Listen for session registration (in case user opens browser alongside agent)
socket.on('agent:registered', ({ sessionId: id }) => {
  sessionId = id;
  document.getElementById('session-id-text').textContent = id;
  document.getElementById('session-id-waiting').textContent = id;
  document.getElementById('session-id-active').textContent = id;
  document.getElementById('session-display').classList.remove('hidden');
  showPanel('waiting');
});

socket.on('agent:admin-connected', () => {
  showPanel('active');
  setStatus('🔴 Admin Connected — Session Active', '#ef4444');
});

socket.on('agent:admin-disconnected', () => {
  showPanel('waiting');
  setStatus('🟢 Connected to Server', '#10b981');
});

socket.on('agent:ready', () => {
  // ready signal from this side
});

// --- Button Handlers ---

document.getElementById('request-session-btn').addEventListener('click', () => {
  // In browser mode, we register the browser as an "agent-lite" for demo
  // Real agent is node agent.js running separately
  socket.emit('agent:register');
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Session ID copied!');
  }).catch(() => {
    prompt('Copy this Session ID:', text);
  });
}

document.getElementById('copy-session-btn')?.addEventListener('click', () => {
  if (sessionId) copyToClipboard(sessionId);
});

document.getElementById('copy-waiting-btn')?.addEventListener('click', () => {
  if (sessionId) copyToClipboard(sessionId);
});

document.getElementById('cancel-session-btn')?.addEventListener('click', () => {
  socket.disconnect();
  socket.connect();
  showPanel('start');
  sessionId = null;
  setStatus('🟢 Connected', '#10b981');
});

document.getElementById('disconnect-btn')?.addEventListener('click', () => {
  socket.emit('admin:disconnect-session');
  showPanel('waiting');
  setStatus('🟢 Connected to Server', '#10b981');
});

// --- Toast ---
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.3);
    color: #00d4ff; padding: 12px 24px; border-radius: 100px;
    font-size: 14px; font-weight: 500; z-index: 999;
    animation: fadeSlideDown 0.3s ease;
    backdrop-filter: blur(10px);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
