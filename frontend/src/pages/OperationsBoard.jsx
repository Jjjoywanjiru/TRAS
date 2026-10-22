import { useState, useEffect } from 'react';
import axios from '../api';

const API = 'http://127.0.0.1:5000';
const REFRESH_MS = 5000;

const SEVERITY_COLOURS = { critical: '#fed7d7', urgent: '#feebc8', stable: '#c6f6d5' };
const ROOM_COLOURS = {
  free: { bg: '#f0fff4', border: '#38a169', label: 'Free' },
  reserved: { bg: '#fffaf0', border: '#ed8936', label: 'Reserved (awaiting confirmation)' },
  occupied: { bg: '#fff5f5', border: '#e53e3e', label: 'Occupied' },
};

const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export default function OperationsBoard() {
  const [rooms, setRooms] = useState([]);
  const [queue, setQueue] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [r, q, w, a] = await Promise.all([
          axios.get(`${API}/rooms`),
          axios.get(`${API}/queue`),
          axios.get(`${API}/awaiting-room`),
          axios.get(`${API}/allocations`),
        ]);
        if (!active) return;
        setRooms(r.data || []);
        setQueue(q.data || []);
        setWaiting(w.data || []);
        setAllocations(a.data || []);
        setUpdatedAt(new Date());
        setError(null);
      } catch (err) {
        console.error(err);
        if (active) setError('Cannot reach the server. Showing the last data received.');
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS); // refresh automatically
    return () => { active = false; clearInterval(timer); };
  }, []);

  const patientInRoom = {};
  allocations.forEach((a) => { patientInRoom[a.room_id] = a; });

  const count = (status) => rooms.filter((r) => r.status === status).length;
  const criticalWaiting = queue.filter((q) => q.predicted_severity === 'critical').length;
  const longestWait = queue.length ? Math.max(...queue.map((q) => minutesSince(q.created_at))) : 0;

  const tile = (label, value, colour) => (
    <div style={{ flex: 1, minWidth: '140px', padding: '12px', borderRadius: '8px', backgroundColor: colour || '#edf2f7', textAlign: 'center' }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#4a5568' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ marginBottom: 0 }}>Operations Board</h2>
        <span style={{ fontSize: '0.8rem', color: '#718096' }}>
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} (refreshes every ${REFRESH_MS / 1000}s)` : 'Loading...'}
        </span>
      </div>

      {error && (
        <div style={{ padding: '10px', backgroundColor: '#fff5f5', border: '1px solid #e53e3e', color: '#c53030', margin: '10px 0' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '15px 0' }}>
        {tile('Awaiting doctor review', queue.length)}
        {tile('Critical waiting', criticalWaiting, criticalWaiting ? SEVERITY_COLOURS.critical : undefined)}
        {tile('Longest wait (min)', longestWait)}
        {tile('Waiting for a room', waiting.length, waiting.length ? '#fed7d7' : undefined)}
        {tile('Rooms free', `${count('free')} / ${rooms.length}`, '#f0fff4')}
      </div>

      <h3>Rooms</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
        {rooms.map((room) => {
          const c = ROOM_COLOURS[room.status] || ROOM_COLOURS.free;
          const alloc = patientInRoom[room.id];
          return (
            <div key={room.id} style={{ backgroundColor: c.bg, border: `2px solid ${c.border}`, borderRadius: '8px', padding: '12px' }}>
              <strong>{room.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#718096' }}>{room.room_type}</div>
              <div style={{ marginTop: '6px', fontSize: '0.9rem' }}>{c.label}</div>
              {alloc && room.status !== 'free' && (
                <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                  {alloc.triage_record?.patient?.patient_code} &middot;{' '}
                  <span style={{ textTransform: 'uppercase' }}>{alloc.triage_record?.final_severity}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: '25px' }}>Doctor queue (most urgent first)</h3>
      {queue.length === 0 ? (
        <p>No patients waiting for review.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e0' }}>
              <th style={{ padding: '6px' }}>Token</th>
              <th>Patient</th>
              <th>Predicted</th>
              <th>Complaint</th>
              <th>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((rec) => (
              <tr key={rec.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px' }}>{rec.token_number}</td>
                <td>{rec.patient?.patient_code}</td>
                <td>
                  <span style={{ backgroundColor: SEVERITY_COLOURS[rec.predicted_severity], padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {rec.predicted_severity}
                  </span>
                </td>
                <td>{rec.chief_complaint}</td>
                <td>{minutesSince(rec.created_at)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {waiting.length > 0 && (
        <>
          <h3 style={{ marginTop: '25px' }}>Reviewed, waiting for a room</h3>
          <ul>
            {waiting.map((rec) => (
              <li key={rec.id}>
                {rec.patient?.patient_code} (token {rec.token_number}) &mdash;{' '}
                <span style={{ textTransform: 'uppercase' }}>{rec.final_severity}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}