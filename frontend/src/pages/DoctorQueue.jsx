import { useState, useEffect, useRef } from 'react';
import api from '../api';
import { RANGES, flagFor } from '../vitals';

const POLL_MS = 8000;
const TIERS = ['critical', 'urgent', 'stable'];
const ICON = { critical: '!', urgent: '▲', stable: '✓' };
const CONSCIOUS = { 1: 'Alert', 2: 'Voice', 3: 'Pain', 4: 'Unresponsive' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function Tier({ tier }) {
  return <span className={`tier tier-${tier}`}>{ICON[tier]} {cap(tier)}</span>;
}

// One vital sign as a tile; a value outside the usual adult range gets an arrow and a red value
function Vital({ label, unit, valueKey, value, text }) {
  const flag = valueKey ? flagFor(valueKey, value) : null;
  const missing = value === null || value === undefined || value === '';
  return (
    <div className={flag ? 'vital abnormal' : 'vital'} title={flag ? `Usual adult range: ${RANGES[valueKey].text}` : undefined}>
      <div className="label">{label}</div>
      <div className="value">
        {flag === 'high' && '▲ '}{flag === 'low' && '▼ '}
        {missing ? 'not recorded' : (text ?? value)}
        {!missing && unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

export default function DoctorQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true); // only true for the first load, so the page never blanks
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);   // { type: 'ok' | 'err', text }
  const [busyId, setBusyId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [override, setOverride] = useState({ severity: '', reason: '' });
  const [now, setNow] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const dialogRef = useRef(null);

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

  // Esc closes the pop-up, and focus moves into it when it opens
  useEffect(() => {
    if (!overrideOpen) return undefined;
    dialogRef.current?.querySelector('select')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOverrideOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overrideOpen]);

  const submit = async (record, finalSeverity, reason) => {
    setBusyId(record.id);
    try {
      const res = await api.patch(`/triage/${record.id}/review`, {
        final_severity: finalSeverity,
        override_reason: reason || null,
      });
      setNotice({ type: 'ok', text: `${record.patient?.patient_code}: ${res.data.message}` });
      setOverrideOpen(false);
      setSelectedId(null);
    } catch (err) {
      console.error(err);
      setNotice({ type: 'err', text: err.response?.data?.error || 'Cannot reach the server. Nothing was saved; please try again.' });
    } finally {
      setBusyId(null);
      setRefreshKey((k) => k + 1);
    }
  };

  if (loading) return <div className="page">Loading patient queue...</div>;

  const waited = (r) => Math.max(0, Math.round((now - new Date(r.created_at).getTime()) / 60000));
  const record = queue.find((r) => r.id === selectedId) || queue[0] || null;
  const predicted = record?.predicted_severity;
  const reasons = record?.top_features?.reasons;
  const busy = record && busyId === record.id;
  const consciousness = record ? (CONSCIOUS[Number(record.consciousness)] || record.consciousness) : null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Doctor Queue</h1>
        <p>Patients waiting for you to confirm their severity.</p>
      </div>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {error && <div className="notice warn">{error}</div>}

      <div className="doctor-grid">
        <section className="panel" aria-label="Waiting queue">
          <div className="panel-title">
            <h2>Waiting queue</h2>
            <span className="muted">{queue.length} {queue.length === 1 ? 'patient' : 'patients'}</span>
          </div>
          <p className="muted">Sorted by severity, then waiting time</p>
          {queue.length === 0 ? (
            <p className="empty">No patients are waiting.</p>
          ) : (
            <div className="queue-list">
              {queue.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={r.id === record.id ? 'queue-item selected' : 'queue-item'}
                  aria-pressed={r.id === record.id}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="row">
                    <span className="tok">{r.patient?.patient_code}</span>
                    <Tier tier={r.predicted_severity} />
                  </div>
                  <div className="wait">Waiting {waited(r)} min</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-label="Patient review">
          <h2>Patient review</h2>
          {!record ? (
            <p className="empty">Select a patient from the queue when one arrives.</p>
          ) : (
            <>
              <div className="review-title">
                <h2>{record.patient?.patient_code}</h2>
                <Tier tier={predicted} />
              </div>
              <p className="muted">
                {record.patient?.age != null ? `Age ${record.patient.age} · ` : ''}Waiting {waited(record)} min · token {record.token_number}
              </p>

              <div className="vital-grid">
                <Vital label="Blood pressure" unit="mmHg" valueKey="systolic_bp" value={record.systolic_bp}
                  text={`${record.systolic_bp ?? '?'}/${record.diastolic_bp ?? '?'}`} />
                <Vital label="Heart rate" unit="bpm" valueKey="hr" value={record.heart_rate} />
                <Vital label="Resp. rate" unit="/min" valueKey="resp_rate" value={record.resp_rate} />
                <Vital label="SpO₂" unit="%" valueKey="spo2" value={record.spo2} />
                <Vital label="Temperature" unit="°C" valueKey="temperature" value={record.temperature} />
                <Vital label="Pain score" value={record.pain_scale} text={record.pain_scale != null ? `${record.pain_scale}/10` : undefined} />
                <Vital label="Consciousness" value={consciousness} />
                <Vital label="Chief complaint" value={record.chief_complaint} />
              </div>

              {record.spo2 == null && (
                <div className="notice warn">
                  Oxygen was not recorded, so the prediction is less reliable. Check the patient's oxygen level before you accept.
                </div>
              )}

              <div className="predicted">
                Predicted severity: <strong>{ICON[predicted]} {cap(predicted)}</strong>
                {record.top_features?.confidence != null && <span className="muted"> (model confidence {Math.round(record.top_features.confidence * 100)}%)</span>}
              </div>

              {reasons && (
                <div className="why">
                  <strong>Why this prediction</strong>
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

              <div className="review-actions">
                <button className="btn btn-primary" disabled={busy} onClick={() => submit(record, predicted, null)}>
                  {busy ? 'Saving...' : 'Accept'}
                </button>
                <button className="btn btn-outline" disabled={busy} onClick={() => { setOverride({ severity: '', reason: '' }); setOverrideOpen(true); }}>
                  Override
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {overrideOpen && record && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOverrideOpen(false); }}>
          <form
            ref={dialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-title"
            onSubmit={(e) => { e.preventDefault(); submit(record, override.severity, override.reason); }}
          >
            <h2 id="override-title">Override predicted severity</h2>
            <p className="muted">{record.patient?.patient_code} · Predicted: {cap(predicted)}</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="ov-sev">New severity</label>
              <select id="ov-sev" value={override.severity} required onChange={(e) => setOverride({ ...override, severity: e.target.value })}>
                <option value="">Choose severity</option>
                {TIERS.filter((t) => t !== predicted).map((t) => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ov-why">Reason for override (required)</label>
              <textarea id="ov-why" value={override.reason} required placeholder="Enter clinical reason" onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
            </div>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => setOverrideOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Confirm override'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}