import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function EditTfnModal({ isOpen, onClose, tfn, trunks = [], extensions = [], onSave }) {
  if (!isOpen || !tfn) return null;

  const { getHeaders } = useAuth();
  const [label, setLabel] = useState(tfn.label || '');
  const [trunkId, setTrunkId] = useState(tfn.trunkId || tfn.trunk?.id || '');
  const [selectedExtIds, setSelectedExtIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tfn) {
      setLabel(tfn.label || '');
      setTrunkId(tfn.trunkId || tfn.trunk?.id || '');
      const mappedIds = tfn.extensions ? tfn.extensions.map(e => e.id) : [];
      setSelectedExtIds(mappedIds);
      setError(null);
    }
  }, [tfn]);

  const handleToggleExt = (extId) => {
    setSelectedExtIds(prev =>
      prev.includes(extId) ? prev.filter(id => id !== extId) : [...prev, extId]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tfns/${tfn.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          label,
          trunkId: trunkId || null,
          extensionIds: selectedExtIds,
        }),
      });
      if (res.ok) {
        onSave();
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to update TFN');
      }
    } catch (e) {
      setError('Connection error updating TFN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active visible" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '460px', width: '92vw' }}>
        <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <span className="modal-icon">📞</span>
          <div>
            <h3 className="modal-title">Edit TFN {tfn.number}</h3>
            <p className="modal-subtitle">Update campaign label, gateway trunk & mapped extensions</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginTop: '10px' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Campaign / DID Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} placeholder="e.g. Sales Toll-Free" required />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Assign Carrier SIP Trunk</label>
            <select value={trunkId} onChange={(e) => setTrunkId(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
              <option value="">— Default System Carrier —</option>
              {trunks.map((tr) => (
                <option key={tr.id} value={tr.id}>{tr.name} ({tr.provider})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Aligned Extensions (Call Routing Group)</label>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px', maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {extensions.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No extensions provisioned</span>
              ) : (
                extensions.map((ext) => {
                  const isChecked = selectedExtIds.includes(ext.id);
                  return (
                    <label key={ext.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleExt(ext.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>Ext {ext.number} {ext.agent ? `(${ext.agent.name})` : ''}</span>
                    </label>
                  );
                })
              )}
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Unchecking all extensions means this TFN will ring all online extensions.</span>
          </div>

          <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save TFN Config'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
