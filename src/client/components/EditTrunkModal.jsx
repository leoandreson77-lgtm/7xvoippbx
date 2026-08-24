import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function EditTrunkModal({ isOpen, onClose, trunk, onSave }) {
  if (!isOpen || !trunk) return null;

  const { getHeaders } = useAuth();
  const [name, setName] = useState(trunk.name || '');
  const [provider, setProvider] = useState(trunk.provider || 'twilio');
  const [host, setHost] = useState(trunk.host || '');
  const [port, setPort] = useState(trunk.port || 5060);
  const [username, setUsername] = useState(trunk.username || '');
  const [password, setPassword] = useState(trunk.password || '');
  const [didNumber, setDidNumber] = useState(trunk.didNumber || '');
  const [realm, setRealm] = useState(trunk.realm || '');
  const [enabled, setEnabled] = useState(trunk.enabled !== false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (trunk) {
      setName(trunk.name || '');
      setProvider(trunk.provider || 'twilio');
      setHost(trunk.host || '');
      setPort(trunk.port || 5060);
      setUsername(trunk.username || '');
      setPassword(trunk.password || '');
      setDidNumber(trunk.didNumber || '');
      setRealm(trunk.realm || '');
      setEnabled(trunk.enabled !== false);
      setTestResult(null);
    }
  }, [trunk]);

  const sipUri = `sip:${username || 'user'}@${host || 'host'}:${port || 5060}`;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/trunks/${trunk.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ name, provider, host, port: Number(port), username, password, didNumber, realm, enabled }),
      });
      if (res.ok) {
        onSave();
        onClose();
      }
    } catch (e) {} finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/trunks/${trunk.id}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ success: false, status: 'ERROR', raw: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-overlay active visible" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '520px', width: '92vw' }}>
        <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <span className="modal-icon">🌐</span>
          <div>
            <h3 className="modal-title">Edit SIP Trunk: {trunk.name}</h3>
            <p className="modal-subtitle">Update SIP gateway carrier configuration</p>
          </div>
        </div>

        {/* SIP URI Preview */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginTop: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SIP URI:</span>
          <code style={{ fontSize: '12px', color: '#a5b4fc', fontFamily: 'monospace', wordBreak: 'break-all' }}>{sipUri}</code>
        </div>

        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Trunk Display Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
              <option value="bandwidth">Bandwidth</option>
              <option value="voipms">VoIP.ms</option>
              <option value="plivo">Plivo</option>
              <option value="generic">Generic SIP</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Status</label>
            <div
              onClick={() => setEnabled(!enabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '6px',
                border: `1px solid ${enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                background: enabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <div style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: enabled ? '#10b981' : '#6b7280',
                position: 'relative',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '2px',
                  left: enabled ? '18px' : '2px',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '12px', color: enabled ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Proxy Host</label>
            <input type="text" value={host} onChange={(e) => setHost(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Port</label>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Realm</label>
            <input type="text" value={realm} onChange={(e) => setRealm(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder={host || 'Same as host'} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Default Outbound DID</label>
            <input type="text" value={didNumber} onChange={(e) => setDidNumber(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="+1800..." />
          </div>

          {/* Test Connection */}
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="btn btn-ghost"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '12px',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#a5b4fc',
              }}
            >
              {testing ? '⏳ Testing Connection...' : '🔌 Test SIP Trunk Connection'}
            </button>
            {testResult && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                background: testResult.registered ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${testResult.registered ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: testResult.registered ? '#10b981' : '#ef4444',
              }}>
                <strong>Status:</strong> {testResult.status || 'UNKNOWN'} — {testResult.registered ? '✅ Registered' : '❌ Not Registered'}
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ gridColumn: 'span 2', marginTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save Trunk Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
