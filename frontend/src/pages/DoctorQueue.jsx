import { useState, useEffect } from 'react';
import axios from 'axios';

export default function DoctorQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewData, setReviewData] = useState({ final_severity: '', override_reason: '' });
  
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchQueue = async () => {
      setLoading(true);
      try {
        const response = await axios.get('http://127.0.0.1:5000/queue');
        
        // Ensure we always have an array, even if the database returns null
        if (Array.isArray(response.data)) {
          setQueue(response.data);
        } else {
          setQueue([]);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch the queue.');
      } finally {
        setLoading(false);
      }
    };

    fetchQueue();
  }, [refreshKey]);

  const handleReviewSubmit = async (e, recordId) => {
    e.preventDefault();
    try {
      const payload = {
        ...reviewData,
        doctor_id: "9d898aa0-e87e-4f4d-8d0c-558c4895a506" // Dummy ID
      };
      await axios.patch(`http://127.0.0.1:5000/triage/${recordId}/review`, payload);
      setReviewingId(null);
      setReviewData({ final_severity: '', override_reason: '' });
      setRefreshKey((oldKey) => oldKey + 1); 
      alert('Severity confirmed and room recommended!');
    } catch (err) {
      console.error(err);
      alert('Failed to submit review.');
    }
  };

  if (loading) return <div>Loading patient queue...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Doctor Review Queue</h2>
      {!queue || queue.length === 0 ? (
        <p>No patients currently waiting.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {queue.map((record) => (
            <div key={record.id} style={{ border: '1px solid #cbd5e0', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>Token: {record.token_number} | Patient: {record.patient?.patient_code}</strong>
                <span style={{ 
                  backgroundColor: record.predicted_severity === 'critical' ? '#fed7d7' : record.predicted_severity === 'urgent' ? '#feebc8' : '#c6f6d5', 
                  padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.85rem'
                }}>
                  Predicted: {record.predicted_severity}
                </span>
              </div>
              
              <div style={{ fontSize: '0.9rem', color: '#4a5568', marginBottom: '15px' }}>
                Vitals: HR {record.heart_rate}, BP {record.systolic_bp}/{record.diastolic_bp}, SpO2 {record.spo2}%
                <br />
                Wait Time: {Math.round((new Date() - new Date(record.created_at)) / 60000)} mins
                <br />
                Complaint: {record.chief_complaint}
              </div>

              {record.top_features?.reasons && (
                <div style={{ fontSize: '0.85rem', backgroundColor: '#f7fafc', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
                  <strong>Why the model said {record.predicted_severity}</strong>
                  {record.top_features.confidence != null && (
                    <span> ({Math.round(record.top_features.confidence * 100)}% confident)</span>
                  )}
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {record.top_features.reasons.map((r, i) => (
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

              {reviewingId === record.id ? (
                <form onSubmit={(e) => handleReviewSubmit(e, record.id)} style={{ backgroundColor: '#f7fafc', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Confirm or Override Severity:</label>
                    <select 
                      value={reviewData.final_severity} 
                      onChange={(e) => setReviewData({ ...reviewData, final_severity: e.target.value })} 
                      required 
                      style={{ width: '100%', padding: '8px' }}
                    >
                      <option value="">-- Select Severity --</option>
                      <option value="critical">Critical</option>
                      <option value="urgent">Urgent</option>
                      <option value="stable">Stable</option>
                    </select>
                  </div>
                  {reviewData.final_severity && reviewData.final_severity !== record.predicted_severity && (
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px' }}>Override Reason:</label>
                      <input 
                        type="text" 
                        value={reviewData.override_reason} 
                        onChange={(e) => setReviewData({ ...reviewData, override_reason: e.target.value })} 
                        required 
                        style={{ width: '100%', padding: '8px' }} 
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#38a169', color: 'white', border: 'none', cursor: 'pointer' }}>Submit Decision</button>
                    <button type="button" onClick={() => setReviewingId(null)} style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => {
                  setReviewingId(record.id);
                  setReviewData({ final_severity: record.predicted_severity, override_reason: '' });
                }} style={{ padding: '8px 16px', backgroundColor: '#2b6cb0', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>
                  Review Patient
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}