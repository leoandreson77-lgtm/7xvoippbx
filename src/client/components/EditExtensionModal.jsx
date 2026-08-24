import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function EditExtensionModal({ isOpen, onClose, extension, agents, tfns = [], onSave }) {
  if (!isOpen || !extension) return null;

  const { getHeaders } = useAuth();
  const [sipPassword, setSipPassword] = useState(extension.sipPassword || '');
  const [agentId, setAgentId] = useState(extension.agentId || extension.agent?.id || '');
  const [tfnId, setTfnId] = useState(extension.tfnId || extension.tfn?.id || '');
  const [enabled, setEnabled] = useState(extension.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (extension) {
      setSipPassword(extension.sipPassword || '');
      setAgentId(extension.agentId || extension.agent?.id || '');
      setTfnId(extension.tfnId || extension.tfn?.id || '');
      setEnabled(extension.enabled ?? true);
      setError(null);
    }
  }, [extension]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/extensions/${extension.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          sipPassword,
          agentId: agentId || null,
          tfnId: tfnId || null,
          enabled,
        }),
      });
      if (res.ok) {
        onSave();
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to update extension settings');
      }
    } catch (e) {
      setError('Connection error updating extension');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active visible" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }}>
        <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <span className="modal-icon">✏️</span>
          <div>
            <h3 className="modal-title">Edit Extension {extension.number}</h3>
            <p className="modal-subtitle">Update SIP password, Agent & TFN mapping</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginTop: '10px' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SIP Password</label>
            <input type="text" value={sipPassword} onChange={(e) => setSipPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} required />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Assign Rostered Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
              <option value="">— Unassigned —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>📞 Map to Toll-Free / DID (TFN Routing)</label>
            <select value={tfnId} onChange={(e) => setTfnId(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
              <option value="">— Unassigned (Rings on all TFNs) —</option>
              {tfns.map((t) => (
                <option key={t.id} value={t.id}>{t.number} ({t.label || 'TFN'})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Enable Extension</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          </div>

          <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save Extension'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
