import { BrowserRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { useAuth, HOME_FOR_ROLE } from './authState';
import Login from './pages/Login';
import TriageEntry from './pages/TriageEntry';
import DoctorQueue from './pages/DoctorQueue';
import RoomManagement from './pages/RoomManagement';
import OperationsBoard from './pages/OperationsBoard';

// The link for the page you are on is highlighted
const linkStyle = ({ isActive }) => ({
  color: 'white',
  textDecoration: 'none',
  padding: '6px 14px',
  borderRadius: '6px',
  fontWeight: isActive ? 'bold' : 'normal',
  backgroundColor: isActive ? 'rgba(255,255,255,0.28)' : 'transparent',
  borderBottom: isActive ? '3px solid #90cdf4' : '3px solid transparent',
});

// Only lets the listed roles in; everyone else is sent to their own home screen
function Protected({ roles, children }) {
  const { profile, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
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
    <nav style={{ backgroundColor: '#2a4365', padding: '10px 15px', color: 'white', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
      {role === 'triage_nurse' && <NavLink to="/triage" style={linkStyle}>Triage</NavLink>}
      {role === 'doctor' && <NavLink to="/doctor" style={linkStyle}>Doctor</NavLink>}
      {role === 'nurse_in_charge' && <NavLink to="/rooms" style={linkStyle}>Rooms</NavLink>}
      <NavLink to="/dashboard" style={linkStyle}>Board</NavLink>
      <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
        {profile.full_name} ({role.replace(/_/g, ' ')})
      </span>
      <button onClick={signOut} style={{ padding: '4px 10px', cursor: 'pointer' }}>Sign out</button>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <div style={{ minHeight: '100vh', backgroundColor: '#f7fafc', padding: '20px' }}>
          <NavBar />
          <main style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/triage" element={<Protected roles={['triage_nurse']}><TriageEntry /></Protected>} />
              <Route path="/doctor" element={<Protected roles={['doctor']}><DoctorQueue /></Protected>} />
              <Route path="/rooms" element={<Protected roles={['nurse_in_charge']}><RoomManagement /></Protected>} />
              <Route path="/dashboard" element={<Protected><OperationsBoard /></Protected>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
