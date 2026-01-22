import api from './axios';

// Auth Services
export const authService = {
  login: (data) => api.post('/auth/login', data),
  registerAdmin: (data) => api.post('/auth/register-admin', data),
  getMe: () => api.get('/auth/me'),
};

// User Services
export const userService = {
  getUsers: (params) => api.get('/users/', { params }),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users/', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  getManagers: () => api.get('/users/managers'),
  getTeamLeads: () => api.get('/users/team-leads'),
  getEmployees: () => api.get('/users/employees'),
  getAllForDashboard: () => api.get('/users/all-for-dashboard'),
};

// Team Services
export const teamService = {
  getTeams: (params) => api.get('/teams/', { params }),
  getTeam: (id) => api.get(`/teams/${id}`),
  createTeam: (data) => api.post('/teams/', data),
  updateTeam: (id, data) => api.put(`/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/teams/${id}`),
  addMember: (teamId, data) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId, employeeId) => api.delete(`/teams/${teamId}/members/${employeeId}`),
};

// Task Services
export const taskService = {
  getTasks: (params) => api.get('/tasks/', { params }),
  getTask: (id) => api.get(`/tasks/${id}`),
  createTask: (data) => api.post('/tasks/', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  getMyTasks: (params) => api.get('/tasks/my-tasks', { params }),
  getAssignedByMe: (params) => api.get('/tasks/assigned-by-me', { params }),
  addWorkLog: (taskId, data) => api.post(`/tasks/${taskId}/work-log`, data),
  getTaskSummary: (params) => api.get('/tasks/summary', { params }),
};

// Attendance Services
export const attendanceService = {
  clockIn: () => api.post('/attendance/clock-in'),
  clockOut: (data) => api.post('/attendance/clock-out', data),
  getCurrentSession: () => api.get('/attendance/current'),
  getHistory: (params) => api.get('/attendance/history', { params }),
  getTodayAll: () => api.get('/attendance/today-all'),
  startBreak: (data) => api.post('/attendance/break/start', data),
  endBreak: () => api.post('/attendance/break/end'),
  getBreakSettings: (teamId) => api.get(`/attendance/break-settings/${teamId}`),
  createBreakSettings: (data) => api.post('/attendance/break-settings', data),
  updateBreakSettings: (teamId, data) => api.put(`/attendance/break-settings/${teamId}`, data),
};

// Form Services
export const formService = {
  getForms: (params) => api.get('/forms/', { params }),
  getForm: (id) => api.get(`/forms/${id}`),
  createForm: (data) => api.post('/forms/', data),
  updateForm: (id, data) => api.put(`/forms/${id}`, data),
  deleteForm: (id) => api.delete(`/forms/${id}`),
  getTeamForms: (teamId) => api.get(`/forms/team/${teamId}`),
  assignForm: (formId, data) => api.post(`/forms/${formId}/assign`, data),
  unassignForm: (formId, teamId) => api.delete(`/forms/${formId}/unassign/${teamId}`),
};

// Worksheet Services
export const worksheetService = {
  getWorksheets: (params) => api.get('/worksheets/', { params }),
  getWorksheet: (id) => api.get(`/worksheets/${id}`),
  createWorksheet: (data) => api.post('/worksheets/', data),
  updateWorksheet: (id, data) => api.put(`/worksheets/${id}`, data),
  submitWorksheet: (id) => api.post(`/worksheets/${id}/submit`),
  verifyWorksheet: (id) => api.post(`/worksheets/${id}/verify`),
  approveWorksheet: (id) => api.post(`/worksheets/${id}/approve`),
  rejectWorksheet: (id, data) => api.post(`/worksheets/${id}/reject`, data),
  bulkApprove: (data) => api.post('/worksheets/bulk-approve', data),
  getMyWorksheets: (params) => api.get('/worksheets/my-worksheets', { params }),
  getPendingVerification: () => api.get('/worksheets/pending-verification'),
  getPendingApproval: () => api.get('/worksheets/pending-approval'),
  getSummary: (params) => api.get('/worksheets/summary', { params }),
};

// Notification Services
export const notificationService = {
  getNotifications: (params) => api.get('/notifications/', { params }),
  getUnread: (params) => api.get('/notifications/unread', { params }),
  getCount: () => api.get('/notifications/count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  deleteAll: () => api.delete('/notifications'),
};

// Report Services
export const reportService = {
  getProductivityReport: (params) => api.get('/reports/productivity', { params }),
  getAttendanceReport: (params) => api.get('/reports/attendance', { params }),
  getOvertimeReport: (params) => api.get('/reports/overtime', { params }),
  getTeamPerformance: (params) => api.get('/reports/team-performance', { params }),
  getWorksheetAnalytics: (params) => api.get('/reports/worksheet-analytics', { params }),
  getProjectsReport: (params) => api.get('/reports/projects', { params }),
  getManagerMembers: (params) => api.get('/reports/manager-members', { params }),
  exportProductivity: (params) => api.get('/reports/export/productivity', { params, responseType: 'blob' }),
  exportAttendance: (params) => api.get('/reports/export/attendance', { params, responseType: 'blob' }),
  exportOvertime: (params) => api.get('/reports/export/overtime', { params, responseType: 'blob' }),
};
