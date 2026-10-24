import { useState, useEffect } from 'react';
import api from '../api';

const POLL_MS = 8000;
const TIERS = ['critical', 'urgent', 'stable'];
const TIER_COLOURS = { critical: '#fed7d7', urgent: '#feebc8', stable: '#c6f6d5' };
const BUTTON_COLOURS = { critical: '#c53030', urgent: '#c05621', stable: '#2f855a' };

export default function DoctorQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true); // only true for the first load, so the page never blanks
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);   // { type: 'ok' | 'error', text }
  const [busyId, setBusyId] = useState(null);
  const [overrideId, setOverrideId] = useState(null);
  const [override, setOverride] = useState({ severity: '', reason: '' });
  const [now, setNow] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  // Load the queue, then keep it fresh quietly in the background
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/queue');
        if (!active) return;
        setQueue(Array.isArray(res.data) ? res.data : []);
        setNow(Date.now());
        setError(null);
      } catch (err) {
        console.error(err);
        if (active) setError('Cannot load the queue. Retrying...');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [refreshKey]);

  const submit = async (record, finalSeverity, reason) => {
    setBusyId(record.id);
    try {
      const res = await api.patch(`/triage/${record.id}/review`, {
        final_severity: finalSeverity,
        override_reason: reason || null,
      });
      setNotice({ type: 'ok', text: `${record.patient?.patient_code}: ${res.data.message}` });
      setOverrideId(null);
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', text: err.response?.data?.error || 'Cannot reach the server. Nothing was saved; please try again.' });
    } finally {
      setBusyId(null);
      setRefreshKey((k) => k + 1);
    }
  };

  if (loading) return <div>Loading patient queue...</div>;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Doctor Review Queue</h2>

      {notice && (
        <div style={{
          padding: '10px', marginBottom: '15px',
          backgroundColor: notice.type === 'ok' ? '#e6fffa' : '#fff5f5',
          border: `1px solid ${notice.type === 'ok' ? '#319795' : '#e53e3e'}`,
        }}>
          {notice.text}
        </div>
      )}
      {error && <div style={{ color: '#c53030', marginBottom: '10px' }}>{error}</div>}

      {queue.length === 0 ? (
        <p>No patients currently waiting.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {queue.map((record) => {
            const predicted = record.predicted_severity;
            const reasons = record.top_features?.reasons;
            const others = TIERS.filter((t) => t !== predicted);
            const busy = busyId === record.id;
            return (
              <div key={record.id} style={{ border: '1px solid #cbd5e0', padding: '15px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <strong>Token: {record.token_number} | Patient: {record.patient?.patient_code}</strong>
                  <span style={{ backgroundColor: TIER_COLOURS[predicted], padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    Predicted: {predicted}
                  </span>
                </div>

                <div style={{ fontSize: '0.9rem', color: '#4a5568', marginBottom: '12px' }}>
                  HR {record.heart_rate}, BP {record.systolic_bp}/{record.diastolic_bp}, SpO2 {record.spo2}%, RR {record.resp_rate}, Temp {record.temperature}°C
                  <br />
                  Complaint: {record.chief_complaint}
                  <br />
                  Waiting: {Math.max(0, Math.round((now - new Date(record.created_at).getTime()) / 60000))} min
                </div>

                {reasons && (
                  <div style={{ fontSize: '0.85rem', backgroundColor: '#f7fafc', padding: '10px', borderRadius: '4px', marginBottom: '12px' }}>
                    <strong>Why the model said {predicted}</strong>
                    {record.top_features.confidence != null && <span> ({Math.round(record.top_features.confidence * 100)}% confident)</span>}
                    <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                      {reasons.map((r, i) => (
                        <li key={i}>
                          {r.text}{' '}
                          <span style={{ color: r.direction === 'toward' ? '#c53030' : '#2f855a' }}>
                            ({r.direction === 'toward' ? 'raises' : 'lowers'} the predicted severity)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {overrideId === record.id ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); submit(record, override.severity, override.reason); }}
                    style={{ backgroundColor: '#f7fafc', padding: '10px', borderRadius: '4px' }}
                  >
                    <label style={{ display: 'block', marginBottom: '5px' }}>Change severity to:</label>
                    <select
                      value={override.severity}
                      onChange={(e) => setOverride({ ...override, severity: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
                    >
                      <option value="">-- Select severity --</option>
                      {others.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Reason for the change:</label>
                    <input
                      type="text"
                      value={override.reason}
                      onChange={(e) => setOverride({ ...override, reason: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="submit" disabled={busy} style={{ padding: '8px 16px', backgroundColor: '#2b6cb0', color: 'white', border: 'none', cursor: 'pointer' }}>
                        {busy ? 'Saving...' : 'Submit override'}
                      </button>
                      <button type="button" onClick={() => setOverrideId(null)} style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      disabled={busy}
                      onClick={() => submit(record, predicted, null)}
                      style={{ padding: '10px 18px', backgroundColor: BUTTON_COLOURS[predicted], color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}
                    >
                      {busy ? 'Saving...' : `Confirm ${predicted[0].toUpperCase() + predicted.slice(1)}`}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => { setOverrideId(record.id); setOverride({ severity: '', reason: '' }); }}
                      style={{ padding: '10px 18px', backgroundColor: '#e2e8f0', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    >
                      Change severity
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
