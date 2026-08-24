import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSip } from '../context/SipContext';
import Softphone from '../components/Softphone';
import {
  LogOut, Shield, ChevronDown, User, Phone,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Clock, Activity, Coffee, WifiOff, CheckCircle,
  BarChart3, TrendingUp, Headphones, XCircle,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { id: 'AVAILABLE', label: 'Available', icon: CheckCircle, color: 'var(--success)', dot: 'online' },
  { id: 'ON_BREAK', label: 'On Break', icon: Coffee, color: 'var(--warning)', dot: 'ringing' },
  { id: 'OFFLINE', label: 'Offline', icon: WifiOff, color: 'var(--text-muted)', dot: 'offline' },
];

export default function DashboardPage() {
  const { agent, extension, logout, getHeaders } = useAuth();
  const { sipStatus, sipStatusText, callState, recentCalls } = useSip();

  const [agentStatus, setAgentStatus] = useState('AVAILABLE');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [cdrLogs, setCdrLogs] = useState([]);
  const [cdrLoading, setCdrLoading] = useState(true);
  const statusRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch CDR logs for current agent
  useEffect(() => {
    async function loadCDR() {
      try {
        const endpoint = agent && agent.role === 'admin' ? '/api/admin/cdr?limit=30' : '/api/agent/calls?limit=30';
        const res = await fetch(endpoint, {
          credentials: 'include',
          headers: getHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const logs = Array.isArray(data) ? data : data.logs || [];
          setCdrLogs(logs);
        }
      } catch (e) { /* silently fail */ }
      finally { setCdrLoading(false); }
    }
    if (agent) loadCDR();
    const interval = setInterval(loadCDR, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, [agent]);

  const handleStatusChange = async (statusId) => {
    setAgentStatus(statusId);
    setShowStatusDropdown(false);
    try {
      await fetch('/api/agent/status', {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ status: statusId }),
      });
    } catch (e) {}
  };

  const formatTime = (secs) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.id === agentStatus) || STATUS_OPTIONS[0];
  const StatusIcon = currentStatus.icon;

  // Stats from recent calls
  const totalCalls = recentCalls.length;
  const answeredCalls = recentCalls.filter(c => c.status === 'answered').length;
  const avgDuration = totalCalls > 0
    ? Math.round(recentCalls.reduce((a, c) => a + (c.duration || 0), 0) / totalCalls)
    : 0;

  return (
    <div className="dash">
      {/* ── Sticky Top Bar ── */}
      <header className="dash-topbar">
        <div className="dash-topbar-left">
          <div className="dash-brand">
            <Headphones size={20} className="dash-brand-icon" />
            <span className="dash-brand-text">7XVOIP</span>
          </div>
          <div className="dash-topbar-divider" />
          <div className="dash-agent-info">
            <div className="dash-avatar">
              {agent ? agent.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="dash-agent-meta">
              <span className="dash-agent-name">{agent ? agent.name : 'Agent'}</span>
              <span className="dash-agent-ext">
                <Phone size={10} />
                {extension ? `Ext ${extension.number}` : 'No Extension'}
              </span>
            </div>
          </div>
        </div>

        <div className="dash-topbar-center">
          {/* Agent Status Dropdown */}
          <div className="dash-status-dropdown" ref={statusRef}>
            <button
              className={`dash-status-btn dash-status-${agentStatus.toLowerCase()}`}
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              <span className={`status-dot ${currentStatus.dot}`} />
              <StatusIcon size={14} />
              <span>{currentStatus.label}</span>
              <ChevronDown size={14} className={`dash-chevron ${showStatusDropdown ? 'dash-chevron-open' : ''}`} />
            </button>

            {showStatusDropdown && (
              <div className="dash-status-menu">
                <div className="dash-status-menu-header">Set Status</div>
                {STATUS_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      className={`dash-status-option ${agentStatus === opt.id ? 'selected' : ''}`}
                      onClick={() => handleStatusChange(opt.id)}
                    >
                      <span className={`status-dot ${opt.dot}`} />
                      <Icon size={14} style={{ color: opt.color }} />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SIP Registration Status */}
          <div className={`dash-sip-badge ${sipStatus === 'ONLINE' ? 'dash-sip-online' : 'dash-sip-offline'}`}>
            <Activity size={12} />
            <span>SIP: {sipStatusText}</span>
          </div>
        </div>

        <div className="dash-topbar-right">
          {agent && agent.role === 'admin' && (
            <Link to="/admin" className="dash-nav-link">
              <Shield size={14} />
              <span>Admin</span>
            </Link>
          )}
          <button className="dash-logout-btn" onClick={logout}>
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Main Split View ── */}
      <main className="dash-main">
        {/* LEFT: Persistent Softphone */}
        <aside className="dash-left">
          <Softphone />
        </aside>

        {/* RIGHT: Stats + CDR Table */}
        <section className="dash-right">
          {/* Quick Stats Row */}
          <div className="dash-stats-row">
            <div className="dash-stat-card">
              <div className="dash-stat-icon-wrap dash-stat-calls">
                <Phone size={18} />
              </div>
              <div className="dash-stat-content">
                <span className="dash-stat-value">{totalCalls}</span>
                <span className="dash-stat-label">Calls Today</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon-wrap dash-stat-answered">
                <CheckCircle size={18} />
              </div>
              <div className="dash-stat-content">
                <span className="dash-stat-value">{answeredCalls}</span>
                <span className="dash-stat-label">Answered</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon-wrap dash-stat-duration">
                <Clock size={18} />
              </div>
              <div className="dash-stat-content">
                <span className="dash-stat-value">{formatTime(avgDuration)}</span>
                <span className="dash-stat-label">Avg Duration</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon-wrap dash-stat-status">
                <TrendingUp size={18} />
              </div>
              <div className="dash-stat-content">
                <span className="dash-stat-value">{totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0}%</span>
                <span className="dash-stat-label">Answer Rate</span>
              </div>
            </div>
          </div>

          {/* Recent Call Activity */}
          <div className="dash-recent-header">
            <div className="dash-recent-title">
              <BarChart3 size={18} />
              <h2>Call Activity</h2>
            </div>
            <span className="dash-recent-count">{recentCalls.length + cdrLogs.length} records</span>
          </div>

          {/* CDR Table */}
          <div className="dash-cdr-table-wrap">
            <table className="dash-cdr-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Number</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {/* Live recent calls from SIP context */}
                {recentCalls.map((call) => (
                  <tr key={call.id} className="dash-cdr-row dash-cdr-live">
                    <td>
                      <div className="dash-cdr-dir">
                        {call.direction === 'outbound'
                          ? <PhoneOutgoing size={14} className="dash-icon-outbound" />
                          : <PhoneIncoming size={14} className="dash-icon-inbound" />
                        }
                        <span>{call.direction === 'outbound' ? 'Outbound' : 'Inbound'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="dash-cdr-number">{call.calleeNumber || call.callerNumber}</span>
                    </td>
                    <td>
                      <span className={`dash-cdr-status-badge dash-cdr-${call.status}`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="dash-cdr-duration">{formatTime(call.duration)}</td>
                    <td className="dash-cdr-time">{formatDate(call.startedAt)}</td>
                  </tr>
                ))}

                {/* Historical CDR from server */}
                {cdrLogs.map((log) => (
                  <tr key={log.id} className="dash-cdr-row">
                    <td>
                      <div className="dash-cdr-dir">
                        {log.direction === 'outbound'
                          ? <PhoneOutgoing size={14} className="dash-icon-outbound" />
                          : <PhoneIncoming size={14} className="dash-icon-inbound" />
                        }
                        <span>{log.direction === 'outbound' ? 'Outbound' : 'Inbound'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="dash-cdr-number">
                        {log.direction === 'outbound' ? log.calleeNumber : log.callerNumber}
                      </span>
                    </td>
                    <td>
                      <span className={`dash-cdr-status-badge dash-cdr-${log.status}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="dash-cdr-duration">{formatTime(log.duration)}</td>
                    <td className="dash-cdr-time">{formatDate(log.startedAt)}</td>
                  </tr>
                ))}

                {recentCalls.length === 0 && cdrLogs.length === 0 && !cdrLoading && (
                  <tr>
                    <td colSpan="5" className="dash-cdr-empty">
                      <Phone size={32} className="dash-empty-icon" />
                      <span>No call history yet. Make your first call!</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
