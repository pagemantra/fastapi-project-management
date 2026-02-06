import axios from 'axios';
import { message } from 'antd';

const API_BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors (no response from server)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        message.error('Request timeout - please try again');
      } else if (error.message === 'Network Error') {
        message.error('Network error - please check your connection');
      } else {
        message.error('Unable to connect to server');
      }
      return Promise.reject(error);
    }

    // Handle HTTP error responses
    const { status } = error.response;

    switch (status) {
      case 400:
        // Bad request - show specific error detail if available
        if (error.response?.data?.detail) {
          message.error(error.response.data.detail);
        }
        break;
      case 401:
        // Unauthorized - clear tokens and let ProtectedRoute handle redirect
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Only show message and redirect if not already on login page
        if (!window.location.pathname.includes('/login')) {
          message.error('Session expired - please login again');
          // Use a small delay to ensure message is shown before redirect
          setTimeout(() => {
            window.location.href = '/login';
          }, 100);
        }
        break;
      case 403:
        // Forbidden
        message.error('Permission denied - you do not have access to this resource');
        break;
      case 404:
        // Not found
        message.error('Resource not found');
        break;
      case 500:
        // Server error
        message.error('Server error - please try again later');
        break;
      case 502:
      case 503:
      case 504:
        // Server unavailable
        message.error('Service temporarily unavailable - please try again later');
        break;
      default:
        // Other errors
        if (status >= 500) {
          message.error('Server error - please try again later');
        }
        break;
    }

    return Promise.reject(error);
  }
);

export default api;
