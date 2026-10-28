import { useState, useEffect } from 'react';
import api from '../api';
import { RANGES, flagFor } from '../vitals';

const POLL_MS = 8000;
const TIERS = ['critical', 'urgent', 'stable'];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// One vital sign shown like a monitor readout; a value outside the usual adult range is flagged in words
function Readout({ label, unit, valueKey, value }) {
  const flag = flagFor(valueKey, value);
  const missing = value === null || value === undefined;
  return (
    <div className={flag ? 'readout abnormal' : 'readout'} title={flag ? `Usual adult range: ${RANGES[valueKey].text}` : undefined}>
      <div className="label">{label}</div>
      <div className="value">
        {missing ? 'not recorded' : value}
        {!missing && unit && <span className="unit">{unit}</span>}
      </div>
      {flag && <span className="flag">{flag}</span>}
    </div>
  );
}

export default function DoctorQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true); // only true for the first load, so the page never blanks
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);   // { type: 'ok' | 'err', text }
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
        if (active) setError('Cannot load the queue. Trying again shortly.');
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
      setNotice({ type: 'err', text: err.response?.data?.error || 'Cannot reach the server. Nothing was saved; please try again.' });
    } finally {
      setBusyId(null);
      setRefreshKey((k) => k + 1);
    }
  };

  if (loading) return <div className="page">Loading patient queue...</div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Doctor review</h1>
        <p>{queue.length === 0 ? 'No patients are waiting.' : `${queue.length} waiting, most urgent first.`}</p>
      </div>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {error && <div className="notice warn">{error}</div>}

      <div className="stack">
        {queue.map((record) => {
          const predicted = record.predicted_severity;
          const reasons = record.top_features?.reasons;
          const others = TIERS.filter((t) => t !== predicted);
          const busy = busyId === record.id;
          const waited = Math.max(0, Math.round((now - new Date(record.created_at).getTime()) / 60000));
          return (
            <article key={record.id} className={`sev-card sev-${predicted}`}>
              <div className="card-head">
                <div>
                  <span className="id">{record.patient?.patient_code}</span>{' '}
                  <span className="meta">token {record.token_number}</span>
                </div>
                <div>
                  <span className={`tier tier-${predicted}`}>Predicted {cap(predicted)}</span>{' '}
                  <span className="meta">waiting {waited} min</span>
                </div>
              </div>

              <div className="readouts">
                <Readout label="Heart rate" unit="bpm" valueKey="hr" value={record.heart_rate} />
                <Readout label="Systolic BP" unit="mmHg" valueKey="systolic_bp" value={record.systolic_bp} />
                <Readout label="Diastolic BP" unit="mmHg" valueKey="diastolic_bp" value={record.diastolic_bp} />
                <Readout label="Oxygen" unit="%" valueKey="spo2" value={record.spo2} />
                <Readout label="Breathing" unit="/min" valueKey="resp_rate" value={record.resp_rate} />
                <Readout label="Temperature" unit="°C" valueKey="temperature" value={record.temperature} />
              </div>

              {record.spo2 == null && (
                <div className="notice warn">
                  Oxygen was not recorded, so the prediction is less reliable. Check the patient's oxygen level before you confirm.
                </div>
              )}

              <p style={{ marginBottom: '12px' }}><strong>Complaint:</strong> {record.chief_complaint}</p>

              {reasons && (
                <div className="why">
                  <strong>Why the model predicted {cap(predicted)}</strong>
                  {record.top_features.confidence != null && <span className="muted"> ({Math.round(record.top_features.confidence * 100)}% confident)</span>}
                  <ul>
                    {reasons.map((r, i) => (
                      <li key={i}>
                        {r.text}{' '}
                        <span className={r.direction === 'toward' ? 'up' : 'down'}>
                          ({r.direction === 'toward' ? 'raises' : 'lowers'} the predicted severity)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {overrideId === record.id ? (
                <form onSubmit={(e) => { e.preventDefault(); submit(record, override.severity, override.reason); }}>
                  <div className="form-grid" style={{ marginBottom: '12px' }}>
                    <div className="field">
                      <label htmlFor={`sev-${record.id}`}>Change severity to</label>
                      <select id={`sev-${record.id}`} value={override.severity} required onChange={(e) => setOverride({ ...override, severity: e.target.value })}>
                        <option value="">Choose severity</option>
                        {others.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`why-${record.id}`}>Reason for the change</label>
                      <input id={`why-${record.id}`} type="text" value={override.reason} required onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
                    </div>
                  </div>
                  <div className="btn-row">
                    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save override'}</button>
                    <button type="button" className="btn" onClick={() => setOverrideId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="btn-row">
                  <button className={`btn btn-${predicted}`} disabled={busy} onClick={() => submit(record, predicted, null)}>
                    {busy ? 'Saving...' : `Confirm ${cap(predicted)}`}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => { setOverrideId(record.id); setOverride({ severity: '', reason: '' }); }}>
                    Change severity
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
