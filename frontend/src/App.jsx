import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';

// Auth pages
import Login from './pages/auth/Login';
import Unauthorized from './pages/Unauthorized';

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

// Role-specific pages
import MyTasks from './pages/MyTasks';
import MyWorksheets from './pages/MyWorksheets';
import MyTeam from './pages/MyTeam';
import VerifyWorksheets from './pages/VerifyWorksheets';

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
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

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

              {/* Common routes - accessible to all authenticated users */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="notifications" element={<Notifications />} />

              {/* Tasks route - shows different view based on role */}
              <Route path="tasks" element={<Tasks />} />

              {/* Admin & Manager routes */}
              <Route path="users" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="teams" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Teams />
                </ProtectedRoute>
              } />
              <Route path="forms" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Forms />
                </ProtectedRoute>
              } />
              <Route path="worksheets" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Worksheets />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Reports />
                </ProtectedRoute>
              } />

              {/* Employee role routes */}
              <Route path="my-tasks" element={
                <ProtectedRoute allowedRoles={['employee']}>
                  <MyTasks />
                </ProtectedRoute>
              } />
              <Route path="my-worksheets" element={
                <ProtectedRoute allowedRoles={['employee']}>
                  <MyWorksheets />
                </ProtectedRoute>
              } />

              {/* Team Lead role routes */}
              <Route path="my-team" element={
                <ProtectedRoute allowedRoles={['team_lead']}>
                  <MyTeam />
                </ProtectedRoute>
              } />
              <Route path="verify-worksheets" element={
                <ProtectedRoute allowedRoles={['team_lead']}>
                  <VerifyWorksheets />
                </ProtectedRoute>
              } />
            </Route>

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
