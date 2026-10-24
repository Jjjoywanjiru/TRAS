import { BrowserRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { useAuth, HOME_FOR_ROLE } from './authState';
import Login from './pages/Login';
import TriageEntry from './pages/TriageEntry';
import DoctorQueue from './pages/DoctorQueue';
import RoomManagement from './pages/RoomManagement';
import OperationsBoard from './pages/OperationsBoard';

const tabClass = ({ isActive }) => (isActive ? 'tab active' : 'tab');

// Only lets the listed roles in; everyone else is sent to their own home screen
function Protected({ roles, children }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="page">Loading...</div>;
  if (!profile) return <Navigate to="/" replace />;
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={HOME_FOR_ROLE[profile.role] || '/dashboard'} replace />;
  }
  return children;
}

function NavBar() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const role = profile.role;
  return (
    <header className="topbar">
      <div className="brand">
        <strong>TRAS</strong>
        <span>Emergency triage</span>
      </div>
      {role === 'triage_nurse' && <NavLink to="/triage" className={tabClass}>Triage</NavLink>}
      {role === 'doctor' && <NavLink to="/doctor" className={tabClass}>Doctor</NavLink>}
      {role === 'nurse_in_charge' && <NavLink to="/rooms" className={tabClass}>Rooms</NavLink>}
      <NavLink to="/dashboard" className={tabClass}>Board</NavLink>
      <div className="who">
        <span>{profile.full_name}</span>
        <span className="role">{role.replace(/_/g, ' ')}</span>
        <button className="btn btn-onchrome" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <NavBar />
        <main>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/triage" element={<Protected roles={['triage_nurse']}><TriageEntry /></Protected>} />
            <Route path="/doctor" element={<Protected roles={['doctor']}><DoctorQueue /></Protected>} />
            <Route path="/rooms" element={<Protected roles={['nurse_in_charge']}><RoomManagement /></Protected>} />
            <Route path="/dashboard" element={<Protected><OperationsBoard /></Protected>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </AuthProvider>
    </Router>
  );
}

export default App;
