import { useState, useEffect } from 'react';
import api from '../api';

const POLL_MS = 8000;

const btn = (bg) => ({ padding: '8px 12px', backgroundColor: bg, color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' });

export default function RoomManagement() {
  const [board, setBoard] = useState({ rooms: [], awaiting: [], allocations: [] });
  const [chosenRoom, setChosenRoom] = useState({}); // allocation id -> room id picked in the dropdown
  const [loading, setLoading] = useState(true);     // only true for the first load, so the page never blanks
  const [notice, setNotice] = useState(null);       // { type: 'ok' | 'error', text }
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
        if (active) setNotice({ type: 'error', text: 'Cannot reach the server. Showing the last data received.' });
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
      setNotice({ type: 'error', text: err.response?.data?.error || 'Cannot reach the server. Nothing was changed; please try again.' });
    } finally {
      setBusyKey(null);
      setRefreshKey((k) => k + 1);
    }
  };

  const decide = (alloc, decision, newRoomId) =>
    act(`a${alloc.id}`, () => api.patch(`/allocation/${alloc.id}/decide`, {
      decision,
      ...(decision === 'modified' ? { new_room_id: Number(newRoomId) } : {}),
    }), 'Done.');

  const outcome = (alloc, value) =>
    act(`a${alloc.id}`, () => api.patch(`/triage/${alloc.triage_record_id}/outcome`, { outcome: value }), 'Done.');

  const findRoom = (rec) =>
    act(`w${rec.id}`, () => api.post(`/triage/${rec.id}/recommend-room`), 'Done.');

  if (loading) return <div>Loading allocations...</div>;

  const { rooms, awaiting, allocations } = board;
  const freeRooms = rooms.filter((r) => r.status === 'free');

  const roomPicker = (alloc, label) => (
    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
      <select
        value={chosenRoom[alloc.id] || ''}
        onChange={(e) => setChosenRoom({ ...chosenRoom, [alloc.id]: e.target.value })}
        style={{ flex: 1, padding: '6px' }}
      >
        <option value="">{label}</option>
        {freeRooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_type})</option>)}
      </select>
      <button
        disabled={!chosenRoom[alloc.id] || busyKey === `a${alloc.id}`}
        onClick={() => decide(alloc, 'modified', chosenRoom[alloc.id])}
        style={{ ...btn('#805ad5'), opacity: chosenRoom[alloc.id] ? 1 : 0.5 }}
      >
        Use this room
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Room Management (Nurse in Charge)</h2>

      {notice && (
        <div style={{
          padding: '10px', marginBottom: '15px',
          backgroundColor: notice.type === 'ok' ? '#e6fffa' : '#fff5f5',
          border: `1px solid ${notice.type === 'ok' ? '#319795' : '#e53e3e'}`,
        }}>
          {notice.text}
        </div>
      )}

      <p style={{ color: '#4a5568' }}>
        Free rooms right now: <strong>{freeRooms.length}</strong>
        {freeRooms.length > 0 && <> ({freeRooms.map((r) => r.name).join(', ')})</>}
      </p>

      {awaiting.length > 0 && (
        <div style={{ marginBottom: '25px' }}>
          <h3>Waiting for a room ({awaiting.length})</h3>
          {awaiting.map((rec) => (
            <div key={rec.id} style={{ border: '2px solid #e53e3e', borderRadius: '8px', padding: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{rec.patient?.patient_code}</strong> (token {rec.token_number}) &mdash;{' '}
                <span style={{ textTransform: 'uppercase' }}>{rec.final_severity}</span>
              </span>
              <button disabled={busyKey === `w${rec.id}`} onClick={() => findRoom(rec)} style={btn('#2b6cb0')}>
                {busyKey === `w${rec.id}` ? 'Looking...' : 'Find a room'}
              </button>
            </div>
          ))}
        </div>
      )}

      <h3>Room allocations</h3>
      {allocations.length === 0 ? (
        <p>No active room allocations.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {allocations.map((alloc) => {
            const busy = busyKey === `a${alloc.id}`;
            const pending = alloc.decision === 'pending';
            return (
              <div key={alloc.id} style={{
                border: pending ? '2px solid #ed8936' : '1px solid #cbd5e0',
                padding: '15px', borderRadius: '8px'
              }}>
                <h3 style={{ marginTop: 0 }}>
                  {alloc.room?.name} <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#718096' }}>({alloc.room?.room_type})</span>
                </h3>

                <div style={{ marginBottom: '15px', fontSize: '0.95rem' }}>
                  <strong>Patient:</strong> {alloc.triage_record?.patient?.patient_code} <br />
                  <strong>Severity:</strong> <span style={{ textTransform: 'uppercase' }}>{alloc.triage_record?.final_severity}</span><br />
                  <strong>Status:</strong> {alloc.decision.toUpperCase()}
                  {alloc.auto_assigned && (
                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', backgroundColor: '#fed7d7', padding: '2px 6px', borderRadius: '4px' }}>
                      Assigned automatically (Critical)
                    </span>
                  )}
                </div>

                {pending ? (
                  <div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button disabled={busy} onClick={() => decide(alloc, 'confirmed')} style={btn('#38a169')}>Confirm Room</button>
                      <button disabled={busy} onClick={() => decide(alloc, 'rejected')} style={btn('#e53e3e')}>Reject</button>
                    </div>
                    {roomPicker(alloc, '-- Choose a different room --')}
                  </div>
                ) : (
                  <div style={{ padding: '10px', backgroundColor: '#f7fafc', borderRadius: '4px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold' }}>Record Patient Outcome to Free Room:</label>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button disabled={busy} onClick={() => outcome(alloc, 'admitted')} style={btn('#2b6cb0')}>Admit</button>
                      <button disabled={busy} onClick={() => outcome(alloc, 'discharged')} style={btn('#718096')}>Discharge</button>
                      <button disabled={busy} onClick={() => outcome(alloc, 'transferred')} style={btn('#d69e2e')}>Transfer</button>
                    </div>
                    {roomPicker(alloc, '-- Move to another room --')}
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
