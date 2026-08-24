import React, { useState } from 'react';

export default function SipCredentialsModal({ isOpen, onClose, creds }) {
  if (!isOpen || !creds) return null;

  const [copied, setCopied] = useState(false);

  const fullConfigText = `7XVOIP SIP Credentials Inspector
====================================
Extension Number : ${creds.extNumber || '1001'}
SIP Username     : ${creds.sipUsername || creds.extNumber || '1001'}
SIP Password     : ${creds.sipPassword || 'Agent@123'}
SIP Domain/Realm : 7xvoip.com
WebRTC WSS URL   : wss://7xvoip.com/ws
Outbound DID/TFN : ${creds.tfnNumber || '+18005550199'}`;

  const copyCredentials = () => {
    navigator.clipboard.writeText(fullConfigText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-overlay active visible" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '540px', width: '92vw' }}>
        <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <span className="modal-icon">🔑</span>
          <div>
            <h3 className="modal-title">SIP Account Credentials</h3>
            <p className="modal-subtitle">Configure 7XVOIP on MicroSIP, Zoiper, Softphone, or WebRTC</p>
          </div>
        </div>

        <div className="modal-body" style={{ gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Account / Ext</div>
              <strong style={{ fontSize: '15px', color: 'var(--accent-light)' }}>{creds.extNumber || '1001'}</strong>
            </div>
            <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SIP Password</div>
              <strong style={{ fontSize: '15px', color: '#fbbf24' }}>{creds.sipPassword || 'Agent@123'}</strong>
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>SIP Domain & Proxy Realm</div>
            <div style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '13px' }}>7xvoip.com (Port 5060)</div>
          </div>

          <div className="card" style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>WebRTC WebSocket URL</div>
            <div style={{ fontFamily: 'monospace', color: '#34d399', fontSize: '13px' }}>wss://7xvoip.com/ws</div>
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={copyCredentials}>
            {copied ? '✓ Copied to Clipboard!' : '📋 Copy All Config'}
          </button>
        </div>
      </div>
    </div>
  );
}
