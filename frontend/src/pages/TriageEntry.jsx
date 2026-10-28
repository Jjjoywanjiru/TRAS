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

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export default function TriageEntry() {
  const [formData, setFormData] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [noOxygen, setNoOxygen] = useState(false); // the nurse says oxygen could not be measured
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
    // Oxygen is the most important vital for spotting critical patients, so it can only
    // be left empty on purpose.
    if (formData.saturation === '' && !noOxygen) {
      setError('Enter the oxygen saturation, or tick "Oxygen could not be measured". The prediction is less reliable without it.');
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
      setNoOxygen(false);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setError(err.response?.data?.error || 'Cannot reach the server. Nothing was saved; please try again.');
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setLoading(false);
    }
  };

  const num = (label, name, extra = {}, required = false, hint = '') => (
    <div className="field">
      <label htmlFor={name}>{label} {hint && <span className="hint">{hint}</span>}</label>
      <input
        id={name}
        type="number"
        step="any"
        name={name}
        value={formData[name]}
        onChange={handleChange}
        onWheel={(e) => e.currentTarget.blur()} // scrolling the page must never change a number
        required={required}
        autoComplete="off"
        {...extra}
      />
    </div>
  );

  const select = (label, name, options) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} value={formData[name]} onChange={handleChange}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );

  const tier = result?.record?.predicted_severity;

  return (
    <div className="page">
      <div ref={topRef} />
      <div className="page-head">
        <h1>Triage entry</h1>
        <p>Record the patient's details and vitals. The system predicts a severity for the doctor to confirm.</p>
      </div>

      {result && (
        <div className="notice ok">
          <strong>{result.patient_code} saved and sent to the doctor.</strong>{' '}
          Predicted severity: <span className={`tier tier-${tier}`}>{cap(tier)}</span>{' '}
          ({Math.round(result.prediction.confidence * 100)}% confidence)
        </div>
      )}
      {error && <div className="notice err">{error}</div>}

      <form className="panel" onSubmit={handleSubmit}>
        <section className="form-section">
          <h2>Patient</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="patient_code">Patient code</label>
              <input id="patient_code" type="text" name="patient_code" value={formData.patient_code} onChange={handleChange} required autoComplete="off" />
            </div>
            {num('Token number', 'token_number', { min: 1 }, true)}
            {num('Age', 'age', { min: 0, max: 120 }, true, '(years)')}
            {select('Sex', 'sex', [['1', 'Female'], ['2', 'Male']])}
          </div>
        </section>

        <section className="form-section">
          <h2>Presentation</h2>
          <div className="form-grid">
            {select('Arrival mode', 'arrival_mode', [['1', 'Walking'], ['2', 'Public ambulance'], ['3', 'Private vehicle'], ['4', 'Private ambulance'], ['5', 'Other']])}
            {select('Injury', 'injury', [['1', 'No'], ['2', 'Yes']])}
            {select('Mental status', 'mental', [['1', 'Alert'], ['2', 'Responds to voice'], ['3', 'Responds to pain'], ['4', 'Unresponsive']])}
            {num('Pain score', 'nrs_pain', { min: 0, max: 10 }, false, '(0 to 10)')}
            <div className="field wide">
              <label htmlFor="chief_complaint">Chief complaint <span className="hint">(in words, for example "chest pain and shortness of breath")</span></label>
              <input id="chief_complaint" type="text" name="chief_complaint" value={formData.chief_complaint} onChange={handleChange} required autoComplete="off" />
            </div>
          </div>
        </section>

        <section className="form-section">
          <h2>Vitals</h2>
          <div className="form-grid">
            {num('Systolic blood pressure', 'sbp', { min: 40, max: 300 }, false, '(mmHg)')}
            {num('Diastolic blood pressure', 'dbp', { min: 20, max: 200 }, false, '(mmHg)')}
            {num('Heart rate', 'hr', { min: 20, max: 250 }, false, '(per minute)')}
            {num('Respiratory rate', 'rr', { min: 4, max: 70 }, false, '(per minute)')}
            {num('Body temperature', 'bt', { min: 30, max: 45 }, false, '(°C)')}
            {num('Oxygen saturation', 'saturation', { min: 50, max: 100, disabled: noOxygen }, false, '(%)')}
            <div className="field check-field">
              <label className="check">
                <input
                  type="checkbox"
                  checked={noOxygen}
                  onChange={(e) => {
                    setNoOxygen(e.target.checked);
                    if (e.target.checked) setFormData((prev) => ({ ...prev, saturation: '' }));
                    if (error) setError(null);
                  }}
                />
                Oxygen could not be measured
              </label>
            </div>
          </div>
        </section>

        <div style={{ marginTop: '24px' }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', minHeight: '52px', fontSize: '1.05rem' }}>
            {loading ? 'Saving...' : 'Save and send to doctor'}
          </button>
        </div>
      </form>
    </div>
  );
}
