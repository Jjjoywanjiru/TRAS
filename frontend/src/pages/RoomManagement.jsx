import { useState, useEffect } from 'react';
import axios from 'axios';

export default function RoomManagement() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchAllocations = async () => {
      setLoading(true);
      try {
        const response = await axios.get('http://127.0.0.1:5000/allocations');
        setAllocations(response.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllocations();
  }, [refreshKey]);

  const handleDecision = async (allocId, decision) => {
    try {
      await axios.patch(`http://127.0.0.1:5000/allocation/${allocId}/decide`, {
        decision: decision,
        nurse_id: "9d898aa0-e87e-4f4d-8d0c-558c4895a506" // Dummy ID
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      alert("Failed to update room allocation.");
    }
  };

  const handleOutcome = async (triageId, outcome) => {
    try {
      await axios.patch(`http://127.0.0.1:5000/triage/${triageId}/outcome`, {
        outcome: outcome
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      alert("Failed to log patient outcome.");
    }
  };

  if (loading) return <div>Loading allocations...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Room Management (Nurse in Charge)</h2>
      
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
                <strong>Patient:</strong> {alloc.triage_record?.patient?.patient_code} <br/>
                <strong>Severity:</strong> <span style={{ textTransform: 'uppercase' }}>{alloc.triage_record?.final_severity}</span><br/>
                <strong>Status:</strong> {alloc.decision.toUpperCase()}
              </div>

              {alloc.decision === 'pending' ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleDecision(alloc.id, 'confirmed')} style={{ padding: '8px 12px', backgroundColor: '#38a169', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>
                    Confirm Room
                  </button>
                  <button onClick={() => handleDecision(alloc.id, 'rejected')} style={{ padding: '8px 12px', backgroundColor: '#e53e3e', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>
                    Reject
                  </button>
                </div>
              ) : (
                <div style={{ padding: '10px', backgroundColor: '#f7fafc', borderRadius: '4px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold' }}>Record Patient Outcome to Free Room:</label>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'admitted')} style={{ padding: '6px 10px', backgroundColor: '#2b6cb0', color: 'white', border: 'none', cursor: 'pointer' }}>Admit</button>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'discharged')} style={{ padding: '6px 10px', backgroundColor: '#718096', color: 'white', border: 'none', cursor: 'pointer' }}>Discharge</button>
                    <button onClick={() => handleOutcome(alloc.triage_record_id, 'transferred')} style={{ padding: '6px 10px', backgroundColor: '#d69e2e', color: 'white', border: 'none', cursor: 'pointer' }}>Transfer</button>
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