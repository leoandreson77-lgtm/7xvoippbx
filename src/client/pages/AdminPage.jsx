import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SipCredentialsModal from '../components/SipCredentialsModal';
import SupervisorModal from '../components/SupervisorModal';
import EditExtensionModal from '../components/EditExtensionModal';
import EditTrunkModal from '../components/EditTrunkModal';
import EditTfnModal from '../components/EditTfnModal';
import SupervisorGrid from '../components/SupervisorGrid';

export default function AdminPage() {
  const { agent, logout, getHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Stats & State
  const [stats, setStats] = useState({ totalAgents: 0, totalExtensions: 0, activeChannels: 0, onlineAgents: 0 });
  const [extensions, setExtensions] = useState([]);
  const [tfns, setTfns] = useState([]);
  const [trunks, setTrunks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [cdrLogs, setCdrLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // CDR Filters State
  const [cdrFilters, setCdrFilters] = useState({
    dateFrom: '',
    dateTo: '',
    response: 'ALL',
    source: '',
    destination: '',
    direction: 'ALL',
  });

  const fetchFilteredCdr = async () => {
    try {
      const queryParams = new URLSearchParams({ limit: '100' });
      if (cdrFilters.dateFrom) queryParams.append('dateFrom', cdrFilters.dateFrom);
      if (cdrFilters.dateTo) queryParams.append('dateTo', cdrFilters.dateTo);
      if (cdrFilters.response !== 'ALL') queryParams.append('response', cdrFilters.response);
      if (cdrFilters.source) queryParams.append('source', cdrFilters.source);
      if (cdrFilters.destination) queryParams.append('destination', cdrFilters.destination);
      if (cdrFilters.direction !== 'ALL') queryParams.append('direction', cdrFilters.direction);

      const res = await fetch(`/api/admin/cdr?${queryParams.toString()}`, {
        credentials: 'include',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCdrLogs(data.logs || []);
      }
    } catch (e) {}
  };

  // Modals state
  const [sipModalOpen, setSipModalOpen] = useState(false);
  const [selectedCreds, setSelectedCreds] = useState(null);

  const [supervisorModalOpen, setSupervisorModalOpen] = useState(false);
  const [supervisorExt, setSupervisorExt] = useState('');

  const [editExtModalOpen, setEditExtModalOpen] = useState(false);
  const [selectedExt, setSelectedExt] = useState(null);

  const [editTrunkModalOpen, setEditTrunkModalOpen] = useState(false);
  const [selectedTrunk, setSelectedTrunk] = useState(null);

  const [editTfnModalOpen, setEditTfnModalOpen] = useState(false);
  const [selectedTfn, setSelectedTfn] = useState(null);

  // New Creation Modal state
  const [createExtModalOpen, setCreateExtModalOpen] = useState(false);
  const [newExtNumber, setNewExtNumber] = useState('');
  const [newExtPassword, setNewExtPassword] = useState('Agent@123');

  // Create Agent State
  const [createAgentModalOpen, setCreateAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newAgentPassword, setNewAgentPassword] = useState('Agent@123');
  const [newAgentRole, setNewAgentRole] = useState('agent');

  // Create TFN State
  const [createTfnModalOpen, setCreateTfnModalOpen] = useState(false);
  const [newTfnNumber, setNewTfnNumber] = useState('');
  const [newTfnLabel, setNewTfnLabel] = useState('');
  const [newTfnTrunkId, setNewTfnTrunkId] = useState('');

  // Create Trunk State
  const [createTrunkModalOpen, setCreateTrunkModalOpen] = useState(false);
  const [newTrunkName, setNewTrunkName] = useState('');
  const [newTrunkProvider, setNewTrunkProvider] = useState('twilio');
  const [newTrunkHost, setNewTrunkHost] = useState('');
  const [newTrunkPort, setNewTrunkPort] = useState(5060);
  const [newTrunkUsername, setNewTrunkUsername] = useState('');
  const [newTrunkPassword, setNewTrunkPassword] = useState('');
  const [newTrunkDid, setNewTrunkDid] = useState('');
  const [newTrunkRealm, setNewTrunkRealm] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch Methods
  const loadAllData = async () => {
    setIsSyncing(true);
    try {
      const [resStats, resExt, resTfn, resTrunk, resAgent, resCdr] = await Promise.all([
        fetch('/api/admin/stats', { credentials: 'include', headers: getHeaders() }),
        fetch('/api/admin/extensions', { credentials: 'include', headers: getHeaders() }),
        fetch('/api/admin/tfns', { credentials: 'include', headers: getHeaders() }),
        fetch('/api/admin/trunks', { credentials: 'include', headers: getHeaders() }),
        fetch('/api/admin/agents', { credentials: 'include', headers: getHeaders() }),
        fetch('/api/admin/cdr?limit=50', { credentials: 'include', headers: getHeaders() }),
      ]);

      if (resStats.ok) setStats(await resStats.json());
      if (resExt.ok) setExtensions(await resExt.json());
      if (resTfn.ok) setTfns(await resTfn.json());
      if (resTrunk.ok) setTrunks(await resTrunk.json());
      if (resAgent.ok) setAgents(await resAgent.json());
      if (resCdr.ok) {
        const data = await resCdr.json();
        setCdrLogs(data.logs || []);
      }
    } catch (e) {}
    finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Delete Actions
  const deleteExtension = async (id, number) => {
    if (!confirm(`Are you sure you want to delete Extension ${number}?`)) return;
    try {
      const res = await fetch(`/api/admin/extensions/${id}`, { method: 'DELETE', credentials: 'include', headers: getHeaders() });
      if (res.ok) loadAllData();
    } catch (e) {}
  };

  const deleteTfn = async (id, number) => {
    if (!confirm(`Are you sure you want to delete TFN ${number}?`)) return;
    try {
      const res = await fetch(`/api/admin/tfns/${id}`, { method: 'DELETE', credentials: 'include', headers: getHeaders() });
      if (res.ok) loadAllData();
    } catch (e) {}
  };

  const deleteTrunk = async (id, name) => {
    if (!confirm(`Are you sure you want to delete SIP Trunk "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/trunks/${id}`, { method: 'DELETE', credentials: 'include', headers: getHeaders() });
      if (res.ok) loadAllData();
    } catch (e) {}
  };

  const deleteAgent = async (id, name) => {
    if (!confirm(`Are you sure you want to delete Agent "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/agents/${id}`, { method: 'DELETE', credentials: 'include', headers: getHeaders() });
      if (res.ok) loadAllData();
    } catch (e) {}
  };

  // Create Handlers
  const handleCreateExt = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/extensions', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ number: newExtNumber, sipPassword: newExtPassword, tfnId: newExtTfnId || undefined }),
      });
      if (res.ok) {
        setNewExtNumber('');
        setNewExtTfnId('');
        setCreateExtModalOpen(false);
        loadAllData();
      }
    } catch (e) {}
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ name: newAgentName, email: newAgentEmail, password: newAgentPassword, role: newAgentRole }),
      });
      if (res.ok) {
        setNewAgentName('');
        setNewAgentEmail('');
        setCreateAgentModalOpen(false);
        loadAllData();
      }
    } catch (e) {}
  };

  const handleCreateTfn = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/tfns', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ number: newTfnNumber, label: newTfnLabel, trunkId: newTfnTrunkId || undefined }),
      });
      if (res.ok) {
        setNewTfnNumber('');
        setNewTfnLabel('');
        setCreateTfnModalOpen(false);
        loadAllData();
      }
    } catch (e) {}
  };

  const handleCreateTrunk = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/trunks', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newTrunkName,
          provider: newTrunkProvider,
          host: newTrunkHost,
          port: Number(newTrunkPort),
          username: newTrunkUsername,
          password: newTrunkPassword,
          didNumber: newTrunkDid,
          realm: newTrunkRealm || newTrunkHost,
        }),
      });
      if (res.ok) {
        setNewTrunkName('');
        setNewTrunkHost('');
        setNewTrunkRealm('');
        setCreateTrunkModalOpen(false);
        loadAllData();
      }
    } catch (e) {}
  };

  const openSipCredentials = (extNum, pass = 'Agent@123', tfn = '') => {
    setSelectedCreds({
      extNumber: extNum,
      sipUsername: extNum,
      sipPassword: pass,
      tfnNumber: tfn,
    });
    setSipModalOpen(true);
  };

  const openSupervisor = (extNum) => {
    setSupervisorExt(extNum);
    setSupervisorModalOpen(true);
  };

  // Filtered lists
  const filteredExts = extensions.filter(e => e.number.includes(searchQuery) || (e.agent && e.agent.name.toLowerCase().includes(searchQuery.toLowerCase())));
  const filteredTfns = tfns.filter(t => t.number.toLowerCase().includes(searchQuery.toLowerCase()) || (t.label && t.label.toLowerCase().includes(searchQuery.toLowerCase())));
  const filteredTrunks = trunks.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.host.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.email.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="admin-layout">
      {/* ── Left Sidebar Navigation ───────────────── */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">📞</span>
          <div>
            <div className="sidebar-title">7XVOIP</div>
            <div className="sidebar-subtitle">Enterprise PBX</div>
          </div>
        </div>

        <nav className="nav-menu">
          {[
            { id: 'overview', label: 'Overview', icon: '📊', count: null },
            { id: 'extensions', label: 'Extensions', icon: '🔢', count: extensions.length },
            { id: 'cdr', label: 'CDR Reports', icon: '🕒', count: cdrLogs.length },
            { id: 'tfns', label: 'TFN Numbers', icon: '📞', count: tfns.length },
            { id: 'trunks', label: 'SIP Trunks', icon: '🌐', count: trunks.length },
            { id: 'agents', label: 'Agents Roster', icon: '👥', count: agents.length },
            { id: 'supervisor', label: 'Live Monitor', icon: '🎧', count: null },
          ].map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== null && <span className="nav-badge">{tab.count}</span>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link to="/dashboard" className="btn btn-ghost" style={{ fontSize: 'var(--font-xs)', justifyContent: 'flex-start', gap: 'var(--space-2)' }}>
            <span>🎧</span>
            <span>Switch to Agent Dialer</span>
          </Link>
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize: 'var(--font-xs)', justifyContent: 'flex-start', gap: 'var(--space-2)', color: 'var(--danger)', cursor: 'pointer' }}>
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Dashboard Content ────────────────────────── */}
      <main className="admin-main">
        {/* Sticky Top Header */}
        <header className="admin-header">
          <div className="header-title-group">
            <h1>{activeTab.toUpperCase()} MANAGEMENT</h1>
            <p>Real-time FreeSWITCH Gateways, WebRTC extensions, and Supervisor Controls</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={loadAllData}
              disabled={isSyncing}
              className="btn btn-ghost"
              style={{
                fontSize: 'var(--font-xs)',
                gap: '6px',
                color: 'var(--accent-light)',
                border: '1px solid var(--border-accent)',
                padding: '8px 14px',
                cursor: 'pointer',
              }}
              title="Synchronize all data panels with live backend"
            >
              <span style={{ display: 'inline-block', transition: 'transform 0.4s', transform: isSyncing ? 'rotate(360deg)' : 'none' }}>🔄</span>
              <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
            </button>
            <div className="admin-user-menu" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="agent-avatar-sm" style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
                {agent ? agent.name.charAt(0) : 'A'}
              </span>
              <div>
                <strong style={{ fontSize: 'var(--font-sm)', display: 'block' }}>{agent ? agent.name : 'Admin'}</strong>
                <span className="badge badge-warning" style={{ fontSize: '10px' }}>SYSTEM ADMINISTRATOR</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Admin Body Wrapper ────────────────────────── */}
        <div className="admin-body">
          {/* ── TAB 1: OVERVIEW STATS & DASHBOARD ─────── */}
          {activeTab === 'overview' && (
            <section className="tab-view active" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* Top KPI Cards Row */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-icon-wrap">👥</div>
                  <div className="kpi-label">Total Agents</div>
                  <div className="kpi-value">{stats.totalAgents || agents.length}</div>
                  <div className="kpi-trend positive">✓ System Rostered</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-wrap">🔢</div>
                  <div className="kpi-label">Total Extensions</div>
                  <div className="kpi-value">{stats.totalExtensions || extensions.length}</div>
                  <div className="kpi-trend positive">Provisioned & Ready</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-wrap">⚡</div>
                  <div className="kpi-label">Active Channels</div>
                  <div className="kpi-value">{stats.activeChannels || 0}</div>
                  <div className="kpi-trend neutral">Live Concurrent Calls</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon-wrap">🌐</div>
                  <div className="kpi-label">SIP Trunks</div>
                  <div className="kpi-value">{trunks.length}</div>
                  <div className="kpi-trend positive">Multi-Provider Gateways</div>
                </div>
              </div>

              {/* Middle Section: System Health & Provider Gateways */}
              <div className="overview-split-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--space-6)' }}>
                {/* System Services Health */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">🖥️ FreeSWITCH & Core PBX Health</h3>
                    <span className="badge badge-success">ALL SYSTEMS OPERATIONAL</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                    <div style={{ background: 'var(--bg-glass)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>FreeSWITCH Telephony Engine</div>
                      <div style={{ fontSize: 'var(--font-sm)', fontWeight: '700', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="status-dot online"></span>
                        <span>ESL Connected (Port 8021)</span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-glass)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>WebRTC WSS Gateway</div>
                      <div style={{ fontSize: 'var(--font-sm)', fontWeight: '700', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="status-dot in-call"></span>
                        <span>WSS Active (Port 7443)</span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-glass)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Dynamic Directory Hook</div>
                      <div style={{ fontSize: 'var(--font-sm)', fontWeight: '700', color: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⚡</span>
                        <span>mod_xml_curl (/fs-config)</span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-glass)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Prisma Database Engine</div>
                      <div style={{ fontSize: 'var(--font-sm)', fontWeight: '700', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🗄️</span>
                        <span>SQLite / Postgres Connected</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Management Actions */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">⚡ Quick Management Actions</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <button onClick={() => setCreateExtModalOpen(true)} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', fontSize: 'var(--font-xs)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🔢</span>
                      <span>+ Create Extension</span>
                    </button>
                    <button onClick={() => setActiveTab('supervisor')} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', fontSize: 'var(--font-xs)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🎧</span>
                      <span>Live Monitor</span>
                    </button>
                    <button onClick={() => setActiveTab('tfns')} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', fontSize: 'var(--font-xs)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '1.2rem' }}>📞</span>
                      <span>Manage TFN DIDs</span>
                    </button>
                    <button onClick={() => setActiveTab('trunks')} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', fontSize: 'var(--font-xs)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🌐</span>
                      <span>SIP Trunks</span>
                    </button>
                    <button onClick={() => setActiveTab('cdr')} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px', fontSize: 'var(--font-xs)', border: '1px solid var(--border-subtle)', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '1.2rem' }}>📊</span>
                      <span>View Detailed CDR Reports ({cdrLogs.length} Records)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Active Extension Roster & Recent Activity */}
              <div className="overview-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                {/* Agent Extensions Roster Preview */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">👥 Provisioned Extensions ({extensions.length})</h3>
                    <button onClick={() => setActiveTab('extensions')} className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 8px' }}>View All →</button>
                  </div>
                  <div className="table-container" style={{ maxHeight: '240px' }}>
                    <table style={{ minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th>EXTENSION</th>
                          <th>AGENT</th>
                          <th>OUTBOUND DID</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extensions.slice(0, 5).map((ext) => (
                          <tr key={ext.id}>
                            <td><strong style={{ fontFamily: 'monospace' }}>Ext {ext.number}</strong></td>
                            <td>{ext.agent ? ext.agent.name : '— Unassigned —'}</td>
                            <td><span className="tfn-tag">{ext.tfn ? ext.tfn.number : 'Default DID'}</span></td>
                            <td>
                              <span className={`badge ${ext.liveRegistered || ext.registered ? 'badge-success' : 'badge-danger'}`}>
                                {ext.liveRegistered || ext.registered ? 'Online' : 'Offline'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent System Call Activity */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">🕒 Recent Call Activity</h3>
                    <button onClick={() => setActiveTab('cdr')} className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 8px' }}>Full Report →</button>
                  </div>
                  <div className="table-container" style={{ maxHeight: '240px' }}>
                    <table style={{ minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th>TIME</th>
                          <th>SOURCE</th>
                          <th>DESTINATION</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cdrLogs.length === 0 ? (
                          <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No recent call records</td></tr>
                        ) : (
                          cdrLogs.slice(0, 5).map((log) => {
                            const dateVal = log.callDate || log.startedAt;
                            const timeStr = dateVal ? new Date(dateVal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                            const sourceVal = log.source || log.callerNumber || '—';
                            const destVal = log.destination || log.calleeNumber || '—';
                            const statusVal = (log.response || log.status || 'UNKNOWN').toUpperCase();

                            return (
                              <tr key={log.id}>
                                <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeStr}</td>
                                <td><strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>{sourceVal}</strong></td>
                                <td><strong style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-light)' }}>{destVal}</strong></td>
                                <td>
                                  <span className={`badge ${statusVal === 'ANSWERED' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>
                                    {statusVal}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── TAB 2: EXTENSIONS ───────────────────── */}
          {activeTab === 'extensions' && (
            <section className="tab-view active">
              <div className="view-toolbar">
                <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: '700', color: 'var(--text-primary)' }}>Configured Extensions ({filteredExts.length})</h2>
                <button onClick={() => setCreateExtModalOpen(true)} className="btn btn-primary">
                  + Create Extension
                </button>
              </div>

              <div className="cards-grid">
                {filteredExts.map((ext) => (
                  <div key={ext.id} className="entity-card">
                    <div className="entity-card-header">
                      <div className="entity-card-title">
                        <span>📞 Ext {ext.number}</span>
                      </div>
                      <span className={`badge ${ext.liveRegistered || ext.registered ? 'badge-success' : 'badge-danger'}`}>
                        {ext.liveRegistered || ext.registered ? 'Registered' : 'Offline'}
                      </span>
                    </div>

                    <div className="entity-card-body">
                      <div className="entity-card-row">
                        <span className="entity-card-label">Assigned Agent</span>
                        <span className="entity-card-value">{ext.agent ? ext.agent.name : '— Unassigned —'}</span>
                      </div>
                      <div className="entity-card-row">
                        <span className="entity-card-label">Outbound TFN</span>
                        <span className="entity-card-value" style={{ color: 'var(--accent-light)' }}>{ext.tfn ? ext.tfn.number : 'Default DID'}</span>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="entity-card-actions">
                      <button onClick={() => openSipCredentials(ext.number, ext.sipPassword, ext.tfn?.number)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-light)', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                        🔑 SIP Config
                      </button>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => openSupervisor(ext.number)} className="btn btn-action-control">
                          ⚙️ Control
                        </button>
                        <button onClick={() => { setSelectedExt(ext); setEditExtModalOpen(true); }} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => deleteExtension(ext.id, ext.number)} className="btn btn-action-delete">
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TAB 3: CDR REPORTS ──────────────────── */}
          {activeTab === 'cdr' && (
            <section className="tab-view active">
              {/* Filter Controls Bar */}
              <div className="cdr-filter-card">
                <div className="cdr-filter-grid">
                  <div className="cdr-input-group">
                    <label>From Date</label>
                    <input type="date" value={cdrFilters.dateFrom} onChange={(e) => setCdrFilters({ ...cdrFilters, dateFrom: e.target.value })} />
                  </div>
                  <div className="cdr-input-group">
                    <label>To Date</label>
                    <input type="date" value={cdrFilters.dateTo} onChange={(e) => setCdrFilters({ ...cdrFilters, dateTo: e.target.value })} />
                  </div>
                  <div className="cdr-input-group">
                    <label>Status / Response</label>
                    <select value={cdrFilters.response} onChange={(e) => setCdrFilters({ ...cdrFilters, response: e.target.value })}>
                      <option value="ALL">All Responses</option>
                      <option value="ANSWERED">Answered</option>
                      <option value="MISSED">Missed</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>
                  <div className="cdr-input-group">
                    <label>Source (Caller)</label>
                    <input type="text" placeholder="e.g. +1217..." value={cdrFilters.source} onChange={(e) => setCdrFilters({ ...cdrFilters, source: e.target.value })} />
                  </div>
                  <div className="cdr-input-group">
                    <label>Destination (Callee)</label>
                    <input type="text" placeholder="e.g. 1001" value={cdrFilters.destination} onChange={(e) => setCdrFilters({ ...cdrFilters, destination: e.target.value })} />
                  </div>
                  <div className="cdr-input-group">
                    <label>Direction</label>
                    <select value={cdrFilters.direction} onChange={(e) => setCdrFilters({ ...cdrFilters, direction: e.target.value })}>
                      <option value="ALL">All Directions</option>
                      <option value="INBOUND">Inbound</option>
                      <option value="OUTBOUND">Outbound</option>
                    </select>
                  </div>
                </div>

                <div className="cdr-filter-actions">
                  <button onClick={fetchFilteredCdr} className="btn-cdr-filter">
                    🔍 Filter Records
                  </button>
                  <a href="/api/admin/cdr/export" target="_blank" rel="noreferrer" className="btn-cdr-csv">
                    📥 Export CSV Report
                  </a>
                </div>
              </div>

              <div className="cdr-results-count">
                Found {cdrLogs.length} CDR records
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>CALL DATE</th>
                      <th>SOURCE</th>
                      <th>DESTINATION</th>
                      <th>EXTENSION</th>
                      <th>DIRECTION</th>
                      <th>DURATION</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cdrLogs.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No call detail records found.
                        </td>
                      </tr>
                    ) : (
                      cdrLogs.map((log) => {
                        const dateVal = log.callDate || log.startedAt;
                        const dateFormatted = dateVal ? new Date(dateVal).toLocaleString() : '—';
                        const sourceVal = log.source || log.callerNumber || '—';
                        const destVal = log.destination || log.calleeNumber || '—';
                        const extVal = log.extension || (log.extensionObj ? log.extensionObj.number : '—');
                        const dirVal = (log.direction || 'OUTBOUND').toUpperCase();
                        const durVal = log.durationFormatted || (log.durationSec !== undefined ? `${log.durationSec}s` : (log.duration !== undefined ? `${log.duration}s` : '0s'));
                        const statusVal = (log.response || log.status || 'UNKNOWN').toUpperCase();

                        return (
                          <tr key={log.id}>
                            <td>{dateFormatted}</td>
                            <td><strong style={{ fontFamily: 'monospace' }}>{sourceVal}</strong></td>
                            <td><strong style={{ fontFamily: 'monospace', color: 'var(--accent-light)' }}>{destVal}</strong></td>
                            <td><span className="tfn-tag">{extVal}</span></td>
                            <td><span className={`badge ${dirVal === 'INBOUND' ? 'badge-info' : 'badge-purple'}`}>{dirVal}</span></td>
                            <td style={{ fontFamily: 'monospace' }}>{durVal}</td>
                            <td>
                              <span className={`badge ${statusVal === 'ANSWERED' ? 'badge-success' : statusVal === 'MISSED' ? 'badge-warning' : 'badge-danger'}`}>
                                {statusVal}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── TAB 4: TFNS ─────────────────────────── */}
          {activeTab === 'tfns' && (
            <section className="tab-view active">
              <div className="view-toolbar">
                <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: '700', color: 'var(--text-primary)' }}>Toll-Free & DID Numbers ({filteredTfns.length})</h2>
                <button onClick={() => setCreateTfnModalOpen(true)} className="btn btn-primary">
                  + Add New TFN
                </button>
              </div>

              <div className="cards-grid">
                {filteredTfns.map((tfn) => (
                  <div key={tfn.id} className="entity-card">
                    <div className="entity-card-header">
                      <div className="entity-card-title">
                        <span>📞 {tfn.number}</span>
                      </div>
                      <span className="badge badge-purple">{tfn.trunk ? tfn.trunk.name : 'Default'}</span>
                    </div>
                    <div className="entity-card-body">
                      <div className="entity-card-row">
                        <span className="entity-card-label">Campaign Label</span>
                        <span className="entity-card-value">{tfn.label || 'Toll-Free Helpline'}</span>
                      </div>
                      <div className="entity-card-row">
                        <span className="entity-card-label">Aligned Extensions</span>
                        <span className="entity-card-value" style={{ color: 'var(--accent-light)', fontWeight: '600' }}>
                          {tfn.extensions && tfn.extensions.length > 0
                            ? tfn.extensions.map(e => `Ext ${e.number}`).join(', ')
                            : 'All Extensions (Default)'}
                        </span>
                      </div>
                    </div>
                    <div className="entity-card-actions">
                      <button onClick={() => { setSelectedTfn(tfn); setEditTfnModalOpen(true); }} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteTfn(tfn.id, tfn.number)} className="btn btn-action-delete">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TAB 5: TRUNKS ───────────────────────── */}
          {activeTab === 'trunks' && (
            <section className="tab-view active">
              <div className="view-toolbar">
                <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: '700', color: 'var(--text-primary)' }}>SIP Carrier Gateways ({filteredTrunks.length})</h2>
                <button onClick={() => setCreateTrunkModalOpen(true)} className="btn btn-primary">
                  + Add SIP Trunk
                </button>
              </div>

              <div className="cards-grid">
                {filteredTrunks.map((t) => (
                  <div key={t.id} className="entity-card" style={{ opacity: t.enabled === false ? 0.55 : 1 }}>
                    <div className="entity-card-header">
                      <div className="entity-card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{t.name}</span>
                        {t.enabled === false && (
                          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '9px', padding: '1px 6px' }}>DISABLED</span>
                        )}
                      </div>
                      <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>{t.provider || 'SIP'}</span>
                    </div>
                    <div className="entity-card-body">
                      <div className="entity-card-row">
                        <span className="entity-card-label">Gateway Host</span>
                        <span className="entity-card-value">{t.host}:{t.port || 5060}</span>
                      </div>
                      {t.sipUri && (
                        <div className="entity-card-row">
                          <span className="entity-card-label">SIP URI</span>
                          <span className="entity-card-value" style={{ color: '#a5b4fc', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{t.sipUri}</span>
                        </div>
                      )}
                      <div className="entity-card-row">
                        <span className="entity-card-label">Default DID</span>
                        <span className="entity-card-value" style={{ color: 'var(--accent-light)' }}>{t.didNumber || '—'}</span>
                      </div>
                      <div className="entity-card-row">
                        <span className="entity-card-label">Linked TFNs</span>
                        <span className="entity-card-value">
                          {t.tfns && t.tfns.length > 0 ? (
                            t.tfns.map(tfn => (
                              <span key={tfn.id} className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontSize: '10px', padding: '2px 6px', marginRight: '4px' }}>
                                {tfn.number}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>No TFNs linked</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="entity-card-actions">
                      <button onClick={() => { setSelectedTrunk(t); setEditTrunkModalOpen(true); }} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteTrunk(t.id, t.name)} className="btn btn-action-delete">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TAB 6: AGENTS ───────────────────────── */}
          {activeTab === 'agents' && (
            <section className="tab-view active">
              <div className="view-toolbar">
                <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: '700', color: 'var(--text-primary)' }}>Rostered Agents ({filteredAgents.length})</h2>
                <button onClick={() => setCreateAgentModalOpen(true)} className="btn btn-primary">
                  + Add New Agent
                </button>
              </div>

              <div className="cards-grid">
                {filteredAgents.map((ag) => (
                  <div key={ag.id} className="entity-card">
                    <div className="entity-card-header">
                      <div className="entity-card-title">
                        <span className="agent-avatar-sm" style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontWeight: 'bold', color: '#fff', fontSize: '12px' }}>{ag.name.charAt(0)}</span>
                        <span>{ag.name}</span>
                      </div>
                      <span className={`badge ${ag.status === 'ONLINE' ? 'badge-success' : 'badge-danger'}`}>{ag.status}</span>
                    </div>
                    <div className="entity-card-body">
                      <div className="entity-card-row">
                        <span className="entity-card-label">Email</span>
                        <span className="entity-card-value" style={{ fontSize: '11px' }}>{ag.email}</span>
                      </div>
                      <div className="entity-card-row">
                        <span className="entity-card-label">Extension</span>
                        <span className="entity-card-value" style={{ color: 'var(--accent-light)' }}>{ag.extension ? `Ext ${ag.extension.number}` : '—'}</span>
                      </div>
                    </div>
                    <div className="entity-card-actions">
                      <button onClick={() => openSipCredentials(ag.extension?.number || '1001')} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-light)', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                        🔑 SIP Config
                      </button>
                      {ag.role !== 'admin' && (
                        <button onClick={() => deleteAgent(ag.id, ag.name)} className="btn btn-action-delete">
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TAB 7: SUPERVISOR LIVE MONITOR ───── */}
          {activeTab === 'supervisor' && (
            <section className="tab-view active">
              <div className="view-toolbar">
                <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: '700', color: 'var(--text-primary)' }}>🎧 Live Agent Monitor</h2>
                <span className="badge badge-info">Real-Time Supervisor Controls</span>
              </div>
              <SupervisorGrid />
            </section>
          )}
        </div>
      </main>

      {/* Global React Modals */}
      <SipCredentialsModal isOpen={sipModalOpen} onClose={() => setSipModalOpen(false)} creds={selectedCreds} />
      <SupervisorModal isOpen={supervisorModalOpen} onClose={() => setSupervisorModalOpen(false)} extNumber={supervisorExt} />
      <EditExtensionModal isOpen={editExtModalOpen} onClose={() => setEditExtModalOpen(false)} extension={selectedExt} agents={agents} tfns={tfns} onSave={loadAllData} />
      <EditTrunkModal isOpen={editTrunkModalOpen} onClose={() => setEditTrunkModalOpen(false)} trunk={selectedTrunk} onSave={loadAllData} />
      <EditTfnModal isOpen={editTfnModalOpen} onClose={() => setEditTfnModalOpen(false)} tfn={selectedTfn} trunks={trunks} extensions={extensions} onSave={loadAllData} />

      {/* ── MODAL 1: Create Extension ── */}
      {createExtModalOpen && (
        <div className="modal-overlay active visible" style={{ display: 'flex' }}>
          <div className="modal-card" style={{ maxWidth: '420px', width: '92vw' }}>
            <button type="button" className="modal-close" onClick={() => setCreateExtModalOpen(false)}>&times;</button>
            <div className="modal-header">
              <span className="modal-icon">🔢</span>
              <div>
                <h3 className="modal-title">+ Create Extension</h3>
                <p className="modal-subtitle">Provision a new extension for FreeSWITCH</p>
              </div>
            </div>

            <form onSubmit={handleCreateExt} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Extension Number (3-6 digits)</label>
                <input type="text" value={newExtNumber} onChange={(e) => setNewExtNumber(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. 1005" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Password</label>
                <input type="text" value={newExtPassword} onChange={(e) => setNewExtPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>📞 Map to Toll-Free / DID (TFN Routing)</label>
                <select value={newExtTfnId} onChange={(e) => setNewExtTfnId(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
                  <option value="">— Unassigned (Rings on all TFNs) —</option>
                  {tfns.map((t) => (
                    <option key={t.id} value={t.id}>{t.number} ({t.label || 'TFN'})</option>
                  ))}
                </select>
              </div>
              <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setCreateExtModalOpen(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Extension</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Create Agent ── */}
      {createAgentModalOpen && (
        <div className="modal-overlay active visible" style={{ display: 'flex' }}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }}>
            <button type="button" className="modal-close" onClick={() => setCreateAgentModalOpen(false)}>&times;</button>
            <div className="modal-header">
              <span className="modal-icon">👥</span>
              <div>
                <h3 className="modal-title">+ Add New Agent</h3>
                <p className="modal-subtitle">Roster a new call center operator</p>
              </div>
            </div>

            <form onSubmit={handleCreateAgent} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Full Name</label>
                <input type="text" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. Rahul Sharma" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email Address</label>
                <input type="email" value={newAgentEmail} onChange={(e) => setNewAgentEmail(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. rahul@7xvoip.com" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Login Password</label>
                <input type="text" value={newAgentPassword} onChange={(e) => setNewAgentPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>System Role</label>
                <select value={newAgentRole} onChange={(e) => setNewAgentRole(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
                  <option value="agent">Call Agent</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>
              <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setCreateAgentModalOpen(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Agent</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Create TFN Number ── */}
      {createTfnModalOpen && (
        <div className="modal-overlay active visible" style={{ display: 'flex' }}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }}>
            <button type="button" className="modal-close" onClick={() => setCreateTfnModalOpen(false)}>&times;</button>
            <div className="modal-header">
              <span className="modal-icon">📞</span>
              <div>
                <h3 className="modal-title">+ Add Toll-Free / DID</h3>
                <p className="modal-subtitle">Provision an inbound business phone number</p>
              </div>
            </div>

            <form onSubmit={handleCreateTfn} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Phone Number (E.164 format)</label>
                <input type="text" value={newTfnNumber} onChange={(e) => setNewTfnNumber(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. +18005550199" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Campaign Label</label>
                <input type="text" value={newTfnLabel} onChange={(e) => setNewTfnLabel(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. Sales Support TFN" />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Assigned SIP Gateway Trunk</label>
                <select value={newTfnTrunkId} onChange={(e) => setNewTfnTrunkId(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
                  <option value="">-- Default Carrier Trunk --</option>
                  {trunks.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.provider})</option>
                  ))}
                </select>
              </div>
              <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setCreateTfnModalOpen(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Add TFN Number</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Create SIP Trunk ── */}
      {createTrunkModalOpen && (
        <div className="modal-overlay active visible" style={{ display: 'flex' }}>
          <div className="modal-card" style={{ maxWidth: '520px', width: '92vw' }}>
            <button type="button" className="modal-close" onClick={() => setCreateTrunkModalOpen(false)}>&times;</button>
            <div className="modal-header">
              <span className="modal-icon">🌐</span>
              <div>
                <h3 className="modal-title">+ Add SIP Carrier Trunk</h3>
                <p className="modal-subtitle">Connect a new SIP provider gateway for outbound call routing</p>
              </div>
            </div>

            {/* Live SIP URI Preview */}
            {newTrunkHost && (
              <div style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '8px',
                padding: '8px 14px',
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SIP URI:</span>
                <code style={{ fontSize: '12px', color: '#a5b4fc', fontFamily: 'monospace' }}>sip:{newTrunkUsername || 'user'}@{newTrunkHost}:{newTrunkPort || 5060}</code>
              </div>
            )}

            <form onSubmit={handleCreateTrunk} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Trunk Display Name</label>
                <input type="text" value={newTrunkName} onChange={(e) => setNewTrunkName(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. Twilio 7xVoIP Trunk" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Provider</label>
                <select value={newTrunkProvider} onChange={(e) => setNewTrunkProvider(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
                  <option value="twilio">Twilio</option>
                  <option value="telnyx">Telnyx</option>
                  <option value="bandwidth">Bandwidth</option>
                  <option value="voipms">VoIP.ms</option>
                  <option value="plivo">Plivo</option>
                  <option value="generic">Generic SIP Proxy</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Proxy Host</label>
                <input type="text" value={newTrunkHost} onChange={(e) => setNewTrunkHost(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. 7xvoip.pstn.twilio.com" required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Port</label>
                <input type="number" value={newTrunkPort} onChange={(e) => setNewTrunkPort(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Username</label>
                <input type="text" value={newTrunkUsername} onChange={(e) => setNewTrunkUsername(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Password</label>
                <input type="password" value={newTrunkPassword} onChange={(e) => setNewTrunkPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Realm</label>
                <input type="text" value={newTrunkRealm} onChange={(e) => setNewTrunkRealm(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder={newTrunkHost || 'Same as host'} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Default DID Number</label>
                <input type="text" value={newTrunkDid} onChange={(e) => setNewTrunkDid(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="+1800..." />
              </div>
              <div className="modal-footer" style={{ gridColumn: 'span 2', marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setCreateTrunkModalOpen(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create SIP Trunk</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
