import { useState, useEffect } from 'react';
import api from '../api';
import { isShared } from '../rooms';

const REFRESH_MS = 5000;
const STATE_TEXT = { free: 'Free', reserved: 'Reserved, awaiting confirmation', occupied: 'Occupied' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export default function OperationsBoard() {
  const [board, setBoard] = useState({ rooms: [], queue: [], awaiting: [], allocations: [] });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/board'); // one request for the whole board
        if (!active) return;
        setBoard(res.data);
        setNow(Date.now());
        setUpdatedAt(new Date());
        setError(null);
      } catch (err) {
        console.error(err);
        if (active) setError('Cannot reach the server. Showing the last data received.');
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const { rooms, queue, awaiting, allocations } = board;
  const minutesSince = (iso) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));

  const patientInRoom = {};
  allocations.forEach((a) => { patientInRoom[a.room_id] = a; });

  const singles = rooms.filter((r) => !isShared(r));
  const areas = rooms.filter(isShared);                       // the Stable waiting area
  const placesTaken = areas.reduce((n, r) => n + (r.occupants || 0), 0);
  const placesTotal = areas.reduce((n, r) => n + r.capacity, 0);
  const freeCount = singles.filter((r) => r.status === 'free').length;
  const criticalWaiting = queue.filter((q) => q.predicted_severity === 'critical').length;
  const longestWait = queue.length ? Math.max(...queue.map((q) => minutesSince(q.created_at))) : 0;

  return (
    <div className="page">
      <div className="page-head head-row">
        <div>
          <h1>Operations board</h1>
          <p>What is happening in the department right now.</p>
        </div>
        <span className="updated">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}, refreshes every ${REFRESH_MS / 1000} seconds` : 'Loading...'}
        </span>
      </div>

      {error && <div className="notice warn">{error}</div>}

      <div className="statbar">
        <div className="stat"><div className="num">{queue.length}</div><div className="cap">Waiting for a doctor</div></div>
        <div className={criticalWaiting ? 'stat alert' : 'stat'}><div className="num">{criticalWaiting}</div><div className="cap">Critical, waiting</div></div>
        <div className="stat"><div className="num">{longestWait}<span className="muted" style={{ fontSize: '1rem' }}> min</span></div><div className="cap">Longest wait</div></div>
        <div className={awaiting.length ? 'stat alert' : 'stat'}><div className="num">{awaiting.length}</div><div className="cap">Waiting for a room</div></div>
        <div className="stat"><div className="num">{freeCount}<span className="muted" style={{ fontSize: '1rem' }}> of {singles.length}</span></div><div className="cap">Rooms free</div></div>
        {areas.length > 0 && (
          <div className="stat"><div className="num">{placesTaken}<span className="muted" style={{ fontSize: '1rem' }}> of {placesTotal}</span></div><div className="cap">Waiting area places taken</div></div>
        )}
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Rooms</h2>
      <div className="bay-grid">
        {singles.map((room) => {
          const alloc = patientInRoom[room.id];
          const sev = alloc?.triage_record?.final_severity;
          return (
            <div key={room.id} className={`bay ${room.status}`}>
              <div className="name">{room.name}</div>
              <div className="type">{cap(room.room_type)}</div>
              <div className="state">{STATE_TEXT[room.status] || room.status}</div>
              {alloc && room.status !== 'free' && (
                <div className="who-in">
                  {alloc.triage_record?.patient?.patient_code}{' '}
                  <span className={`tier tier-${sev}`}>{cap(sev)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {areas.map((area) => {
        const here = allocations.filter((a) => a.room_id === area.id);
        const seats = Array.from({ length: area.capacity }, (_, i) => here[i] || null);
        return (
          <section key={area.id} className="area" aria-label={area.name}>
            <div className="area-head">
              <h2>{area.name}</h2>
              <span className={area.free_spots === 0 ? 'area-count full' : 'area-count'}>
                {area.occupants} of {area.capacity} places taken
              </span>
            </div>
            <div className="seats">
              {seats.map((a, i) => (a ? (
                <div key={a.id} className={a.decision === 'pending' ? 'seat taken pending' : 'seat taken'}>
                  {a.triage_record?.patient?.patient_code}
                  <span className="muted">{a.decision === 'pending' ? 'awaiting approval' : 'confirmed'}</span>
                </div>
              ) : (
                <div key={`free${i}`} className="seat">free</div>
              )))}
            </div>
          </section>
        );
      })}

      <h2 className="section-title">Waiting for a doctor</h2>
      {queue.length === 0 ? (
        <p className="muted">Nobody is waiting for review.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Token</th><th>Patient</th><th>Predicted</th><th>Complaint</th><th>Waiting</th></tr>
          </thead>
          <tbody>
            {queue.map((rec) => (
              <tr key={rec.id}>
                <td className="num">{rec.token_number}</td>
                <td>{rec.patient?.patient_code}</td>
                <td><span className={`tier tier-${rec.predicted_severity}`}>{cap(rec.predicted_severity)}</span></td>
                <td>{rec.chief_complaint}</td>
                <td className="num">{minutesSince(rec.created_at)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {awaiting.length > 0 && (
        <>
          <h2 className="section-title">Reviewed, waiting for a room</h2>
          <table className="table">
            <thead><tr><th>Token</th><th>Patient</th><th>Severity</th></tr></thead>
            <tbody>
              {awaiting.map((rec) => (
                <tr key={rec.id}>
                  <td className="num">{rec.token_number}</td>
                  <td>{rec.patient?.patient_code}</td>
                  <td><span className={`tier tier-${rec.final_severity}`}>{cap(rec.final_severity)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
