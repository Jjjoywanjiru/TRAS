import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:5000';
const NURSE_ID = '9d898aa0-e87e-4f4d-8d0c-558c4895a506'; // dummy until login is built

const btn = (bg) => ({ padding: '8px 12px', backgroundColor: bg, color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' });

export default function RoomManagement() {
  const [allocations, setAllocations] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [freeRooms, setFreeRooms] = useState([]);
  const [chosenRoom, setChosenRoom] = useState({}); // allocation id -> room id picked in the dropdown
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [a, w, r] = await Promise.all([
          axios.get(`${API}/allocations`),
          axios.get(`${API}/awaiting-room`),
          axios.get(`${API}/rooms`),
        ]);
        setAllocations(a.data || []);
        setWaiting(w.data || []);
        setFreeRooms((r.data || []).filter((room) => room.status === 'free'));
      } catch (err) {
        console.error(err);
        setNotice('Could not load room data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const handleDecision = async (allocId, decision, newRoomId) => {
    try {
      const body = { decision, nurse_id: NURSE_ID };
      if (decision === 'modified') body.new_room_id = Number(newRoomId);
      const res = await axios.patch(`${API}/allocation/${allocId}/decide`, body);
      setNotice(res.data.message || null);
      refresh();
    } catch (err) {
      console.error(err);
      setNotice(err.response?.data?.error || 'Failed to update room allocation.');
      refresh();
    }
  };

  const handleOutcome = async (triageId, outcome) => {
    try {
      await axios.patch(`${API}/triage/${triageId}/outcome`, { outcome });
      setNotice(null);
      refresh();
    } catch (err) {
      console.error(err);
      setNotice(err.response?.data?.error || 'Failed to log patient outcome.');
    }
  };

  const findRoom = async (triageId) => {
    try {
      const res = await axios.post(`${API}/triage/${triageId}/recommend-room`);
      setNotice(res.data.message);
      refresh();
    } catch (err) {
      console.error(err);
      setNotice(err.response?.data?.error || 'Failed to look for a room.');
    }
  };

  if (loading) return <div>Loading allocations...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Room Management (Nurse in Charge)</h2>

      {notice && (
        <div style={{ padding: '10px', backgroundColor: '#fffaf0', border: '1px solid #ed8936', marginBottom: '15px' }}>
          {notice}
        </div>
      )}

      <p style={{ color: '#4a5568' }}>
        Free rooms right now: <strong>{freeRooms.length}</strong>
        {freeRooms.length > 0 && <> ({freeRooms.map((r) => r.name).join(', ')})</>}
      </p>

      {waiting.length > 0 && (
        <div style={{ marginBottom: '25px' }}>
          <h3>Waiting for a room ({waiting.length})</h3>
          {waiting.map((rec) => (
            <div key={rec.id} style={{ border: '2px solid #e53e3e', borderRadius: '8px', padding: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{rec.patient?.patient_code}</strong> (token {rec.token_number}) &mdash;{' '}
                <span style={{ textTransform: 'uppercase' }}>{rec.final_severity}</span>
              </span>
              <button onClick={() => findRoom(rec.id)} style={btn('#2b6cb0')}>Find a room</button>
            </div>
          ))}
        </div>
      )}

      <h3>Room allocations</h3>
      {allocations.length === 0 ? (
        <p>No active room allocations.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {allocations.map((alloc) => (
            <div key={alloc.id} style={{
              border: alloc.decision === 'pending' ? '2px solid #ed8936' : '1px solid #cbd5e0',
              padding: '15px', borderRadius: '8px'
            }}>
              <h3 style={{ marginTop: 0 }}>
                {alloc.room?.name} <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#718096' }}>({alloc.room?.room_type})</span>
              </h3>

              <div style={{ marginBottom: '15px', fontSize: '0.95rem' }}>
                <strong>Patient:</strong> {alloc.triage_record?.patient?.patient_code} <br />
                <strong>Severity:</strong> <span style={{ textTransform: 'uppercase' }}>{alloc.triage_record?.final_severity}</span><br />
                <strong>Status:</strong> {alloc.decision.toUpperCase()}
              </div>

              {alloc.decision === 'pending' ? (
                <div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button onClick={() => handleDecision(alloc.id, 'confirmed')} style={btn('#38a169')}>Confirm Room</button>
                    <button onClick={() => handleDecision(alloc.id, 'rejected')} style={btn('#e53e3e')}>Reject</button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      value={chosenRoom[alloc.id] || ''}
                      onChange={(e) => setChosenRoom({ ...chosenRoom, [alloc.id]: e.target.value })}
                      style={{ flex: 1, padding: '6px' }}
                    >
                      <option value="">-- Choose a different room --</option>
                      {freeRooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.room_type})</option>
                      ))}
                    </select>
                    <button
                      disabled={!chosenRoom[alloc.id]}
                      onClick={() => handleDecision(alloc.id, 'modified', chosenRoom[alloc.id])}
                      style={{ ...btn('#805ad5'), opacity: chosenRoom[alloc.id] ? 1 : 0.5 }}
                    >
                      Use this room
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '10px', backgroundColor: '#f7fafc', borderRadius: '4px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold' }}>Record Patient Outcome to Free Room:</label>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'admitted')} style={btn('#2b6cb0')}>Admit</button>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'discharged')} style={btn('#718096')}>Discharge</button>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'transferred')} style={btn('#d69e2e')}>Transfer</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}