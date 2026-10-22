import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { useAuth, HOME_FOR_ROLE } from './authState';
import Login from './pages/Login';
import TriageEntry from './pages/TriageEntry';
import DoctorQueue from './pages/DoctorQueue';
import RoomManagement from './pages/RoomManagement';
import OperationsBoard from './pages/OperationsBoard';

const linkStyle = { color: 'white', textDecoration: 'none' };

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
    <nav style={{ backgroundColor: '#2a4365', padding: '15px', color: 'white', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
      {role === 'triage_nurse' && <Link to="/triage" style={linkStyle}>Triage</Link>}
      {role === 'doctor' && <Link to="/doctor" style={linkStyle}>Doctor</Link>}
      {role === 'nurse_in_charge' && <Link to="/rooms" style={linkStyle}>Rooms</Link>}
      <Link to="/dashboard" style={linkStyle}>Board</Link>
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