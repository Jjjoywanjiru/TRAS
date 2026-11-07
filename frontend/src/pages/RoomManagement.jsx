import { useState, useEffect } from 'react';
import api from '../api';
import { isShared } from '../rooms';

const POLL_MS = 8000;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export default function RoomManagement() {
  const [board, setBoard] = useState({ rooms: [], awaiting: [], allocations: [] });
  const [chosenRoom, setChosenRoom] = useState({}); // allocation id -> room id picked in the dropdown
  const [loading, setLoading] = useState(true);     // only true for the first load, so the page never blanks
  const [notice, setNotice] = useState(null);       // { type: 'ok' | 'err' | 'warn', text }
  const [busyKey, setBusyKey] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // One request fetches rooms, allocations and the waiting list; it refreshes quietly in the background
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/board');
        if (active) setBoard(res.data);
      } catch (err) {
        console.error(err);
        if (active) setNotice({ type: 'warn', text: 'Cannot reach the server. Showing the last data received.' });
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [refreshKey]);

  const act = async (key, request, okText) => {
    setBusyKey(key);
    try {
      const res = await request();
      setNotice({ type: 'ok', text: res.data?.message || okText });
    } catch (err) {
      console.error(err);
      setNotice({ type: 'err', text: err.response?.data?.error || 'Cannot reach the server. Nothing was changed; please try again.' });
    } finally {
      setBusyKey(null);
      setRefreshKey((k) => k + 1);
    }
  };

  const decide = (alloc, decision, newRoomId) =>
    act(`a${alloc.id}`, () => api.patch(`/allocation/${alloc.id}/decide`, {
      decision,
      ...(decision === 'modified' ? { new_room_id: Number(newRoomId) } : {}),
    }), 'Saved.');

  const outcome = (alloc, value) =>
    act(`a${alloc.id}`, () => api.patch(`/triage/${alloc.triage_record_id}/outcome`, { outcome: value }), 'Saved.');

  const findRoom = (rec) =>
    act(`w${rec.id}`, () => api.post(`/triage/${rec.id}/recommend-room`), 'Saved.');

  if (loading) return <div className="page">Loading rooms...</div>;

  const { rooms, awaiting, allocations } = board;
  const areas = rooms.filter(isShared);                                   // the Stable waiting area
  const freeRooms = rooms.filter((r) => !isShared(r) && r.status === 'free');

  // Rooms this patient can be moved to. Only Stable patients can use the waiting area.
  const roomOptions = (alloc) => rooms.filter((r) =>
    r.id !== alloc.room_id && r.status === 'free'
    && (!isShared(r) || alloc.triage_record?.final_severity === 'stable'));

  const roomPicker = (alloc, placeholder) => (
    <div className="picker">
      <select
        aria-label={placeholder}
        value={chosenRoom[alloc.id] || ''}
        onChange={(e) => setChosenRoom({ ...chosenRoom, [alloc.id]: e.target.value })}
      >
        <option value="">{placeholder}</option>
        {roomOptions(alloc).map((r) => (
          <option key={r.id} value={r.id}>
            {isShared(r) ? `${r.name} (${r.free_spots} places free)` : `${r.name} (${r.room_type})`}
          </option>
        ))}
      </select>
      <button
        className="btn"
        disabled={!chosenRoom[alloc.id] || busyKey === `a${alloc.id}`}
        onClick={() => decide(alloc, 'modified', chosenRoom[alloc.id])}
      >
        Use this room
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Room management</h1>
        <p>
          {freeRooms.length} free {freeRooms.length === 1 ? 'room' : 'rooms'}
          {freeRooms.length > 0 && <>: {freeRooms.map((r) => r.name).join(', ')}</>}
          {areas.map((a) => <span key={a.id}>. {a.name}: {a.free_spots} of {a.capacity} places free</span>)}
        </p>
      </div>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      {awaiting.length > 0 && (
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ marginBottom: '12px' }}>Waiting for a room ({awaiting.length})</h2>
          {awaiting.map((rec) => (
            <div key={rec.id} className="waiting-row">
              <span>
                <strong>{rec.patient?.patient_code}</strong> <span className="muted">token {rec.token_number}</span>{' '}
                <span className={`tier tier-${rec.final_severity}`}>{cap(rec.final_severity)}</span>
              </span>
              <button className="btn btn-primary" disabled={busyKey === `w${rec.id}`} onClick={() => findRoom(rec)}>
                {busyKey === `w${rec.id}` ? 'Looking...' : 'Find a room'}
              </button>
            </div>
          ))}
        </section>
      )}

      <h2 style={{ marginBottom: '12px' }}>Room allocations</h2>
      {allocations.length === 0 ? (
        <p className="muted">No patients are in rooms. Rooms appear here when a doctor confirms a patient.</p>
      ) : (
        <div className="alloc-grid">
          {allocations.filter((a) => !isShared(a.room)).map((alloc) => {
            const busy = busyKey === `a${alloc.id}`;
            const pending = alloc.decision === 'pending';
            const sev = alloc.triage_record?.final_severity;
            return (
              <article key={alloc.id} className={pending ? 'alloc pending' : 'alloc'}>
                <h3>
                  {alloc.room?.name}{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    ({isShared(alloc.room) ? 'shared area' : alloc.room?.room_type})
                  </span>
                </h3>
                <dl>
                  <dt>Patient</dt>
                  <dd>{alloc.triage_record?.patient?.patient_code}</dd>
                  <dt>Severity</dt>
                  <dd><span className={`tier tier-${sev}`}>{cap(sev)}</span></dd>
                  <dt>Status</dt>
                  <dd>
                    {pending ? 'Waiting for your decision' : cap(alloc.decision)}
                    {alloc.auto_assigned && <span className="auto">Assigned automatically (Critical)</span>}
                  </dd>
                </dl>

                {pending ? (
                  <div>
                    <div className="btn-row">
                      <button className="btn btn-stable" disabled={busy} onClick={() => decide(alloc, 'confirmed')}>Confirm room</button>
                      <button className="btn btn-danger-outline" disabled={busy} onClick={() => decide(alloc, 'rejected')}>Reject</button>
                    </div>
                    {roomPicker(alloc, 'Choose a different room')}
                  </div>
                ) : (
                  <div className="outcome">
                    <p>Record the outcome to free this room</p>
                    <div className="btn-row">
                      <button className="btn btn-primary btn-small" disabled={busy} onClick={() => outcome(alloc, 'admitted')}>Admit</button>
                      <button className="btn btn-small" disabled={busy} onClick={() => outcome(alloc, 'discharged')}>Discharge</button>
                      <button className="btn btn-small" disabled={busy} onClick={() => outcome(alloc, 'transferred')}>Transfer</button>
                    </div>
                    {roomPicker(alloc, 'Move to another room')}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {areas.map((area) => {
        const here = allocations.filter((a) => a.room_id === area.id);
        if (here.length === 0) return null;
        return (
          <section key={area.id} style={{ marginTop: '28px' }}>
            <h2 style={{ marginBottom: '12px' }}>
              {area.name} <span className="muted" style={{ fontWeight: 400 }}>({area.occupants} of {area.capacity} places taken)</span>
            </h2>
            {here.map((alloc) => {
              const busy = busyKey === `a${alloc.id}`;
              const pending = alloc.decision === 'pending';
              const sev = alloc.triage_record?.final_severity;
              return (
                <div key={alloc.id} className={pending ? 'wa-row pending' : 'wa-row'}>
                  <span className="wa-who">
                    <strong>{alloc.triage_record?.patient?.patient_code}</strong>{' '}
                    <span className={`tier tier-${sev}`}>{cap(sev)}</span>{' '}
                    <span className="muted">{pending ? 'waiting for your decision' : 'confirmed'}</span>
                  </span>
                  <span className="wa-actions">
                    {pending ? (
                      <>
                        <button className="btn btn-stable btn-small" disabled={busy} onClick={() => decide(alloc, 'confirmed')}>Confirm</button>
                        <button className="btn btn-danger-outline btn-small" disabled={busy} onClick={() => decide(alloc, 'rejected')}>Reject</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-primary btn-small" disabled={busy} onClick={() => outcome(alloc, 'admitted')}>Admit</button>
                        <button className="btn btn-small" disabled={busy} onClick={() => outcome(alloc, 'discharged')}>Discharge</button>
                        <button className="btn btn-small" disabled={busy} onClick={() => outcome(alloc, 'transferred')}>Transfer</button>
                      </>
                    )}
                    {roomPicker(alloc, 'Move to a room')}
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
