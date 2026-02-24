import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../api/services';
import { message, Spin } from 'antd';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Data version increments on login/logout to force components to refetch
  const [dataVersion, setDataVersion] = useState(0);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authService.getMe();
        setUser(response.data);
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (employee_id, password) => {
    try {
      const response = await authService.login({ employee_id, password });
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);

      const userResponse = await authService.getMe();
      setUser(userResponse.data);
      localStorage.setItem('user', JSON.stringify(userResponse.data));
      // Increment data version to force all components to refetch
      setDataVersion(v => v + 1);

      message.success('Login successful!');
      return userResponse.data;
    } catch (error) {
      message.error(error.response?.data?.detail || 'Login failed');
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    // Increment data version to invalidate all cached component data
    setDataVersion(v => v + 1);
    message.success('Logged out successfully');
  };

  const isAdmin = () => user?.role === 'admin' || user?.role === 'delivery_manager';
  const isDeliveryManager = () => user?.role === 'delivery_manager';
  const isOnlyAdmin = () => user?.role === 'admin';
  const isManager = () => user?.role === 'manager';
  const isTeamLead = () => user?.role === 'team_lead';
  const isEmployee = () => user?.role === 'employee' || user?.role === 'associate';

  const hasRole = (roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin,
    isDeliveryManager,
    isOnlyAdmin,
    isManager,
    isTeamLead,
    isEmployee,
    hasRole,
    checkAuth,
    dataVersion, // Used by components to know when to refetch data
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Loading..." />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
