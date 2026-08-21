/**
 * KRAD Global Enterprise Admin Dashboard Logic
 * Modular Tab Routing, Extension Management, CDR Report (Flyzytrip style), Supervisor Actions, and Multi-SIP Provider Trunks.
 */
(function () {
  'use strict';

  function getHeaders() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const h = { 'Content-Type': 'application/json' };
    if (token && token !== 'null') {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
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
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageSubtitle').textContent = meta.subtitle;

    // Trigger specific data loads on tab switch
    if (tabId === 'extensions') {
      loadExtensions();
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
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('visible');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('visible');
      const form = modal.querySelector('form');
      if (form) form.reset();
      const err = modal.querySelector('.alert-error');
      if (err) err.style.display = 'none';
    }
  }

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  document.getElementById('openCreateExtModalBtn').addEventListener('click', () => {
    openModal('modalCreateExt');
    loadUnassignedAgentsDropdown();
    loadTfnsDropdown();
  });

  document.getElementById('openCreateTfnModalBtn').addEventListener('click', () => {
    openModal('modalCreateTfn');
    loadTrunksDropdown();
  });

  document.getElementById('openCreateTrunkModalBtn').addEventListener('click', () => {
    openModal('modalCreateTrunk');
  });

  document.getElementById('openCreateAgentModalBtn').addEventListener('click', () => {
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
  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
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
      document.getElementById('statTotalAgents').textContent = stats.totalAgents || 0;
      document.getElementById('statTotalExtensions').textContent = stats.totalExtensions || 0;
      document.getElementById('statActiveChannels').textContent = stats.activeChannels || 0;
      document.getElementById('statOnlineAgentsText').textContent = `${stats.onlineAgents || 0} Active now`;

      document.getElementById('badgeExtCount').textContent = stats.totalExtensions || 0;
      document.getElementById('badgeAgentCount').textContent = stats.totalAgents || 0;
    } catch { /* ignore */ }
  }

  // ── Extensions Management ───────────────────────
  const extensionsTable = document.getElementById('extensionsTable');
  const searchExtensionsInput = document.getElementById('searchExtensionsInput');
  const createExtError = document.getElementById('createExtError');

  async function loadExtensions() {
    try {
      const res = await fetch('/api/admin/extensions', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allExtensions = await res.json();
      renderExtensions(allExtensions);
      document.getElementById('badgeExtCount').textContent = allExtensions.length;
    } catch { /* ignore */ }
  }

  function renderExtensions(list) {
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
              <button class="btn btn-primary" style="font-size: var(--font-xs); padding: 4px 8px;"
                onclick="window.openSupervisorModal('${ext.id}')">⚙️ Control</button>
              <button class="btn btn-ghost" style="font-size: var(--font-xs); padding: 4px 8px; color: var(--danger);"
                onclick="window.adminDeleteExt('${ext.id}', '${ext.number}')">Delete</button>
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
    try {
      const res = await fetch('/api/admin/tfns', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const tfns = await res.json();
      allTfns = tfns;
      const select = document.getElementById('newExtTfn');
      if (!select) return;

      select.innerHTML = '<option value="">— Default Trunk DID —</option>';
      tfns.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.number} (${t.label || 'TFN'})`;
        select.appendChild(opt);
      });
    } catch { /* ignore */ }
  }

  document.getElementById('submitCreateExtBtn').addEventListener('click', async () => {
    const number = document.getElementById('newExtNumber').value.trim();
    const sipPassword = document.getElementById('newExtPassword').value;
    const agentId = document.getElementById('newExtAgent').value || undefined;
    const tfnId = document.getElementById('newExtTfn').value || undefined;

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

  window.adminDeleteExt = async function (id, number) {
    if (!confirm(`Delete extension ${number}?`)) return;
    try {
      await fetch(`/api/admin/extensions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
      });
      loadExtensions();
      loadOverviewStats();
    } catch { /* ignore */ }
  };

  // ── Supervisor & Extension Control (Image 2) ─────
  let activeExtRecord = null;
  const supExtId = document.getElementById('supExtId');
  const supExtNumber = document.getElementById('supExtNumber');
  const supExtPassword = document.getElementById('supExtPassword');
  const supTogglePassBtn = document.getElementById('supTogglePassBtn');
  const supCallerIdSelect = document.getElementById('supCallerIdSelect');
  const supAccountNumbersList = document.getElementById('supAccountNumbersList');
  const supMaxLocations = document.getElementById('supMaxLocations');
  const supCallsReceiveOn = document.getElementById('supCallsReceiveOn');
  const saveSupSettingsBtn = document.getElementById('saveSupSettingsBtn');

  window.openSupervisorModal = async function (extId) {
    const ext = allExtensions.find((e) => e.id === extId);
    if (!ext) return;
    activeExtRecord = ext;

    supExtId.value = ext.id;
    supExtNumber.value = ext.number;
    supExtPassword.value = 'Ext' + ext.number + '@Sip';
    supMaxLocations.value = ext.maxLoginLocations || 1;
    supCallsReceiveOn.value = ext.callsReceiveOn || 'Extension';

    // Populate Account Numbers Caller ID list
    if (supAccountNumbersList) {
      supAccountNumbersList.innerHTML = '';
      allTfns.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.number;
        if (ext.tfnId === t.id) opt.selected = true;
        supAccountNumbersList.appendChild(opt);
      });
    }

    openModal('modalSupervisorExt');
  };

  if (supTogglePassBtn) {
    supTogglePassBtn.addEventListener('click', () => {
      const isPass = supExtPassword.type === 'password';
      supExtPassword.type = isPass ? 'text' : 'password';
      supTogglePassBtn.textContent = isPass ? '🙈' : '👁';
    });
  }

  document.getElementById('copyExtNumBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(supExtNumber.value);
    alert(`Copied Extension ${supExtNumber.value} to clipboard!`);
  });

  document.getElementById('copyExtPassBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(supExtPassword.value);
    alert('Copied SIP Password to clipboard!');
  });

  if (saveSupSettingsBtn) {
    saveSupSettingsBtn.addEventListener('click', async () => {
      const id = supExtId.value;
      const tfnId = supCallerIdSelect.value || null;
      const maxLoginLocations = parseInt(supMaxLocations.value) || 1;
      const callsReceiveOn = supCallsReceiveOn.value;
      const sipPassword = supExtPassword.value;

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
        }
      } catch (err) {
        alert('Failed to update extension settings');
      }
    });
  }

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

  // ── CDR (Call Detail Records) Report (Image 1) ──
  const cdrDateFrom = document.getElementById('cdrDateFrom');
  const cdrDateTo = document.getElementById('cdrDateTo');
  const cdrResponse = document.getElementById('cdrResponse');
  const cdrExtension = document.getElementById('cdrExtension');
  const cdrSource = document.getElementById('cdrSource');
  const cdrDestination = document.getElementById('cdrDestination');
  const cdrDirection = document.getElementById('cdrDirection');
  const cdrLimit = document.getElementById('cdrLimit');
  const cdrFilterBtn = document.getElementById('cdrFilterBtn');
  const cdrDownloadCsvBtn = document.getElementById('cdrDownloadCsvBtn');
  const cdrResultsCount = document.getElementById('cdrResultsCount');
  const cdrTableBody = document.getElementById('cdrTableBody');

  // Set default date range (yesterday to today)
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

      if (cdrResultsCount) cdrResultsCount.textContent = `Results found: ${data.resultsFound || 0}`;

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

  if (cdrFilterBtn) {
    cdrFilterBtn.addEventListener('click', () => {
      loadCdrReport();
    });
  }

  if (cdrDownloadCsvBtn) {
    cdrDownloadCsvBtn.addEventListener('click', () => {
      window.open('/api/admin/cdr/export', '_blank');
    });
  }

  // ── TFNs & DIDs Management ──────────────────────
  const tfnsTable = document.getElementById('tfnsTable');
  const searchTfnsInput = document.getElementById('searchTfnsInput');
  const createTfnError = document.getElementById('createTfnError');

  async function loadTfns() {
    try {
      const res = await fetch('/api/admin/tfns', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allTfns = await res.json();
      renderTfns(allTfns);
      document.getElementById('badgeTfnCount').textContent = allTfns.length;
    } catch { /* ignore */ }
  }

  function renderTfns(list) {
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
            <button class="btn btn-ghost" style="font-size: var(--font-xs); padding: 4px 8px; color: var(--danger);"
              onclick="window.adminDeleteTfn('${tfn.id}', '${tfn.number}')">Delete</button>
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

  document.getElementById('submitCreateTfnBtn').addEventListener('click', async () => {
    const number = document.getElementById('newTfnNumber').value.trim();
    const label = document.getElementById('newTfnLabel').value.trim();
    const trunkId = document.getElementById('newTfnTrunk').value || undefined;

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
      loadTfns();
    } catch (err) {
      showError(createTfnError, err.message);
    }
  });

  window.adminDeleteTfn = async function (id, number) {
    if (!confirm(`Delete TFN ${number}?`)) return;
    try {
      await fetch(`/api/admin/tfns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
      });
      loadTfns();
      loadExtensions();
    } catch { /* ignore */ }
  };

  // ── Multi-SIP Trunk Management ──────────────────
  const trunksTable = document.getElementById('trunksTable');
  const searchTrunksInput = document.getElementById('searchTrunksInput');
  const createTrunkError = document.getElementById('createTrunkError');

  async function loadTrunks() {
    try {
      const res = await fetch('/api/admin/trunks', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allTrunks = await res.json();
      renderTrunks(allTrunks);
      renderOverviewTrunks(allTrunks);
      document.getElementById('badgeTrunkCount').textContent = allTrunks.length;
    } catch { /* ignore */ }
  }

  function renderTrunks(list) {
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
              <button class="btn btn-ghost" style="font-size: var(--font-xs); padding: 4px 8px;"
                onclick="window.adminTestTrunk('${t.id}', '${t.name}')">Test</button>
              <button class="btn btn-ghost" style="font-size: var(--font-xs); padding: 4px 8px; color: var(--danger);"
                onclick="window.adminDeleteTrunk('${t.id}', '${t.name}')">Delete</button>
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
        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <strong style="font-size: var(--font-xs);">${t.name}</strong>
            <div style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${t.host}</div>
          </div>
          <span class="badge ${badgeClass}" style="font-size: 10px;">${badgeText}</span>
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

  document.getElementById('submitCreateTrunkBtn').addEventListener('click', async () => {
    const provider = document.getElementById('newTrunkProvider').value;
    const name = document.getElementById('newTrunkName').value.trim();
    const host = document.getElementById('newTrunkHost').value.trim();
    const port = parseInt(document.getElementById('newTrunkPort').value) || 5060;
    const username = document.getElementById('newTrunkUsername').value.trim();
    const password = document.getElementById('newTrunkPassword').value;
    const didNumber = document.getElementById('newTrunkDid').value.trim();

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
      loadTrunks();
    } catch (err) {
      showError(createTrunkError, err.message);
    }
  });

  window.adminDeleteTrunk = async function (id, name) {
    if (!confirm(`Delete SIP Trunk "${name}"?`)) return;
    try {
      await fetch(`/api/admin/trunks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
      });
      loadTrunks();
      loadTfns();
    } catch { /* ignore */ }
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
    try {
      const res = await fetch('/api/admin/trunks', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      const trunks = await res.json();
      const select = document.getElementById('newTfnTrunk');
      if (!select) return;

      select.innerHTML = '<option value="">— Select Provider Trunk —</option>';
      trunks.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.provider.toUpperCase()} - ${t.host})`;
        select.appendChild(opt);
      });
    } catch { /* ignore */ }
  }

  // ── Agents Management ───────────────────────────
  const agentsTable = document.getElementById('agentsTable');
  const searchAgentsInput = document.getElementById('searchAgentsInput');
  const createAgentError = document.getElementById('createAgentError');

  async function loadAgents() {
    try {
      const res = await fetch('/api/admin/agents', { credentials: 'include', headers: getHeaders() });
      if (!res.ok) return;
      allAgents = await res.json();
      renderAgents(allAgents);
      document.getElementById('badgeAgentCount').textContent = allAgents.length;
    } catch { /* ignore */ }
  }

  function renderAgents(list) {
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
      const actionBtn = isAdmin
        ? '<span class="badge badge-warning" style="font-size: 10px;">🔒 Protected Admin</span>'
        : `<button class="btn btn-ghost" style="font-size: var(--font-xs); padding: 4px 8px; color: var(--danger);"
            onclick="window.adminDeleteAgent('${agent.id}', '${agent.name}')">Delete</button>`;

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

  document.getElementById('submitCreateAgentBtn').addEventListener('click', async () => {
    const name = document.getElementById('newAgentName').value.trim();
    const email = document.getElementById('newAgentEmail').value.trim();
    const password = document.getElementById('newAgentPassword').value;
    const role = document.getElementById('newAgentRole').value;

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

  window.adminDeleteAgent = async function (id, name) {
    if (!confirm(`Delete agent account ${name}?`)) return;
    try {
      const res = await fetch(`/api/admin/agents/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Cannot delete agent');
        return;
      }
      loadAgents();
      loadOverviewStats();
    } catch { /* ignore */ }
  };

  // ── Helpers ─────────────────────────────────────
  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ── Initialization & Session Check ──────────────
  async function init() {
    let agentData = JSON.parse(sessionStorage.getItem('agent') || 'null');
    const token = sessionStorage.getItem('authToken');

    if (!agentData || !token) {
      try {
        const res = await fetch('/api/auth/session', { headers: getHeaders(), credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.agent) {
            agentData = data.agent;
            sessionStorage.setItem('agent', JSON.stringify(agentData));
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
