// Demo accounts shown on the sign-in page so visitors can try the system.
// Use NEW accounts made only for this: never your own email or a password you use anywhere else.
// They only ever see made-up patients.
export const DEMO_ACCOUNTS = [
  { role: 'Triage nurse', email: 'testnurse@tras.test', password: '54995499', note: 'Enter a patient and send them to the doctor' },
  { role: 'Doctor', email: 'testdoctor@tras.test', password: '54995499', note: 'Confirm or override the predicted severity' },
  { role: 'Nurse in charge', email: 'testincharge@tras.test', password: '54995499', note: 'Confirm the room and record the outcome' },
];