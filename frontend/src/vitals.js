// Usual adult ranges, used only to FLAG a reading on screen (a visual cue for the
// doctor). Standard textbook values: confirm them with a clinical reference or your
// supervisor before relying on them. The model's prediction does not use these.
export const RANGES = {
  hr: { low: 60, high: 100, text: '60-100 per minute' },
  resp_rate: { low: 12, high: 20, text: '12-20 per minute' },
  spo2: { low: 95, high: 100, text: '95-100%' },
  temperature: { low: 36.1, high: 37.8, text: '36.1-37.8 °C' },
  systolic_bp: { low: 90, high: 139, text: '90-139 mmHg' },
  diastolic_bp: { low: 60, high: 89, text: '60-89 mmHg' },
};

// Returns 'low', 'high' or null (normal or missing)
export function flagFor(key, value) {
  const range = RANGES[key];
  if (!range || value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (n < range.low) return 'low';
  if (n > range.high) return 'high';
  return null;
}
