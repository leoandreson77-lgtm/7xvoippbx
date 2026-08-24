/**
 * KRAD Global Enterprise Admin Dashboard Logic
 * Modular Tab Routing, Extension Management, CDR Report (Flyzytrip style), Supervisor Actions, and Multi-SIP Provider Trunks.
 */
(function () {
  'use strict';

  window.adminLogout = function () {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' },
      });
    } catch { /* ignore */ }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.replace('/');
  };

  function getHeaders() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const h = { 'Content-Type': 'application/json' };
    if (token && token !== 'null') {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  // ── Safe DOM Helpers & Modal Manager ────────────
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      el.classList.add('visible');
      el.style.display = 'flex';
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.classList.remove('visible');
      el.style.display = 'none';
    }
  }

  window.openModal = openModal;
  window.closeModal = closeModal;

  function addClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // Register Modal & Mobile Nav Trigger Buttons
  addClick('openCreateExtModalBtn', () => openModal('modalCreateExt'));
  addClick('openCreateTfnModalBtn', () => openModal('modalCreateTfn'));
  addClick('openCreateTrunkModalBtn', () => openModal('modalCreateTrunk'));
  addClick('openCreateAgentModalBtn', () => openModal('modalCreateAgent'));

  // Mobile Sidebar Toggle
  addClick('mobileNavToggle', () => {
    const sidebar = document.querySelector('.admin-sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('active');
  });

  addClick('sidebarBackdrop', () => {
    const sidebar = document.querySelector('.admin-sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  });

  // Admin Sign Out Event Handler
  window.adminLogout = async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: getHeaders() });
    } catch { /* ignore */ }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };
  addClick('adminLogoutBtn', window.adminLogout);

  // ── Custom Confirm Dialog Manager ───────────────
  let pendingConfirmAction = null;

  function showConfirmDialog(options = {}) {
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const iconBadge = document.querySelector('.confirm-icon-badge');

    if (titleEl) titleEl.textContent = options.title || 'Confirm Action';
    if (msgEl) msgEl.innerHTML = options.message || 'Are you sure you want to proceed?';
    if (okBtn) okBtn.textContent = options.okText || 'Confirm';
    if (iconBadge && options.icon) iconBadge.textContent = options.icon;

    pendingConfirmAction = options.onConfirm || null;
    openModal('modalConfirmDialog');
  }

  addClick('confirmCancelBtn', () => {
    pendingConfirmAction = null;
    closeModal('modalConfirmDialog');
  });

  addClick('confirmOkBtn', async () => {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    closeModal('modalConfirmDialog');
    if (action && typeof action === 'function') {
      await action();
    }
  });

  window.showConfirmDialog = showConfirmDialog;

  // Global Modal Close Delegation
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const modalId = closeBtn.getAttribute('data-close');
      closeModal(modalId);
      return;
    }
    const modalClose = e.target.closest('.modal-close');
    if (modalClose) {
      const modal = modalClose.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
      closeModal(e.target.id);
    }
  });

  function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function showError(el, msg) {
    if (!el) {
      showToast(msg, 'error');
      return;
    }
    el.textContent = msg;
    el.style.display = 'block';
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      alert(msg);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }



  // ── State Storage ───────────────────────────────
  let allExtensions = [];
  let allTfns = [];
  let allTrunks = [];
  let allAgents = [];

  // ── Page Titles & Subtitles for Tabs ────────────
  const tabMetadata = {
    overview: {
      title: 'System Overview',
      subtitle: 'Real-time health, active channels, and platform metrics',
    },
    extensions: {
      title: 'Extension Management',
      subtitle: 'Provision, assign TFN caller IDs, configure locations & supervisor controls',
    },
    cdr: {
      title: 'CDR — Call History Report',
      subtitle: 'Inspect call records, dispositions, answer times, and export CSV reports',
    },
    tfns: {
      title: 'Toll-Free Numbers (TFN) & DIDs',
      subtitle: 'Manage inbound numbers and assign campaigns to agents',
    },
    trunks: {
      title: 'Multiple SIP Trunks & Providers',
      subtitle: 'Manage Telnyx, Twilio, VoIP.ms, Airtel, or custom SIP gateways',
    },
    agents: {
      title: 'Team & Agent Roster',
      subtitle: 'Manage agent profiles, credentials, and access roles',
    },
  };

  // ── Tab Switching Logic ─────────────────────────
  window.switchTab = function (tabId) {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });

    const meta = tabMetadata[tabId] || tabMetadata.overview;
    setTxt('pageTitle', meta.title);
    setTxt('pageSubtitle', meta.subtitle);

    // Sync overview stats & badges on every tab switch
    loadOverviewStats();

    // Trigger specific data loads on tab switch
    if (tabId === 'overview') {
      loadOverviewStats();
      loadTrunks();
      loadExtensions();
      loadTfns();
      loadAgents();
    } else if (tabId === 'extensions') {
      loadExtensions();
      loadUnassignedAgentsDropdown();
      loadTfnsDropdown();
    } else if (tabId === 'cdr') {
      loadCdrReport();
      loadCdrExtensionsDropdown();
    } else if (tabId === 'tfns') {
      loadTfns();
      loadTrunksDropdown();
    } else if (tabId === 'agents') {
      loadAgents();
    } else if (tabId === 'trunks') {
      loadTrunks();
    }
  };

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      if (tab) window.switchTab(tab);
    });
  });

  // ── Modal Handlers ──────────────────────────────
  window.openModal = openModal;
  window.closeModal = closeModal;

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  addClick('openCreateExtModalBtn', () => {
    openModal('modalCreateExt');
    loadUnassignedAgentsDropdown();
    loadTfnsDropdown();
  });

  addClick('openCreateTfnModalBtn', () => {
    openModal('modalCreateTfn');
    loadTrunksDropdown();
  });

  addClick('openCreateTrunkModalBtn', () => {
    openModal('modalCreateTrunk');
  });

  addClick('openCreateAgentModalBtn', () => {
    openModal('modalCreateAgent');
  });

  // Close on outside click
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ── Provider Presets in Add Trunk Modal ─────────
  const newTrunkProviderEl = document.getElementById('newTrunkProvider');
  const newTrunkHostEl = document.getElementById('newTrunkHost');
  const newTrunkPortEl = document.getElementById('newTrunkPort');
  const newTrunkNameEl = document.getElementById('newTrunkName');

  const providerPresets = {
    telnyx: { host: 'sip.telnyx.com', port: 5060, name: 'Telnyx Primary Trunk' },
    twilio: { host: 'pstn.twilio.com', port: 5060, name: 'Twilio Elastic SIP Trunk' },
    voipms: { host: 'sip.voip.ms', port: 5060, name: 'VoIP.ms Gateway' },
    bandwidth: { host: 'sip.bandwidth.com', port: 5060, name: 'Bandwidth Trunk' },
    generic: { host: '', port: 5060, name: 'Custom SIP Provider' },
  };

  if (newTrunkProviderEl) {
    newTrunkProviderEl.addEventListener('change', (e) => {
      const preset = providerPresets[e.target.value] || providerPresets.generic;
      if (newTrunkHostEl && preset.host) newTrunkHostEl.value = preset.host;
      if (newTrunkPortEl) newTrunkPortEl.value = preset.port;
      if (newTrunkNameEl && !newTrunkNameEl.value) newTrunkNameEl.value = preset.name;
    });
  }

  // ── Logout ──────────────────────────────────────
  addClick('adminLogoutBtn', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: getHeaders() });
    } catch { /* ignore */ }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  });

  // ── Overview & Stats ────────────────────────────
  async function loadOverviewStats() {
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const stats = await res.json();
      setTxt('statTotalAgents', stats.totalAgents || 0);
      setTxt('statTotalExtensions', stats.totalExtensions || 0);
      setTxt('statActiveChannels', stats.activeChannels || 0);
      setTxt('statOnlineAgentsText', `${stats.onlineAgents || 0} Active now`);
      setTxt('badgeExtCount', stats.totalExtensions || 0);
      setTxt('badgeAgentCount', stats.totalAgents || 0);
    } catch { /* ignore */ }
  }

  // ── Extensions Management ───────────────────────
  const extensionsTable = document.getElementById('extensionsTable');
  const searchExtensionsInput = document.getElementById('searchExtensionsInput');

  async function loadExtensions() {
    try {
      const res = await fetch('/api/admin/extensions', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allExtensions = await res.json();
      renderExtensions(allExtensions);
      setTxt('badgeExtCount', allExtensions.length);
    } catch { /* ignore */ }
  }

  function renderExtensions(list) {
    const gridEl = document.getElementById('extensionsGrid');
    if (gridEl) {
      if (list.length === 0) {
        gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: var(--space-8);">No extensions found</div>';
      } else {
        gridEl.innerHTML = list.map((ext) => {
          const agentName = ext.agent ? ext.agent.name : '— Unassigned —';
          const tfnDisplay = ext.tfn ? ext.tfn.number : 'Default DID';
          const regStatus = ext.liveRegistered || ext.registered;
          const statusBadge = regStatus
            ? '<span class="badge badge-success"><span class="status-dot online" style="margin-right:4px;"></span>Registered</span>'
            : '<span class="badge badge-danger">Offline</span>';

          return `
            <div class="entity-card">
              <div class="entity-card-header">
                <div class="entity-card-title">
                  <span>📞 Ext ${ext.number}</span>
                </div>
                ${statusBadge}
              </div>
              <div class="entity-card-body">
                <div class="entity-card-row">
                  <span class="entity-card-label">Assigned Agent</span>
                  <span class="entity-card-value">${agentName}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Outbound DID / TFN</span>
                  <span class="entity-card-value" style="color: var(--accent-light);">${tfnDisplay}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Receive Mode</span>
                  <span class="badge badge-info">${ext.callsReceiveOn || 'Extension'}</span>
                </div>
              </div>
              <div class="entity-card-actions">
                <button class="btn btn-ghost" style="padding: 4px 10px; font-size: 12px; color: var(--accent-light); border: 1px solid rgba(99, 102, 241, 0.4);" onclick="window.viewSipCredentials('${ext.number}', '${ext.number}', '${ext.sipPassword || 'Agent@123'}', '${ext.tfn ? ext.tfn.number : ''}')">🔑 SIP Config</button>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-action-control" onclick="window.openSupervisorModal('${ext.id}')">⚙️ Control</button>
                  <button class="btn btn-action-delete" onclick="window.adminDeleteExt('${ext.id}', '${ext.number}', this)">🗑️</button>
                </div>
              </div>
            </div>`;
        }).join('');
      }
    }

    if (!extensionsTable) return;
    if (list.length === 0) {
      extensionsTable.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">No extensions found</td></tr>';
      return;
    }

    extensionsTable.innerHTML = list.map((ext) => {
      const agentName = ext.agent ? `<div style="display: flex; align-items: center;"><span class="agent-avatar-sm">${ext.agent.name.charAt(0)}</span><strong>${ext.agent.name}</strong></div>` : '<span style="color: var(--text-muted);">— Unassigned —</span>';
      const tfnDisplay = ext.tfn ? `<span class="tfn-tag">${ext.tfn.number}</span>` : '<span style="color: var(--text-muted);">Default DID</span>';
      const regStatus = ext.liveRegistered || ext.registered;
      const statusBadge = regStatus
        ? '<span class="badge badge-success"><span class="status-dot online" style="margin-right:4px;"></span>Registered</span>'
        : '<span class="badge badge-danger">Offline</span>';

      const receiveMode = `<span class="badge badge-info">${ext.callsReceiveOn || 'Extension'}</span>`;

      return `
        <tr>
          <td><strong style="font-size: var(--font-base); font-family: monospace; color: var(--text-primary);">${ext.number}</strong></td>
          <td>${agentName}</td>
          <td>${tfnDisplay}</td>
          <td>${receiveMode}</td>
          <td>${statusBadge}</td>
          <td>
            <label class="toggle">
              <input type="checkbox" ${ext.enabled ? 'checked' : ''} onchange="window.adminToggleExt('${ext.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </td>
          <td>
            <div style="display: flex; gap: var(--space-2);">
              <button class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: var(--accent-light); border: 1px solid rgba(99, 102, 241, 0.4);" onclick="window.viewSipCredentials('${ext.number}', '${ext.number}', '${ext.sipPassword || 'Agent@123'}', '${ext.tfn ? ext.tfn.number : ''}')">🔑 SIP Config</button>
              <button class="btn btn-action-control" onclick="window.openSupervisorModal('${ext.id}')">⚙️ Control</button>
              <button class="btn btn-action-delete" onclick="window.adminDeleteExt('${ext.id}', '${ext.number}', this)">🗑️ Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  if (searchExtensionsInput) {
    searchExtensionsInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allExtensions.filter((ext) =>
        ext.number.includes(q) ||
        (ext.agent && ext.agent.name.toLowerCase().includes(q)) ||
        (ext.tfn && ext.tfn.number.includes(q))
      );
      renderExtensions(filtered);
    });
  }

  async function loadUnassignedAgentsDropdown() {
    try {
      const res = await fetch('/api/admin/agents', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const agents = await res.json();
      const select = document.getElementById('newExtAgent');
      if (!select) return;

      select.innerHTML = '<option value="">— None (Unassigned) —</option>';
      agents
        .filter((a) => !a.extension && a.role === 'agent')
        .forEach((a) => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.name} (${a.email})`;
          select.appendChild(opt);
        });
    } catch { /* ignore */ }
  }

  async function loadTfnsDropdown() {
    const select = document.getElementById('newExtTfn');
    if (!select) return;

    let tfns = allTfns;
    try {
      const res = await fetch('/api/admin/tfns', { credentials: 'include', headers: getHeaders() });
      if (res.ok) {
        tfns = await res.json();
        allTfns = tfns;
      }
    } catch { /* use cached allTfns */ }

    select.innerHTML = '<option value="">— Default Trunk DID —</option>';
    if (tfns && tfns.length > 0) {
      tfns.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.number} (${t.label || 'TFN'})`;
        select.appendChild(opt);
      });
    }
  }

  addClick('submitCreateExtBtn', async () => {
    const numberEl = document.getElementById('newExtNumber');
    const passEl = document.getElementById('newExtPassword');
    const agentEl = document.getElementById('newExtAgent');
    const tfnEl = document.getElementById('newExtTfn');
    const createExtError = document.getElementById('createExtError');

    const number = numberEl ? numberEl.value.trim() : '';
    const sipPassword = passEl ? passEl.value : '';
    const agentId = agentEl && agentEl.value ? agentEl.value : undefined;
    const tfnId = tfnEl && tfnEl.value ? tfnEl.value : undefined;

    if (!number || number.length < 3) {
      showError(createExtError, 'Extension number required (3-6 digits)');
      return;
    }
    if (!sipPassword || sipPassword.length < 6) {
      showError(createExtError, 'SIP password required (min 6 chars)');
      return;
    }

    try {
      const res = await fetch('/api/admin/extensions', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ number, sipPassword, agentId, tfnId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create extension');

      closeModal('modalCreateExt');
      loadExtensions();
      loadOverviewStats();
    } catch (err) {
      showError(createExtError, err.message);
    }
  });

  window.adminToggleExt = async function (id, enabled) {
    try {
      await fetch(`/api/admin/extensions/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      });
    } catch { /* ignore */ }
  };

  window.adminDeleteExt = function (id, number, btnEl) {
    showConfirmDialog({
      title: 'Delete Extension',
      message: `Are you sure you want to delete Extension <strong style="color: var(--accent-light); font-family: monospace;">${number}</strong>?`,
      icon: '🗑️',
      okText: 'Yes, Delete',
      onConfirm: async () => {
        const row = btnEl ? btnEl.closest('tr') : null;
        if (row) row.style.opacity = '0.3';
        try {
          const res = await fetch(`/api/admin/extensions/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: getHeaders(),
          });
          const data = await res.json();
          if (!res.ok) {
            if (row) row.style.opacity = '1';
            showToast(data.error || 'Failed to delete extension', 'error');
            return;
          }
          showToast(`✓ Extension ${number} deleted successfully`, 'success');
          await loadExtensions();
          await loadOverviewStats();
        } catch (err) {
          if (row) row.style.opacity = '1';
          showToast('Error deleting extension: ' + err.message, 'error');
        }
      },
    });
  };

  // ── Supervisor & Extension Control ───────────────
  let activeExtRecord = null;

  window.openSupervisorModal = async function (extId) {
    const ext = allExtensions.find((e) => e.id === extId);
    if (!ext) return;
    activeExtRecord = ext;

    const supExtId = document.getElementById('supExtId');
    const supExtNumber = document.getElementById('supExtNumber');
    const supExtPassword = document.getElementById('supExtPassword');
    const supMaxLocations = document.getElementById('supMaxLocations');
    const supCallsReceiveOn = document.getElementById('supCallsReceiveOn');
    const supCallerIdSelect = document.getElementById('supCallerIdSelect');

    if (supExtId) supExtId.value = ext.id;
    if (supExtNumber) supExtNumber.value = ext.number;
    if (supExtPassword) supExtPassword.value = 'Ext' + ext.number + '@Sip';
    if (supMaxLocations) supMaxLocations.value = ext.maxLoginLocations || 1;
    if (supCallsReceiveOn) supCallsReceiveOn.value = ext.callsReceiveOn || 'Extension';

    if (supCallerIdSelect) {
      supCallerIdSelect.innerHTML = '<option value="">— Default Trunk DID —</option>';
      allTfns.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.number} (${t.label || 'TFN'})`;
        if (ext.tfnId === t.id) opt.selected = true;
        supCallerIdSelect.appendChild(opt);
      });
    }

    openModal('modalSupervisorExt');
  };

  addClick('supTogglePassBtn', () => {
    const supExtPassword = document.getElementById('supExtPassword');
    const supTogglePassBtn = document.getElementById('supTogglePassBtn');
    if (!supExtPassword) return;
    const isPass = supExtPassword.type === 'password';
    supExtPassword.type = isPass ? 'text' : 'password';
    if (supTogglePassBtn) supTogglePassBtn.textContent = isPass ? '🙈' : '👁';
  });

  addClick('copyExtNumBtn', () => {
    const supExtNumber = document.getElementById('supExtNumber');
    if (supExtNumber) {
      navigator.clipboard.writeText(supExtNumber.value);
      alert(`Copied Extension ${supExtNumber.value} to clipboard!`);
    }
  });

  addClick('copyExtPassBtn', () => {
    const supExtPassword = document.getElementById('supExtPassword');
    if (supExtPassword) {
      navigator.clipboard.writeText(supExtPassword.value);
      alert('Copied SIP Password to clipboard!');
    }
  });

  addClick('saveSupSettingsBtn', async () => {
    const supExtId = document.getElementById('supExtId');
    const supCallerIdSelect = document.getElementById('supCallerIdSelect');
    const supMaxLocations = document.getElementById('supMaxLocations');
    const supCallsReceiveOn = document.getElementById('supCallsReceiveOn');
    const supExtPassword = document.getElementById('supExtPassword');

    if (!supExtId) return;
    const id = supExtId.value;
    const tfnId = supCallerIdSelect ? supCallerIdSelect.value || null : null;
    const maxLoginLocations = supMaxLocations ? parseInt(supMaxLocations.value) || 1 : 1;
    const callsReceiveOn = supCallsReceiveOn ? supCallsReceiveOn.value : 'Extension';
    const sipPassword = supExtPassword ? supExtPassword.value : '';

    try {
      const res = await fetch(`/api/admin/extensions/${id}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ tfnId, maxLoginLocations, callsReceiveOn, sipPassword }),
      });

      if (res.ok) {
        alert('✓ Extension settings saved successfully!');
        closeModal('modalSupervisorExt');
        loadExtensions();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update extension settings');
      }
    } catch (err) {
      alert('Failed to update extension settings: ' + err.message);
    }
  });

  window.runSupervisorAction = async function (action) {
    if (!activeExtRecord) return;
    try {
      const res = await fetch('/api/admin/supervisor/action', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ action, extensionNumber: activeExtRecord.number }),
      });
      const data = await res.json();
      alert(`Supervisor Action (${action.toUpperCase()}):\n${data.message}`);
    } catch {
      alert(`Initiated ${action.toUpperCase()} command for Extension ${activeExtRecord.number}`);
    }
  };

  window.launchWebRTCForExt = function () {
    window.open('/dashboard', '_blank');
  };

  // ── CDR Report ──────────────────────────────────
  const cdrDateFrom = document.getElementById('cdrDateFrom');
  const cdrDateTo = document.getElementById('cdrDateTo');
  const cdrResponse = document.getElementById('cdrResponse');
  const cdrExtension = document.getElementById('cdrExtension');
  const cdrSource = document.getElementById('cdrSource');
  const cdrDestination = document.getElementById('cdrDestination');
  const cdrDirection = document.getElementById('cdrDirection');
  const cdrLimit = document.getElementById('cdrLimit');
  const cdrTableBody = document.getElementById('cdrTableBody');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (cdrDateFrom && !cdrDateFrom.value) {
    cdrDateFrom.value = `${yesterday.toISOString().slice(0, 10)} 00:00:00`;
  }
  if (cdrDateTo && !cdrDateTo.value) {
    cdrDateTo.value = `${now.toISOString().slice(0, 10)} 23:59:59`;
  }

  async function loadCdrExtensionsDropdown() {
    try {
      const res = await fetch('/api/admin/extensions', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const exts = await res.json();
      if (!cdrExtension) return;

      cdrExtension.innerHTML = '<option value="ALL">ALL</option>';
      exts.forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.number;
        opt.textContent = `Ext ${e.number} (${e.agent ? e.agent.name : 'Unassigned'})`;
        cdrExtension.appendChild(opt);
      });
    } catch { /* ignore */ }
  }

  async function loadCdrReport() {
    try {
      const params = new URLSearchParams({
        dateFrom: cdrDateFrom?.value || '',
        dateTo: cdrDateTo?.value || '',
        response: cdrResponse?.value || 'ALL',
        extension: cdrExtension?.value || 'ALL',
        source: cdrSource?.value || '',
        destination: cdrDestination?.value || '',
        direction: cdrDirection?.value || 'ALL',
        limit: cdrLimit?.value || '30',
      });

      const res = await fetch(`/api/admin/cdr?${params.toString()}`, { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const data = await res.json();

      setTxt('cdrResultsCount', `Results found: ${data.resultsFound || 0}`);
      renderCdrTable(data.logs || []);
    } catch { /* ignore */ }
  }

  function renderCdrTable(logs) {
    if (!cdrTableBody) return;
    if (logs.length === 0) {
      cdrTableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">No CDR call records found for the selected criteria</td></tr>';
      return;
    }

    cdrTableBody.innerHTML = logs.map((l) => {
      const callDateStr = new Date(l.callDate).toLocaleString();
      const answerTimeStr = l.answerTime ? new Date(l.answerTime).toLocaleTimeString() : '—';
      const endTimeStr = l.endTime ? new Date(l.endTime).toLocaleTimeString() : '—';

      const respBadge = l.response === 'ANSWERED' ? '<span class="badge badge-success">ANSWERED</span>' :
        l.response === 'MISSED' ? '<span class="badge badge-danger">MISSED</span>' :
        l.response === 'BUSY' ? '<span class="badge badge-warning">BUSY</span>' :
        l.response === 'REJECTED' ? '<span class="badge badge-danger">REJECTED</span>' : '<span class="badge badge-info">FAILED</span>';

      const dirIcon = l.direction === 'OUTBOUND' ? '📤 OUTBOUND' : '📥 INBOUND';

      return `
        <tr>
          <td style="font-size: var(--font-xs);">${callDateStr}</td>
          <td style="font-size: var(--font-xs); color: var(--text-secondary);">${answerTimeStr}</td>
          <td style="font-size: var(--font-xs); color: var(--text-secondary);">${endTimeStr}</td>
          <td><span style="font-size: var(--font-xs); font-weight: 600;">${dirIcon}</span></td>
          <td><button class="btn btn-ghost" style="font-size: 10px; padding: 2px 6px;" onclick="alert('Call UUID: ${l.callUuid || 'N/A'}\\nAgent: ${l.agentName}\\nTFN: ${l.tfnNumber}')">ℹ️ Info</button></td>
          <td>${respBadge}</td>
          <td style="font-family: monospace; font-size: var(--font-xs);">${l.source}</td>
          <td style="font-family: monospace; font-size: var(--font-xs);">${l.destination}</td>
          <td><strong style="font-family: monospace;">${l.extension}</strong></td>
          <td><span class="badge badge-info" style="font-size: 10px;">${l.region}</span></td>
          <td><strong>${l.durationSec}s</strong> <span style="font-size: 10px; color: var(--text-muted);">(${l.durationFormatted})</span></td>
        </tr>`;
    }).join('');
  }

  addClick('cdrFilterBtn', () => {
    loadCdrReport();
  });

  addClick('cdrDownloadCsvBtn', () => {
    window.open('/api/admin/cdr/export', '_blank');
  });

  // ── TFNs & DIDs Management ──────────────────────
  const tfnsTable = document.getElementById('tfnsTable');
  const searchTfnsInput = document.getElementById('searchTfnsInput');

  async function loadTfns() {
    try {
      const res = await fetch('/api/admin/tfns', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allTfns = await res.json();
      renderTfns(allTfns);
      setTxt('badgeTfnCount', allTfns.length);
    } catch { /* ignore */ }
  }

  function renderTfns(list) {
    const tfnsGridEl = document.getElementById('tfnsGrid');
    if (tfnsGridEl) {
      if (list.length === 0) {
        tfnsGridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: var(--space-8);">No Toll-Free / DID numbers configured</div>';
      } else {
        tfnsGridEl.innerHTML = list.map((tfn) => {
          const trunkLabel = tfn.trunk ? tfn.trunk.name : 'Default';
          const extList = tfn.extensions.map((e) => `Ext ${e.number}`).join(', ') || 'Unassigned';
          const agentList = tfn.extensions.map((e) => e.agent ? e.agent.name : '—').join(', ') || '—';

          return `
            <div class="entity-card">
              <div class="entity-card-header">
                <div class="entity-card-title">
                  <span>📞 ${tfn.number}</span>
                </div>
                <span class="badge badge-purple">${trunkLabel}</span>
              </div>
              <div class="entity-card-body">
                <div class="entity-card-row">
                  <span class="entity-card-label">Campaign Label</span>
                  <span class="entity-card-value">${tfn.label || 'Toll-Free Helpline'}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Assigned Extensions</span>
                  <span class="entity-card-value" style="color: var(--accent-light);">${extList}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Assigned Agents</span>
                  <span class="entity-card-value">${agentList}</span>
                </div>
              </div>
              <div class="entity-card-actions">
                <span style="font-size: 11px; color: var(--text-muted);">Active DID</span>
                <button class="btn btn-action-delete" onclick="window.adminDeleteTfn('${tfn.id}', '${tfn.number}', this)">🗑️ Delete</button>
              </div>
            </div>`;
        }).join('');
      }
    }

    if (!tfnsTable) return;
    if (list.length === 0) {
      tfnsTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">No Toll-Free / DID numbers configured</td></tr>';
      return;
    }

    tfnsTable.innerHTML = list.map((tfn) => {
      const trunkLabel = tfn.trunk ? `<span class="badge badge-purple">${tfn.trunk.name}</span>` : '<span style="color: var(--text-muted);">Default</span>';
      const extList = tfn.extensions.map((e) => `<span class="badge badge-info">Ext ${e.number}</span>`).join(' ') || '<span style="color: var(--text-muted);">Unassigned</span>';
      const agentList = tfn.extensions.map((e) => e.agent ? e.agent.name : '—').join(', ') || '<span style="color: var(--text-muted);">—</span>';

      return `
        <tr>
          <td><strong class="tfn-tag" style="font-size: var(--font-sm);">${tfn.number}</strong></td>
          <td><strong>${tfn.label || 'Toll-Free Number'}</strong></td>
          <td>${trunkLabel}</td>
          <td>${extList}</td>
          <td>${agentList}</td>
          <td>
            <button class="btn btn-action-delete" onclick="window.adminDeleteTfn('${tfn.id}', '${tfn.number}', this)">🗑️ Delete</button>
          </td>
        </tr>`;
    }).join('');
  }

  if (searchTfnsInput) {
    searchTfnsInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allTfns.filter((t) =>
        t.number.toLowerCase().includes(q) ||
        (t.label && t.label.toLowerCase().includes(q)) ||
        (t.trunk && t.trunk.name.toLowerCase().includes(q))
      );
      renderTfns(filtered);
    });
  }

  addClick('submitCreateTfnBtn', async () => {
    const numberEl = document.getElementById('newTfnNumber');
    const labelEl = document.getElementById('newTfnLabel');
    const trunkEl = document.getElementById('newTfnTrunk');
    const createTfnError = document.getElementById('createTfnError');

    const number = numberEl ? numberEl.value.trim() : '';
    const label = labelEl ? labelEl.value.trim() : '';
    const trunkId = trunkEl && trunkEl.value ? trunkEl.value : undefined;

    if (!number) {
      showError(createTfnError, 'Phone number is required (e.g. +18005550199)');
      return;
    }

    try {
      const res = await fetch('/api/admin/tfns', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ number, label, trunkId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add TFN');

      closeModal('modalCreateTfn');
      showToast(`✓ TFN ${number} added successfully`, 'success');
      await loadTfns();
      await loadTfnsDropdown();
      await loadTrunks();
    } catch (err) {
      showError(createTfnError, err.message);
    }
  });

  window.adminDeleteTfn = function (id, number, btnEl) {
    showConfirmDialog({
      title: 'Delete Toll-Free Number',
      message: `Are you sure you want to delete TFN <strong style="color: var(--accent-light); font-family: monospace;">${number}</strong>?`,
      icon: '📞',
      okText: 'Yes, Delete TFN',
      onConfirm: async () => {
        const row = btnEl ? btnEl.closest('tr') : null;
        if (row) row.style.opacity = '0.3';
        try {
          const res = await fetch(`/api/admin/tfns/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: getHeaders(),
          });
          const data = await res.json();
          if (!res.ok) {
            if (row) row.style.opacity = '1';
            showToast(data.error || 'Failed to delete TFN', 'error');
            return;
          }
          showToast(`✓ TFN ${number} deleted successfully`, 'success');
          await loadTfns();
          await loadTfnsDropdown();
          await loadExtensions();
          await loadTrunks();
        } catch (err) {
          if (row) row.style.opacity = '1';
          showToast('Error deleting TFN: ' + err.message, 'error');
        }
      },
    });
  };

  // ── Multi-SIP Trunk Management ──────────────────
  const trunksTable = document.getElementById('trunksTable');
  const searchTrunksInput = document.getElementById('searchTrunksInput');

  async function loadTrunks() {
    try {
      const res = await fetch('/api/admin/trunks', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allTrunks = await res.json();
      renderTrunks(allTrunks);
      renderOverviewTrunks(allTrunks);
      setTxt('badgeTrunkCount', allTrunks.length);
    } catch { /* ignore */ }
  }

  function renderTrunks(list) {
    const trunksGridEl = document.getElementById('trunksGrid');
    if (trunksGridEl) {
      if (list.length === 0) {
        trunksGridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: var(--space-8);">No SIP Trunks configured.</div>';
      } else {
        trunksGridEl.innerHTML = list.map((t) => {
          const providerIcon = t.provider === 'telnyx' ? '🟣 Telnyx' :
            t.provider === 'twilio' ? '🔴 Twilio' :
            t.provider === 'voipms' ? '🔵 VoIP.ms' :
            t.provider === 'bandwidth' ? '🟢 Bandwidth' : '🌐 Generic / Airtel';
          const isReged = t.registered || t.liveStatus === 'REGED';
          const statusBadge = isReged
            ? '<span class="badge badge-success"><span class="status-dot online" style="margin-right:4px;"></span>Connected</span>'
            : `<span class="badge badge-danger">${t.liveStatus || 'Offline'}</span>`;

          return `
            <div class="entity-card">
              <div class="entity-card-header">
                <div class="entity-card-title">
                  <span>${t.name}</span>
                </div>
                <span class="badge badge-info">${providerIcon}</span>
              </div>
              <div class="entity-card-body">
                <div class="entity-card-row">
                  <span class="entity-card-label">Gateway Host & Port</span>
                  <span class="entity-card-value">${t.host}:${t.port || 5060}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Username</span>
                  <span class="entity-card-value">${t.username || '—'}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Default Outbound DID</span>
                  <span class="entity-card-value" style="color: var(--accent-light);">${t.didNumber || '—'}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Registration State</span>
                  ${statusBadge}
                </div>
              </div>
              <div class="entity-card-actions">
                <button class="btn btn-action-control" onclick="window.adminTestTrunk('${t.id}', '${t.name}')">⚡ Test</button>
                <button class="btn btn-action-delete" onclick="window.adminDeleteTrunk('${t.id}', '${t.name}', this)">🗑️ Delete</button>
              </div>
            </div>`;
        }).join('');
      }
    }

    if (!trunksTable) return;
    if (list.length === 0) {
      trunksTable.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">No SIP Trunks configured.</td></tr>';
      return;
    }

    trunksTable.innerHTML = list.map((t) => {
      const providerIcon = t.provider === 'telnyx' ? '🟣 Telnyx' :
        t.provider === 'twilio' ? '🔴 Twilio' :
        t.provider === 'voipms' ? '🔵 VoIP.ms' :
        t.provider === 'bandwidth' ? '🟢 Bandwidth' : '🌐 Generic / Airtel';

      const tfnCount = t.tfns ? t.tfns.length : 0;
      const tfnBadge = tfnCount > 0 ? `<span class="badge badge-purple">${tfnCount} TFNs</span>` : '<span style="color: var(--text-muted);">None</span>';

      const statusBadge = t.registered || t.liveStatus === 'REGED'
        ? '<span class="badge badge-success"><span class="status-dot online" style="margin-right:4px;"></span>Connected (REGED)</span>'
        : t.liveStatus === 'TRYING'
        ? '<span class="badge badge-warning">Connecting (TRYING)</span>'
        : `<span class="badge badge-danger">${t.liveStatus || 'OFFLINE'}</span>`;

      return `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td><span class="badge badge-info" style="font-size: 11px;">${providerIcon}</span></td>
          <td><span style="font-family: monospace; font-size: var(--font-xs);">${t.host}:${t.port || 5060}</span></td>
          <td style="color: var(--text-secondary);">${t.username || '—'}</td>
          <td><span class="tfn-tag">${t.didNumber || '—'}</span></td>
          <td>${tfnBadge}</td>
          <td>${statusBadge}</td>
          <td>
            <label class="toggle">
              <input type="checkbox" ${t.enabled ? 'checked' : ''} onchange="window.adminToggleTrunk('${t.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </td>
          <td>
            <div style="display: flex; gap: var(--space-2);">
              <button class="btn btn-action-control" onclick="window.adminTestTrunk('${t.id}', '${t.name}')">⚡ Test</button>
              <button class="btn btn-action-delete" onclick="window.adminDeleteTrunk('${t.id}', '${t.name}', this)">🗑️ Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderOverviewTrunks(trunks) {
    const el = document.getElementById('overviewTrunksList');
    if (!el) return;
    if (trunks.length === 0) {
      el.innerHTML = '<div style="color: var(--text-muted); text-align: center;">No SIP providers configured</div>';
      return;
    }

    el.innerHTML = trunks.map((t) => {
      const isReged = t.registered || t.liveStatus === 'REGED';
      const badgeClass = isReged ? 'badge-success' : 'badge-danger';
      const badgeText = isReged ? 'Connected' : 'Offline';

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); gap: 8px;">
          <div style="min-width: 0; flex: 1;">
            <strong style="font-size: var(--font-xs); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.name}</strong>
            <div style="font-size: 10px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.host}</div>
          </div>
          <span class="badge ${badgeClass}" style="font-size: 10px; flex-shrink: 0;">${badgeText}</span>
        </div>`;
    }).join('');
  }

  if (searchTrunksInput) {
    searchTrunksInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allTrunks.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.host.toLowerCase().includes(q) ||
        t.provider.toLowerCase().includes(q)
      );
      renderTrunks(filtered);
    });
  }

  addClick('submitCreateTrunkBtn', async () => {
    const providerEl = document.getElementById('newTrunkProvider');
    const nameEl = document.getElementById('newTrunkName');
    const hostEl = document.getElementById('newTrunkHost');
    const portEl = document.getElementById('newTrunkPort');
    const usernameEl = document.getElementById('newTrunkUsername');
    const passwordEl = document.getElementById('newTrunkPassword');
    const didEl = document.getElementById('newTrunkDid');
    const createTrunkError = document.getElementById('createTrunkError');

    const provider = providerEl ? providerEl.value : 'telnyx';
    const name = nameEl ? nameEl.value.trim() : '';
    const host = hostEl ? hostEl.value.trim() : '';
    const port = portEl ? parseInt(portEl.value) || 5060 : 5060;
    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const didNumber = didEl ? didEl.value.trim() : '';

    if (!name) {
      showError(createTrunkError, 'Trunk Name / Label is required');
      return;
    }
    if (!host) {
      showError(createTrunkError, 'Gateway Host / Proxy IP is required');
      return;
    }
    if (!username) {
      showError(createTrunkError, 'SIP Username / Auth ID is required');
      return;
    }

    try {
      const res = await fetch('/api/admin/trunks', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ provider, name, host, port, username, password, didNumber }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create SIP trunk');

      closeModal('modalCreateTrunk');
      showToast(`✓ SIP Trunk "${name}" added successfully`, 'success');
      await loadTrunks();
      await loadTrunksDropdown();
    } catch (err) {
      showError(createTrunkError, err.message);
    }
  });

  window.adminDeleteTrunk = function (id, name, btnEl) {
    showConfirmDialog({
      title: 'Delete SIP Trunk',
      message: `Are you sure you want to delete SIP Trunk <strong style="color: var(--accent-light); font-family: monospace;">"${name}"</strong>?`,
      icon: '🌐',
      okText: 'Yes, Delete Trunk',
      onConfirm: async () => {
        const row = btnEl ? btnEl.closest('tr') : null;
        if (row) row.style.opacity = '0.3';
        try {
          const res = await fetch(`/api/admin/trunks/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: getHeaders(),
          });
          const data = await res.json();
          if (!res.ok) {
            if (row) row.style.opacity = '1';
            showToast(data.error || 'Failed to delete SIP trunk', 'error');
            return;
          }
          showToast(`✓ SIP Trunk "${name}" deleted successfully`, 'success');
          await loadTrunks();
          await loadTrunksDropdown();
          await loadTfns();
        } catch (err) {
          if (row) row.style.opacity = '1';
          showToast('Error deleting SIP trunk: ' + err.message, 'error');
        }
      },
    });
  };

  window.adminToggleTrunk = async function (id, enabled) {
    try {
      await fetch(`/api/admin/trunks/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      });
      loadTrunks();
    } catch { /* ignore */ }
  };

  window.adminTestTrunk = async function (id, name) {
    try {
      const res = await fetch(`/api/admin/trunks/${id}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json();
      alert(`FreeSWITCH Gateway Test for "${name}":\nState: ${data.status}\nRegistered: ${data.registered ? 'Yes' : 'No'}`);
      loadTrunks();
    } catch (e) {
      alert('Test failed to connect to FreeSWITCH ESL');
    }
  };

  async function loadTrunksDropdown() {
    const select = document.getElementById('newTfnTrunk');
    if (!select) return;

    let trunks = allTrunks;
    try {
      const res = await fetch('/api/admin/trunks', { credentials: 'include', headers: getHeaders() });
      if (res.ok) {
        trunks = await res.json();
        allTrunks = trunks;
      }
    } catch { /* use cached allTrunks */ }

    select.innerHTML = '<option value="">— Select Provider Trunk —</option>';
    if (trunks && trunks.length > 0) {
      trunks.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const providerLabel = (t.provider || 'SIP').toUpperCase();
        opt.textContent = `${t.name} (${providerLabel} — ${t.host})`;
        select.appendChild(opt);
      });
    }
  }

  // ── Agents Management ───────────────────────────
  const agentsTable = document.getElementById('agentsTable');
  const searchAgentsInput = document.getElementById('searchAgentsInput');

  async function loadAgents() {
    try {
      const res = await fetch('/api/admin/agents', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allAgents = await res.json();
      renderAgents(allAgents);
      setTxt('badgeAgentCount', allAgents.length);
    } catch { /* ignore */ }
  }

  function renderAgents(list) {
    const agentsGridEl = document.getElementById('agentsGrid');
    if (agentsGridEl) {
      if (list.length === 0) {
        agentsGridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: var(--space-8);">No agents found</div>';
      } else {
        agentsGridEl.innerHTML = list.map((agent) => {
          const extNum = agent.extension ? `Ext ${agent.extension.number}` : '—';
          const statusClass = agent.status === 'ONLINE' ? 'badge-success' :
            agent.status === 'IN_CALL' ? 'badge-info' :
            agent.status === 'RINGING' ? 'badge-warning' : 'badge-danger';
          const rawExtNumber = agent.extension ? agent.extension.number : '1001';

          return `
            <div class="entity-card">
              <div class="entity-card-header">
                <div class="entity-card-title">
                  <span class="agent-avatar-sm">${agent.name.charAt(0)}</span>
                  <span>${agent.name}</span>
                </div>
                <span class="badge ${statusClass}">${agent.status}</span>
              </div>
              <div class="entity-card-body">
                <div class="entity-card-row">
                  <span class="entity-card-label">Email Address</span>
                  <span class="entity-card-value" style="font-size: 11px;">${agent.email}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">Assigned Extension</span>
                  <span class="entity-card-value" style="color: var(--accent-light);">${extNum}</span>
                </div>
                <div class="entity-card-row">
                  <span class="entity-card-label">System Role</span>
                  <span class="badge ${agent.role === 'admin' ? 'badge-warning' : 'badge-info'}">${agent.role}</span>
                </div>
              </div>
              <div class="entity-card-actions">
                <button class="btn btn-ghost" style="padding: 4px 10px; font-size: 12px; color: var(--accent-light); border: 1px solid rgba(99, 102, 241, 0.4);" onclick="window.viewSipCredentials('${rawExtNumber}', '${rawExtNumber}', 'Agent@123', '')">🔑 SIP Config</button>
                ${agent.role === 'admin' ? '<span class="badge badge-warning" style="font-size: 10px;">🔒 Admin</span>' : `<button class="btn btn-action-delete" onclick="window.adminDeleteAgent('${agent.id}', '${agent.name}', this)">🗑️ Delete</button>`}
              </div>
            </div>`;
        }).join('');
      }
    }

    if (!agentsTable) return;
    if (list.length === 0) {
      agentsTable.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">No agents found</td></tr>';
      return;
    }

    agentsTable.innerHTML = list.map((agent) => {
      const extNum = agent.extension ? `<span class="badge badge-purple">Ext ${agent.extension.number}</span>` : '<span style="color: var(--text-muted);">—</span>';
      const statusClass = agent.status === 'ONLINE' ? 'badge-success' :
        agent.status === 'IN_CALL' ? 'badge-info' :
        agent.status === 'RINGING' ? 'badge-warning' : 'badge-danger';

      const isAdmin = agent.role === 'admin';
      const rawExtNumber = agent.extension ? agent.extension.number : '1001';
      const sipBtn = `<button class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: var(--accent-light); border: 1px solid rgba(99, 102, 241, 0.4);" onclick="window.viewSipCredentials('${rawExtNumber}', '${rawExtNumber}', 'Agent@123', '')">🔑 SIP Config</button>`;

      const actionBtn = isAdmin
        ? `<div style="display: flex; align-items: center; gap: 6px;">${sipBtn} <span class="badge badge-warning" style="font-size: 10px;">🔒 Admin</span></div>`
        : `<div style="display: flex; gap: 6px;">${sipBtn} <button class="btn btn-action-delete" onclick="window.adminDeleteAgent('${agent.id}', '${agent.name}', this)">🗑️ Delete</button></div>`;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center;">
              <span class="agent-avatar-sm">${agent.name.charAt(0)}</span>
              <strong>${agent.name}</strong>
            </div>
          </td>
          <td style="color: var(--text-secondary);">${agent.email}</td>
          <td><span class="badge ${isAdmin ? 'badge-warning' : 'badge-info'}">${agent.role}</span></td>
          <td>${extNum}</td>
          <td><span class="badge ${statusClass}">${agent.status}</span></td>
          <td>
            <label class="toggle">
              <input type="checkbox" ${agent.enabled ? 'checked' : ''} ${isAdmin ? 'disabled' : ''} onchange="window.adminToggleAgent('${agent.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </td>
          <td>${actionBtn}</td>
        </tr>`;
    }).join('');
  }

  if (searchAgentsInput) {
    searchAgentsInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allAgents.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.extension && a.extension.number.includes(q))
      );
      renderAgents(filtered);
    });
  }

  addClick('submitCreateAgentBtn', async () => {
    const nameEl = document.getElementById('newAgentName');
    const emailEl = document.getElementById('newAgentEmail');
    const passwordEl = document.getElementById('newAgentPassword');
    const roleEl = document.getElementById('newAgentRole');
    const createAgentError = document.getElementById('createAgentError');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const role = roleEl ? roleEl.value : 'agent';

    if (!name || name.length < 2) {
      showError(createAgentError, 'Name required (min 2 chars)');
      return;
    }
    if (!email) {
      showError(createAgentError, 'Email required');
      return;
    }
    if (!password || password.length < 6) {
      showError(createAgentError, 'Password required (min 6 chars)');
      return;
    }

    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create agent');

      closeModal('modalCreateAgent');
      showToast(`✓ Agent "${name}" created successfully`, 'success');
      loadAgents();
      loadOverviewStats();
    } catch (err) {
      showError(createAgentError, err.message);
    }
  });

  window.adminToggleAgent = async function (id, enabled) {
    try {
      await fetch(`/api/admin/agents/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      });
    } catch { /* ignore */ }
  };

  window.adminDeleteAgent = function (id, name, btnEl) {
    showConfirmDialog({
      title: 'Delete Agent Account',
      message: `Are you sure you want to delete Agent account <strong style="color: var(--accent-light); font-family: monospace;">"${name}"</strong>?`,
      icon: '👤',
      okText: 'Yes, Delete Account',
      onConfirm: async () => {
        const row = btnEl ? btnEl.closest('tr') : null;
        if (row) row.style.opacity = '0.3';
        try {
          const res = await fetch(`/api/admin/agents/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: getHeaders(),
          });
          const data = await res.json();
          if (!res.ok) {
            if (row) row.style.opacity = '1';
            showToast(data.error || 'Cannot delete agent', 'error');
            return;
          }
          showToast(`✓ Agent "${name}" deleted successfully`, 'success');
          loadAgents();
          loadOverviewStats();
        } catch (err) {
          if (row) row.style.opacity = '1';
          showToast('Error deleting agent: ' + err.message, 'error');
        }
      },
    });
  };

  // ── SIP Configuration & Credentials Inspector ──
  window.viewSipCredentials = function (extNumber, sipUser, sipPass, tfnNumber) {
    const host = window.location.hostname || '7xvoip.com';
    const domain = host.includes('localhost') ? '7xvoip.com' : host;
    const wssUrl = `wss://${domain}:7443`;

    setTxt('sipCredExt', `Extension ${extNumber}`);
    setTxt('sipCredUser', sipUser || extNumber);
    setTxt('sipCredPass', sipPass || 'Agent@123');
    setTxt('sipCredDomain', domain);
    setTxt('sipCredWss', wssUrl);
    setTxt('sipCredTfn', tfnNumber || 'Default System DID (+18005550199)');

    openModal('modalSipCredentials');
  };

  window.copySipCredentials = function () {
    const ext = getTxt('sipCredExt');
    const user = getTxt('sipCredUser');
    const pass = getTxt('sipCredPass');
    const domain = getTxt('sipCredDomain');
    const wss = getTxt('sipCredWss');
    const tfn = getTxt('sipCredTfn');

    const text = `7XVOIP SIP Credentials:\nAccount: ${ext}\nSIP Username: ${user}\nSIP Password: ${pass}\nDomain/Realm: ${domain}\nWebRTC WSS: ${wss}\nOutbound TFN: ${tfn}`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ SIP Credentials copied to clipboard!', 'success');
    }).catch(() => {
      showToast('SIP Credentials ready', 'info');
    });
  };

  // ── Initialization & Session Check ──────────────
  async function init() {
    let agentData = JSON.parse(localStorage.getItem('agent') || sessionStorage.getItem('agent') || 'null');
    let token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

    if (!agentData || !token) {
      try {
        const res = await fetch('/api/auth/session', { headers: getHeaders(), credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.agent) {
            agentData = data.agent;
            token = data.token || token;
            localStorage.setItem('agent', JSON.stringify(agentData));
            sessionStorage.setItem('agent', JSON.stringify(agentData));
            if (data.token) {
              localStorage.setItem('authToken', data.token);
              sessionStorage.setItem('authToken', data.token);
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (!agentData) {
      window.location.href = '/';
      return;
    }

    if (agentData.role !== 'admin') {
      window.location.href = '/dashboard';
      return;
    }

    // Load initial data for overview and badges
    loadOverviewStats();
    loadTrunks();
    loadExtensions();
    loadTfns();
    loadAgents();
    loadCdrReport();
    loadCdrExtensionsDropdown();

    // Auto-refresh stats every 20 seconds
    setInterval(() => {
      loadOverviewStats();
    }, 20000);
  }

  init();
})();
