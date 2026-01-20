import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../api/services';
import { message } from 'antd';

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

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authService.getMe();
        setUser(response.data);
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  };

  const login = async (employee_id, password) => {
    try {
      const response = await authService.login({ employee_id, password });
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);

      const userResponse = await authService.getMe();
      setUser(userResponse.data);
      localStorage.setItem('user', JSON.stringify(userResponse.data));

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
