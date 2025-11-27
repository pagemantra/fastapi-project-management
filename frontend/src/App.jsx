import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';

// Auth pages
import Login from './pages/auth/Login';

// Main pages
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Teams from './pages/Teams';
import Tasks from './pages/Tasks';
import Worksheets from './pages/Worksheets';
import Forms from './pages/Forms';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Attendance from './pages/Attendance';

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes with layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="worksheets" element={<Worksheets />} />
              <Route path="forms" element={<Forms />} />
              <Route path="teams" element={<Teams />} />
              <Route path="users" element={<Users />} />
              <Route path="reports" element={<Reports />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
