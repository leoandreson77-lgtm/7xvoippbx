/**
 * Dashboard Orchestrator
 * Wires together all dashboard components: SIP, WebSocket, Dialer, Call Controls.
 */
(function () {
  'use strict';

  // ── Auth Check ──────────────────────────────────
  const authToken = sessionStorage.getItem('authToken');
  const agentData = JSON.parse(sessionStorage.getItem('agent') || 'null');
  const extensionData = JSON.parse(sessionStorage.getItem('extension') || 'null');

  if (!authToken || !agentData) {
    window.location.href = '/';
    return;
  }

  // ── DOM References ──────────────────────────────
  const agentNameEl = document.getElementById('agentName');
  const agentNameFullEl = document.getElementById('agentNameFull');
  const agentAvatarEl = document.getElementById('agentAvatar');
  const agentRoleEl = document.getElementById('agentRole');
  const extensionDisplayEl = document.getElementById('extensionDisplay');
  const dialerExtensionEl = document.getElementById('dialerExtension');
  const statusDotEl = document.getElementById('statusDot');
  const statusTextEl = document.getElementById('statusText');
  const sipStatusTextEl = document.getElementById('sipStatusText');
  const sipServerDisplayEl = document.getElementById('sipServerDisplay');
  const wsStatusDisplayEl = document.getElementById('wsStatusDisplay');
  const fsStatusDisplayEl = document.getElementById('fsStatusDisplay');
  const retryBtn = document.getElementById('retryBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const callListEl = document.getElementById('callList');
  const statCallsEl = document.getElementById('statCalls');
  const statDurationEl = document.getElementById('statDuration');
  const hangupBtn = document.getElementById('hangupBtn');

  // ── Initialize UI with agent data ───────────────
  agentNameEl.textContent = agentData.name.split(' ')[0];
  agentNameFullEl.textContent = agentData.name;
  agentAvatarEl.textContent = agentData.name.charAt(0).toUpperCase();
  agentRoleEl.textContent = agentData.role;
  extensionDisplayEl.textContent = extensionData?.number || '—';
  dialerExtensionEl.textContent = `Extension ${extensionData?.number || '—'}`;

  const agentTfnDisplayEl = document.getElementById('agentTfnDisplay');

  // Fetch full profile to get assigned TFN info
  (async function loadProfile() {
    try {
      const res = await fetch('/api/agent/profile', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        const profile = await res.json();
        if (profile.extension?.tfn) {
          if (agentTfnDisplayEl) agentTfnDisplayEl.textContent = `TFN: ${profile.extension.tfn.number} (${profile.extension.tfn.label || 'Assigned'})`;
        } else if (agentTfnDisplayEl) {
          agentTfnDisplayEl.textContent = 'TFN: Default Trunk DID';
        }
      }
    } catch { /* ignore */ }
  })();

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn && agentData.role === 'admin') {
    adminBtn.style.display = 'inline-flex';
  }

  setStatus('CONNECTING', 'Connecting...');

  // ── Initialize Components ───────────────────────
  const sipClient = new SipClient();
  const wsClient = new WsClient();
  sipClient.setWsClient(wsClient);
  const dialer = new Dialer();
  const callControls = new CallControls(sipClient);

  // ── SIP Event Handlers ──────────────────────────

  sipClient.on('registered', () => {
    sipStatusTextEl.textContent = 'Registered';
    sipStatusTextEl.style.color = 'var(--success)';
    fsStatusDisplayEl.textContent = 'Active (WebRTC)';
    fsStatusDisplayEl.style.color = 'var(--success)';
    setStatus('ONLINE', 'Online');
    retryBtn.style.display = 'none';
    updateAgentStatus('ONLINE');
  });

  sipClient.on('unregistered', () => {
    sipStatusTextEl.textContent = 'Unregistered';
    sipStatusTextEl.style.color = 'var(--text-muted)';
    if (!sipClient.isInCall()) {
      setStatus('OFFLINE', 'Offline');
    }
  });

  sipClient.on('registrationFailed', (data) => {
    sipStatusTextEl.textContent = 'Registration Failed';
    sipStatusTextEl.style.color = 'var(--danger)';
    setStatus('OFFLINE', 'Registration Failed');
    retryBtn.style.display = 'block';
    console.error('SIP registration failed:', data.cause);
  });

  sipClient.on('connected', () => {
    fsStatusDisplayEl.textContent = 'Connected';
    fsStatusDisplayEl.style.color = 'var(--success)';
  });

  sipClient.on('disconnected', () => {
    fsStatusDisplayEl.textContent = 'Disconnected';
    fsStatusDisplayEl.style.color = 'var(--danger)';
    sipStatusTextEl.textContent = 'Disconnected';
    sipStatusTextEl.style.color = 'var(--danger)';
    setStatus('OFFLINE', 'Disconnected');
    retryBtn.style.display = 'block';
  });

  sipClient.on('incoming', (data) => {
    setStatus('RINGING', 'Incoming Call');
    callControls.showIncomingCall(data.callerNumber, data.callerName);
  });

  sipClient.on('calling', (data) => {
    setStatus('RINGING', 'Calling...');
    callControls.showActiveCall(data.target, 'Calling...');
  });

  sipClient.on('progress', () => {
    // Ringing on remote side
  });

  sipClient.on('accepted', (data) => {
    const target = data?.target || sipClient.activeCallTarget || 'Connected';
    setStatus('IN_CALL', 'In Call');
    callControls.showActiveCall(target, 'In Conversation');
    callControls.startTimer();
    updateAgentStatus('IN_CALL');
  });

  sipClient.on('confirmed', (data) => {
    const target = data?.target || sipClient.activeCallTarget || 'Connected';
    setStatus('IN_CALL', 'In Call');
    callControls.showActiveCall(target, 'In Conversation');
    callControls.startTimer();
    updateAgentStatus('IN_CALL');
  });

  sipClient.on('ended', () => {
    setStatus('ONLINE', 'Online');
    callControls.hideActiveCall();
    callControls.hideIncomingCall();
    dialer.clear();
    updateAgentStatus('ONLINE');
    loadRecentCalls();
  });

  sipClient.on('failed', (data) => {
    setStatus('ONLINE', 'Online');
    callControls.hideActiveCall();
    callControls.hideIncomingCall();
    console.warn('Call failed:', data.cause, data.message);
    updateAgentStatus('ONLINE');
  });

  sipClient.on('held', () => {
    setStatus('ON_HOLD', 'On Hold');
    updateAgentStatus('ON_HOLD');
  });

  sipClient.on('resumed', () => {
    setStatus('IN_CALL', 'In Call');
    updateAgentStatus('IN_CALL');
  });

  sipClient.on('error', (data) => {
    console.error('SIP error:', data.message);
  });

  // ── WebSocket Event Handlers ────────────────────

  wsClient.on('connected', () => {
    wsStatusDisplayEl.textContent = 'Connected';
    wsStatusDisplayEl.style.color = 'var(--success)';
  });

  wsClient.on('disconnected', () => {
    wsStatusDisplayEl.textContent = 'Disconnected';
    wsStatusDisplayEl.style.color = 'var(--danger)';
  });

  wsClient.on('registration_status', (data) => {
    if (data.registered) {
      sipStatusTextEl.textContent = 'Registered';
      sipStatusTextEl.style.color = 'var(--success)';
    } else {
      sipStatusTextEl.textContent = data.error || 'Unregistered';
      sipStatusTextEl.style.color = 'var(--danger)';
    }
  });

  wsClient.on('agent_status_changed', (data) => {
    setStatus(data.status, formatStatusText(data.status));
  });

  wsClient.on('call_ended', () => {
    loadRecentCalls();
  });

  // ── Dialer: Make Call ───────────────────────────
  dialer.setOnCall((number) => {
    if (!sipClient.isRegistered()) {
      alert('SIP not registered. Cannot make calls.');
      return;
    }
    sipClient.call(number);
  });

  // ── Hangup from dialer area ─────────────────────
  hangupBtn.addEventListener('click', () => {
    sipClient.hangup();
  });

  // ── Retry Registration ──────────────────────────
  retryBtn.addEventListener('click', () => {
    retryBtn.style.display = 'none';
    initSipRegistration();
  });

  // ── Logout ──────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    // If in active call, confirm
    if (sipClient.isInCall()) {
      if (!confirm('You have an active call. Logging out will end the call. Continue?')) {
        return;
      }
    }

    // 1. Disconnect SIP
    sipClient.disconnect();

    // 2. Disconnect WebSocket
    wsClient.disconnect();

    // 3. Call logout API
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
    } catch {
      // Best effort
    }

    // 4. Clear session
    sessionStorage.clear();

    // 5. Redirect
    window.location.href = '/';
  });

  // ── Status Helpers ──────────────────────────────
  function setStatus(status, text) {
    statusTextEl.textContent = text;
    statusDotEl.className = 'status-dot';

    switch (status) {
      case 'ONLINE':
        statusDotEl.classList.add('online');
        break;
      case 'RINGING':
        statusDotEl.classList.add('ringing');
        break;
      case 'IN_CALL':
        statusDotEl.classList.add('in-call');
        break;
      case 'ON_HOLD':
        statusDotEl.classList.add('ringing');
        break;
      case 'CONNECTING':
        statusDotEl.classList.add('ringing');
        break;
      default:
        statusDotEl.classList.add('offline');
    }
  }

  function formatStatusText(status) {
    const map = {
      OFFLINE: 'Offline',
      CONNECTING: 'Connecting...',
      ONLINE: 'Online',
      RINGING: 'Ringing',
      IN_CALL: 'In Call',
      ON_HOLD: 'On Hold',
    };
    return map[status] || status;
  }

  async function updateAgentStatus(status) {
    try {
      await fetch('/api/agent/status', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Best effort
    }
  }

  // ── Load Recent Calls ───────────────────────────
  async function loadRecentCalls() {
    try {
      const response = await fetch('/api/agent/calls?limit=15', {
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      if (!response.ok) return;
      const calls = await response.json();

      if (calls.length === 0) {
        callListEl.innerHTML = `
          <div class="call-item" style="justify-content: center; color: var(--text-muted); font-size: var(--font-sm);">
            No recent calls
          </div>`;
        return;
      }

      let totalDuration = 0;
      callListEl.innerHTML = calls.map((call) => {
        totalDuration += call.duration || 0;
        const icon = call.direction === 'outbound' ? '📤' : '📥';
        const statusIcon = call.status === 'answered' ? '' :
          call.status === 'missed' ? ' ❌' : call.status === 'rejected' ? ' 🚫' : ' ⚠';
        const number = call.direction === 'outbound' ? call.calleeNumber : call.callerNumber;
        const time = new Date(call.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durMin = Math.floor((call.duration || 0) / 60);
        const durSec = (call.duration || 0) % 60;
        const duration = call.duration > 0 ? `${durMin}:${durSec.toString().padStart(2, '0')}` : '—';

        return `
          <div class="call-item">
            <div class="call-direction">${icon}</div>
            <div class="call-info">
              <div class="call-number">${number}${statusIcon}</div>
              <div class="call-time">${time}</div>
            </div>
            <div class="call-duration">${duration}</div>
          </div>`;
      }).join('');

      statCallsEl.textContent = calls.length;
      const totalMin = Math.floor(totalDuration / 60);
      statDurationEl.textContent = totalMin > 0 ? `${totalMin}m` : `${totalDuration}s`;
    } catch {
      // Silent fail
    }
  }

  // ── Initialize SIP Registration ─────────────────
  async function initSipRegistration() {
    setStatus('CONNECTING', 'Connecting...');
    sipStatusTextEl.textContent = 'Connecting...';
    sipStatusTextEl.style.color = 'var(--text-muted)';

    try {
      const response = await fetch('/api/auth/sip-credentials', {
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired
          sessionStorage.clear();
          window.location.href = '/';
          return;
        }
        throw new Error('Failed to get SIP credentials');
      }

      const creds = await response.json();

      sipServerDisplayEl.textContent = creds.wsUrl.replace('wss://', '').replace('ws://', '');
      sipClient.stunServer = creds.stunServer;

      sipClient.connect({
        wsUrl: creds.wsUrl,
        sipUri: creds.sipUri,
        sipUsername: creds.sipUsername,
        ha1: creds.ha1,
        realm: creds.realm,
        displayName: creds.displayName,
        stunServer: creds.stunServer,
      });
    } catch (err) {
      console.error('SIP initialization failed:', err);
      sipStatusTextEl.textContent = 'Init Failed';
      sipStatusTextEl.style.color = 'var(--danger)';
      setStatus('OFFLINE', 'Initialization Failed');
      retryBtn.style.display = 'block';
    }
  }

  // ── Startup Sequence ────────────────────────────
  (async function startup() {
    // 1. Connect backend WebSocket
    wsClient.connect(authToken);

    // 2. Initialize SIP registration
    await initSipRegistration();

    // 3. Load recent calls
    loadRecentCalls();
  })();

  // ── Handle page unload ──────────────────────────
  window.addEventListener('beforeunload', () => {
    sipClient.disconnect();
    wsClient.disconnect();
  });
})();
