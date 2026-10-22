import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Where each role lands after signing in
export const HOME_FOR_ROLE = {
  triage_nurse: '/triage',
  doctor: '/doctor',
  nurse_in_charge: '/rooms',
};