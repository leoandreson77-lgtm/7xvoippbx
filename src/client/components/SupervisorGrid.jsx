import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Headphones, MessageSquare, Radio, PhoneOff,
  User, Clock, Phone, Activity, RefreshCw,
} from 'lucide-react';

export default function SupervisorGrid() {
  const { getHeaders } = useAuth();
  const [agents, setAgents] = useState([]);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 8000); // refresh every 8s
    return () => clearInterval(interval);
  }, []);

  const loadAgents = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/agents', {
        credentials: 'include',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (e) {}
    finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleSupervisorAction = async (action, extNumber, agentId) => {
    setActionInProgress(`${agentId}-${action}`);
    try {
      await fetch('/api/admin/supervisor/action', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ action, extension: extNumber }),
      });
    } catch (e) {}
    finally {
      setTimeout(() => setActionInProgress(null), 2000);
    }
  };

  const getAgentStatusInfo = (ag) => {
    if (ag.status === 'ON_CALL' || ag.status === 'ONLINE') {
      return { label: ag.status === 'ON_CALL' ? 'On Call' : 'Idle', className: ag.status === 'ON_CALL' ? 'oncall' : 'idle' };
    }
    if (ag.status === 'ON_BREAK' || ag.status === 'BREAK') {
      return { label: 'Break', className: 'break' };
    }
    return { label: 'Offline', className: 'offline' };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing {agents.length} Rostered Agents
        </span>
        <button
          onClick={loadAgents}
          disabled={isRefreshing}
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: '11px', gap: '6px', color: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}
        >
          <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} style={{ animation: isRefreshing ? 'spin 0.6s linear infinite' : 'none' }} />
          <span>{isRefreshing ? 'Syncing...' : 'Sync Live Status'}</span>
        </button>
      </div>

      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <User size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <p>No agents found</p>
        </div>
      ) : (
        <div className="sup-grid">
          {agents.map((ag) => {
            const statusInfo = getAgentStatusInfo(ag);
            const extNumber = ag.extension?.number || '—';
            const isOnCall = statusInfo.className === 'oncall';

            return (
              <div key={ag.id} className={`sup-agent-card sup-card-${statusInfo.className}`}>
                <div className="sup-card-header">
                  <div className="sup-card-agent">
                    <div className="sup-card-avatar">
                      {ag.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="sup-card-name">{ag.name}</div>
                      <div className="sup-card-ext">
                        <Phone size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        Ext {extNumber}
                      </div>
                    </div>
                  </div>
                  <div className={`sup-card-status sup-status-${statusInfo.className}`}>
                    <Activity size={10} />
                    {statusInfo.label}
                  </div>
                </div>

                <div className="sup-card-body">
                  <div className="sup-card-meta">
                    Status: <strong>{statusInfo.label}</strong>
                  </div>
                  {isOnCall && (
                    <div className="sup-card-timer">
                      <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Live
                    </div>
                  )}
                </div>

                {/* Supervisor Actions */}
                <div className="sup-card-actions">
                  <button
                    className="sup-action-btn sup-btn-listen"
                    onClick={() => handleSupervisorAction('listen', extNumber, ag.id)}
                    disabled={!isOnCall || actionInProgress === `${ag.id}-listen`}
                    title="Silent Monitor"
                  >
                    <Headphones size={12} />
                    <span>Listen</span>
                  </button>
                  <button
                    className="sup-action-btn sup-btn-whisper"
                    onClick={() => handleSupervisorAction('whisper', extNumber, ag.id)}
                    disabled={!isOnCall || actionInProgress === `${ag.id}-whisper`}
                    title="Coach Agent"
                  >
                    <MessageSquare size={12} />
                    <span>Whisper</span>
                  </button>
                  <button
                    className="sup-action-btn sup-btn-barge"
                    onClick={() => handleSupervisorAction('barge', extNumber, ag.id)}
                    disabled={!isOnCall || actionInProgress === `${ag.id}-barge`}
                    title="Join Call"
                  >
                    <Radio size={12} />
                    <span>Barge</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
