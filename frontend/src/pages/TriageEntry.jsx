import { useState } from 'react';
import axios from 'axios';

const NUMERIC = ['token_number', 'sex', 'age', 'arrival_mode', 'injury', 'mental',
  'nrs_pain', 'sbp', 'dbp', 'hr', 'rr', 'bt', 'saturation'];

const empty = {
  patient_code: '', token_number: '', sex: 1, age: '', arrival_mode: 1,
  injury: 1, mental: 1, nrs_pain: '', sbp: '', dbp: '', hr: '', rr: '',
  bt: '', saturation: '', chief_complaint: '',
};

export default function TriageEntry() {
  const [formData, setFormData] = useState(empty);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Only numeric fields become numbers; text (patient code, complaint) stays text
    setFormData({ ...formData, [name]: NUMERIC.includes(name) && value !== '' ? Number(value) : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Empty optional vitals are sent as null so the model treats them as "not recorded"
      const payload = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v === '' ? null : v])
      );
      payload.pain = formData.nrs_pain !== '' && formData.nrs_pain > 0 ? 1 : 0; // derived from the pain score
      if (payload.nrs_pain === null) payload.nrs_pain = 0;
      payload.recorded_by = '9d898aa0-e87e-4f4d-8d0c-558c4895a506'; // dummy until Auth is wired

      const response = await axios.post('http://127.0.0.1:5000/triage', payload);
      setResult(response.data);
      setFormData(empty);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  const num = (label, name, extra = {}, required = false) => (
    <div>
      <label>{label}</label><br />
      <input type="number" name={name} value={formData[name]} onChange={handleChange}
        required={required} style={{ width: '100%' }} {...extra} />
    </div>
  );

  const select = (label, name, options) => (
    <div>
      <label>{label}</label><br />
      <select name={name} value={formData[name]} onChange={handleChange} style={{ width: '100%' }}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Triage Data Entry</h2>

      {result && (
        <div style={{ padding: '15px', backgroundColor: '#e6fffa', border: '1px solid #319795', marginBottom: '20px' }}>
          <strong>Patient triaged and sent to the Doctor queue.</strong>
          <br />
          Predicted severity: <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{result.record.predicted_severity}</span>
          {' '}({Math.round(result.prediction.confidence * 100)}% confidence)
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
        {num('Token Number', 'token_number', {}, true)}
        {num('Age', 'age', { min: 0, max: 120 }, true)}
        {select('Sex', 'sex', [[1, 'Female'], [2, 'Male']])}
        {select('Arrival Mode', 'arrival_mode', [[1, 'Walking'], [2, 'Public ambulance'], [3, 'Private vehicle'], [4, 'Private ambulance'], [5, 'Other']])}
        {select('Injury', 'injury', [[1, 'No'], [2, 'Yes']])}
        {select('Mental Status', 'mental', [[1, 'Alert'], [2, 'Responds to voice'], [3, 'Responds to pain'], [4, 'Unresponsive']])}
        {num('Pain Scale (0-10)', 'nrs_pain', { min: 0, max: 10 })}
        {num('Systolic BP', 'sbp')}
        {num('Diastolic BP', 'dbp')}
        {num('Heart Rate', 'hr')}
        {num('Respiratory Rate', 'rr')}
        {num('Body Temp (°C)', 'bt', { step: 0.1 })}
        {num('O2 Saturation (%)', 'saturation', { min: 0, max: 100 })}

        <div style={{ gridColumn: 'span 2' }}>
          <label>Chief Complaint (type it in words, e.g. "chest pain and shortness of breath")</label><br />
          <input type="text" name="chief_complaint" value={formData.chief_complaint} onChange={handleChange} required style={{ width: '100%' }} />
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