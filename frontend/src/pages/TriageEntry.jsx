import { useRef, useState } from 'react';
import api from '../api';

// Every field is kept as TEXT while the nurse types, and turned into numbers only
// when the form is sent. (Converting on every keystroke is what made values jump.)
const EMPTY = {
  patient_code: '', token_number: '', sex: '1', age: '', arrival_mode: '1',
  injury: '1', mental: '1', nrs_pain: '', sbp: '', dbp: '', hr: '', rr: '',
  bt: '', saturation: '', chief_complaint: '',
};

const NUMERIC_FIELDS = ['token_number', 'sex', 'age', 'arrival_mode', 'injury', 'mental',
  'nrs_pain', 'sbp', 'dbp', 'hr', 'rr', 'bt', 'saturation'];

const TIER_COLOURS = { critical: '#fed7d7', urgent: '#feebc8', stable: '#c6f6d5' };

export default function TriageEntry() {
  const [formData, setFormData] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const topRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Starting the next patient clears the previous message
    if (result) setResult(null);
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = { ...formData };
      NUMERIC_FIELDS.forEach((f) => {
        payload[f] = formData[f] === '' ? null : Number(formData[f]);
      });
      payload.pain = payload.nrs_pain !== null && payload.nrs_pain > 0 ? 1 : 0; // derived from the pain score
      if (payload.nrs_pain === null) payload.nrs_pain = 0;

      const response = await api.post('/triage', payload);
      setResult({ ...response.data, patient_code: formData.patient_code });
      // Ready for the next patient: empty form, token number one higher
      setFormData({ ...EMPTY, token_number: String(Number(formData.token_number) + 1) });
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setError(err.response?.data?.error || 'Cannot reach the server. Nothing was saved; please try again.');
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setLoading(false);
    }
  };

  const num = (label, name, extra = {}, required = false) => (
    <div>
      <label>{label}</label><br />
      <input
        type="number"
        step="any"
        name={name}
        value={formData[name]}
        onChange={handleChange}
        onWheel={(e) => e.currentTarget.blur()} // scrolling the page must never change a number
        required={required}
        autoComplete="off"
        style={{ width: '100%' }}
        {...extra}
      />
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

  const tier = result?.record?.predicted_severity;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div ref={topRef} />
      <h2>Triage Data Entry</h2>

      {result && (
        <div style={{ padding: '15px', backgroundColor: '#e6fffa', border: '1px solid #319795', marginBottom: '20px' }}>
          <strong>{result.patient_code} saved and sent to the doctor.</strong>
          <br />
          Predicted severity:{' '}
          <span style={{ backgroundColor: TIER_COLOURS[tier], padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
            {tier}
          </span>{' '}
          ({Math.round(result.prediction.confidence * 100)}% confidence)
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
          <input type="text" name="patient_code" value={formData.patient_code} onChange={handleChange} required autoComplete="off" style={{ width: '100%' }} />
        </div>
        {num('Token Number', 'token_number', { min: 1 }, true)}
        {num('Age', 'age', { min: 0, max: 120 }, true)}
        {select('Sex', 'sex', [['1', 'Female'], ['2', 'Male']])}
        {select('Arrival Mode', 'arrival_mode', [['1', 'Walking'], ['2', 'Public ambulance'], ['3', 'Private vehicle'], ['4', 'Private ambulance'], ['5', 'Other']])}
        {select('Injury', 'injury', [['1', 'No'], ['2', 'Yes']])}
        {select('Mental Status', 'mental', [['1', 'Alert'], ['2', 'Responds to voice'], ['3', 'Responds to pain'], ['4', 'Unresponsive']])}
        {num('Pain Scale (0-10)', 'nrs_pain', { min: 0, max: 10 })}
        {num('Systolic BP (mmHg)', 'sbp', { min: 40, max: 300 })}
        {num('Diastolic BP (mmHg)', 'dbp', { min: 20, max: 200 })}
        {num('Heart Rate (per min)', 'hr', { min: 20, max: 250 })}
        {num('Respiratory Rate (per min)', 'rr', { min: 4, max: 70 })}
        {num('Body Temp (°C)', 'bt', { min: 30, max: 45 })}
        {num('O2 Saturation (%)', 'saturation', { min: 50, max: 100 })}

        <div style={{ gridColumn: 'span 2' }}>
          <label>Chief Complaint (type it in words, e.g. "chest pain and shortness of breath")</label><br />
          <input type="text" name="chief_complaint" value={formData.chief_complaint} onChange={handleChange} required autoComplete="off" style={{ width: '100%' }} />
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
