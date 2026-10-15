import { useState } from 'react';
import axios from 'axios';

export default function TriageEntry() {
  const [formData, setFormData] = useState({
    patient_code: '',
    token_number: '',
    sex: 1,
    age: '',
    arrival_mode: 1,
    injury: 0,
    mental: 1,
    pain: 1,
    nrs_pain: '',
    sbp: '',
    dbp: '',
    hr: '',
    rr: '',
    bt: '',
    saturation: '',
    chief_complaint: 1,
  });

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value === '' ? '' : Number(value) || value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Adding a dummy UUID for recorded_by until Auth is fully wired
      const payload = {
        ...formData,
        recorded_by: "9d898aa0-e87e-4f4d-8d0c-558c4895a506", 
      };

      const response = await axios.post('http://127.0.0.1:5000/triage', payload);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Triage Data Entry</h2>
      
      {result && (
        <div style={{ padding: '15px', backgroundColor: '#e6fffa', border: '1px solid #319795', marginBottom: '20px' }}>
          <strong>Success!</strong> Patient triaged. 
          <br />
          Predicted Severity: <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{result.record.predicted_severity}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '15px', backgroundColor: '#fff5f5', border: '1px solid #e53e3e', color: '#e53e3e', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div>
          <label>Patient Code</label><br />
          <input type="text" name="patient_code" value={formData.patient_code} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Token Number</label><br />
          <input type="number" name="token_number" value={formData.token_number} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Age</label><br />
          <input type="number" name="age" value={formData.age} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Sex (1=Male, 2=Female)</label><br />
          <input type="number" name="sex" value={formData.sex} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Systolic BP</label><br />
          <input type="number" name="sbp" value={formData.sbp} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Diastolic BP</label><br />
          <input type="number" name="dbp" value={formData.dbp} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Heart Rate</label><br />
          <input type="number" name="hr" value={formData.hr} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Respiratory Rate</label><br />
          <input type="number" name="rr" value={formData.rr} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Body Temp (°C)</label><br />
          <input type="number" step="0.1" name="bt" value={formData.bt} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>O2 Saturation (%)</label><br />
          <input type="number" name="saturation" value={formData.saturation} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Pain Scale (0-10)</label><br />
          <input type="number" name="nrs_pain" value={formData.nrs_pain} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div>
          <label>Mental Status (1=Alert, etc.)</label><br />
          <input type="number" name="mental" value={formData.mental} onChange={handleChange} required style={{ width: '100%' }} />
        </div>

        <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
          <button type="submit" disabled={loading} style={{ padding: '10px 20px', backgroundColor: '#2b6cb0', color: 'white', border: 'none', cursor: 'pointer', width: '100%' }}>
            {loading ? 'Processing...' : 'Submit Triage Vitals'}
          </button>
        </div>
      </form>
    </div>
  );
}