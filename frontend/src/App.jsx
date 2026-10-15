import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import TriageEntry from './pages/TriageEntry';
import DoctorQueue from './pages/DoctorQueue'; 
import RoomManagement from './pages/RoomManagement';

// Placeholders for the remaining screens
const Login = () => <div>Login Screen</div>;
const OperationsBoard = () => <div>Real-Time Operations Board</div>;


function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', backgroundColor: '#f7fafc', padding: '20px' }}>
        <nav style={{ backgroundColor: '#2a4365', padding: '15px', color: 'white', marginBottom: '20px', display: 'flex', gap: '15px' }}>
          <Link to="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>Home</Link>
          <Link to="/triage" style={{ color: 'white', textDecoration: 'none' }}>Triage</Link>
          <Link to="/doctor" style={{ color: 'white', textDecoration: 'none' }}>Doctor</Link>
          <Link to="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>Board</Link>
          <Link to="/rooms" style={{ color: 'white', textDecoration: 'none' }}>Rooms</Link>
        </nav>

        <main style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/triage" element={<TriageEntry />} />
            <Route path="/doctor" element={<DoctorQueue />} />
            <Route path="/dashboard" element={<OperationsBoard />} />
            <Route path="/rooms" element={<RoomManagement />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;