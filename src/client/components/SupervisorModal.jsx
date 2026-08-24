import React from 'react';

export default function SupervisorModal({ isOpen, onClose, extNumber }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay active visible" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }}>
        <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <span className="modal-icon">⚙️</span>
          <div>
            <h3 className="modal-title">Supervisor Audio Control</h3>
            <p className="modal-subtitle">Live Audio Monitoring for Extension {extNumber}</p>
          </div>
        </div>

        <div className="modal-body" style={{ gap: '12px' }}>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '12px', padding: '12px', border: '1px solid var(--border-subtle)' }} onClick={onClose}>
            <span style={{ fontSize: '20px' }}>🎧</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Listen (Silent Monitor)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Listen to live call audio silently</div>
            </div>
          </button>

          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '12px', padding: '12px', border: '1px solid var(--border-subtle)' }} onClick={onClose}>
            <span style={{ fontSize: '20px' }}>🗣️</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Whisper (Coach Agent)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Speak to agent without customer hearing</div>
            </div>
          </button>

          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', gap: '12px', padding: '12px', border: '1px solid var(--border-subtle)' }} onClick={onClose}>
            <span style={{ fontSize: '20px' }}>📢</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Barge (3-Way Join)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Join live call into full 3-way conference</div>
            </div>
          </button>
        </div>

        <div className="modal-footer" style={{ marginTop: '16px' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
