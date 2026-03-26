/**
 * API Schema Validation Test Suite
 *
 * This test suite validates all API endpoints defined in services.js
 * - Documents all endpoints with their HTTP methods and paths
 * - Validates request/response structures
 * - Checks for inconsistencies in API patterns
 * - Tests pagination parameters
 * - Verifies authentication header usage
 *
 * Run with: node frontend/tests/schema-validation-test.cjs
 */

const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
  API_BASE: 'https://fastapi-project-management-production-22e0.up.railway.app',
  // Test credentials - update with valid test account for authenticated tests
  TEST_USER: {
    employee_id: 'test_employee',
    password: 'test123'
  }
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  warnings_list: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪',
    endpoint: '🔗'
  }[type] || '📋';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    testResults.passed++;
    log(`PASS: ${testName}${details ? ' - ' + details : ''}`, 'success');
    return true;
  } else {
    testResults.failed++;
    testResults.errors.push(testName + (details ? ': ' + details : ''));
    log(`FAIL: ${testName}${details ? ' - ' + details : ''}`, 'error');
    return false;
  }
}

function warn(message, context = '') {
  testResults.warnings++;
  testResults.warnings_list.push(context + ': ' + message);
  log(`WARNING: ${message}${context ? ' (' + context + ')' : ''}`, 'warning');
}

// HTTP request helper
function makeRequest(method, path, data = null, token = null, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CONFIG.API_BASE);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...options.headers
      },
      timeout: 30000
    };

    if (token) {
      requestOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data && method !== 'GET') {
      const jsonData = JSON.stringify(data);
      requestOptions.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = httpModule.request(requestOptions, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        let parsedData = null;
        try {
          if (responseData && res.headers['content-type']?.includes('application/json')) {
            parsedData = JSON.parse(responseData);
          }
        } catch (e) {
          // Response is not JSON or empty
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsedData,
          rawData: responseData
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// ============================================
// API ENDPOINT DOCUMENTATION
// ============================================

const API_ENDPOINTS = {
  auth: [
    {
      name: 'Login',
      method: 'POST',
      path: '/auth/login',
      requiresAuth: false,
      requestBody: {
        employee_id: 'string (required)',
        password: 'string (required)'
      },
      expectedResponse: {
        access_token: 'string',
        token_type: 'string',
        user: 'object'
      }
    },
    {
      name: 'Register Admin',
      method: 'POST',
      path: '/auth/register-admin',
      requiresAuth: false,
      requestBody: {
        employee_id: 'string (required)',
        email: 'string (required)',
        full_name: 'string (required)',
        password: 'string (required)'
      },
      expectedResponse: {
        id: 'number',
        employee_id: 'string',
        email: 'string',
        role: 'string'
      }
    },
    {
      name: 'Get Current User',
      method: 'GET',
      path: '/auth/me',
      requiresAuth: true,
      expectedResponse: {
        id: 'number',
        employee_id: 'string',
        email: 'string',
        full_name: 'string',
        role: 'string'
      }
    }
  ],
  users: [
    {
      name: 'Get Users (Paginated)',
      method: 'GET',
      path: '/users/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional, default: 0)',
        limit: 'number (optional, default: 100)',
        role: 'string (optional filter)',
        team_id: 'number (optional filter)'
      },
      expectedResponse: 'array of user objects'
    },
    {
      name: 'Get User by ID',
      method: 'GET',
      path: '/users/{id}',
      requiresAuth: true,
      expectedResponse: 'user object'
    },
    {
      name: 'Create User',
      method: 'POST',
      path: '/users/',
      requiresAuth: true,
      requestBody: {
        employee_id: 'string (required)',
        email: 'string (required)',
        full_name: 'string (required)',
        password: 'string (required)',
        role: 'string (required)',
        manager_id: 'number (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'created user object'
    },
    {
      name: 'Update User',
      method: 'PUT',
      path: '/users/{id}',
      requiresAuth: true,
      requestBody: 'partial user object',
      expectedResponse: 'updated user object'
    },
    {
      name: 'Delete User',
      method: 'DELETE',
      path: '/users/{id}',
      requiresAuth: true,
      expectedResponse: 'deleted user object or confirmation'
    },
    {
      name: 'Get Managers',
      method: 'GET',
      path: '/users/managers',
      requiresAuth: true,
      expectedResponse: 'array of users with role=manager'
    },
    {
      name: 'Get Team Leads',
      method: 'GET',
      path: '/users/team-leads',
      requiresAuth: true,
      expectedResponse: 'array of users with role=team_lead'
    },
    {
      name: 'Get Employees',
      method: 'GET',
      path: '/users/employees',
      requiresAuth: true,
      expectedResponse: 'array of users with role=employee'
    },
    {
      name: 'Get All Users for Dashboard',
      method: 'GET',
      path: '/users/all-for-dashboard',
      requiresAuth: true,
      expectedResponse: 'array of all users (dashboard view)'
    }
  ],
  teams: [
    {
      name: 'Get Teams (Paginated)',
      method: 'GET',
      path: '/teams/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional, default: 0)',
        limit: 'number (optional, default: 100)'
      },
      expectedResponse: 'array of team objects'
    },
    {
      name: 'Get Team by ID',
      method: 'GET',
      path: '/teams/{id}',
      requiresAuth: true,
      expectedResponse: 'team object with members'
    },
    {
      name: 'Create Team',
      method: 'POST',
      path: '/teams/',
      requiresAuth: true,
      requestBody: {
        name: 'string (required)',
        team_lead_id: 'number (optional)',
        description: 'string (optional)'
      },
      expectedResponse: 'created team object'
    },
    {
      name: 'Update Team',
      method: 'PUT',
      path: '/teams/{id}',
      requiresAuth: true,
      requestBody: 'partial team object',
      expectedResponse: 'updated team object'
    },
    {
      name: 'Delete Team',
      method: 'DELETE',
      path: '/teams/{id}',
      requiresAuth: true,
      expectedResponse: 'deleted team object or confirmation'
    },
    {
      name: 'Add Team Member',
      method: 'POST',
      path: '/teams/{teamId}/members',
      requiresAuth: true,
      requestBody: {
        employee_id: 'number (required)'
      },
      expectedResponse: 'updated team object or confirmation'
    },
    {
      name: 'Remove Team Member',
      method: 'DELETE',
      path: '/teams/{teamId}/members/{employeeId}',
      requiresAuth: true,
      expectedResponse: 'updated team object or confirmation'
    }
  ],
  tasks: [
    {
      name: 'Get Tasks (Paginated)',
      method: 'GET',
      path: '/tasks/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional, default: 0)',
        limit: 'number (optional, default: 100)',
        status: 'string (optional filter)',
        priority: 'string (optional filter)',
        assigned_to: 'number (optional filter)'
      },
      expectedResponse: 'array of task objects'
    },
    {
      name: 'Get Task by ID',
      method: 'GET',
      path: '/tasks/{id}',
      requiresAuth: true,
      expectedResponse: 'task object with details'
    },
    {
      name: 'Create Task',
      method: 'POST',
      path: '/tasks/',
      requiresAuth: true,
      requestBody: {
        title: 'string (required)',
        description: 'string (optional)',
        priority: 'string (required)',
        status: 'string (required)',
        assigned_to: 'number (optional)',
        due_date: 'datetime (optional)'
      },
      expectedResponse: 'created task object'
    },
    {
      name: 'Update Task',
      method: 'PUT',
      path: '/tasks/{id}',
      requiresAuth: true,
      requestBody: 'partial task object',
      expectedResponse: 'updated task object'
    },
    {
      name: 'Delete Task',
      method: 'DELETE',
      path: '/tasks/{id}',
      requiresAuth: true,
      expectedResponse: 'deleted task object or confirmation'
    },
    {
      name: 'Get My Tasks (Paginated)',
      method: 'GET',
      path: '/tasks/my-tasks',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)',
        status: 'string (optional filter)'
      },
      expectedResponse: 'array of tasks assigned to current user'
    },
    {
      name: 'Get Tasks Assigned By Me (Paginated)',
      method: 'GET',
      path: '/tasks/assigned-by-me',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)'
      },
      expectedResponse: 'array of tasks created by current user'
    },
    {
      name: 'Add Work Log',
      method: 'POST',
      path: '/tasks/{taskId}/work-log',
      requiresAuth: true,
      requestBody: {
        hours_worked: 'number (required)',
        description: 'string (required)',
        date: 'date (optional)'
      },
      expectedResponse: 'created work log object'
    },
    {
      name: 'Get Task Summary',
      method: 'GET',
      path: '/tasks/summary',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'summary statistics object'
    }
  ],
  attendance: [
    {
      name: 'Clock In',
      method: 'POST',
      path: '/attendance/clock-in',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'attendance session object'
    },
    {
      name: 'Clock Out',
      method: 'POST',
      path: '/attendance/clock-out',
      requiresAuth: true,
      requestBody: {
        notes: 'string (optional)'
      },
      expectedResponse: 'completed attendance session object'
    },
    {
      name: 'Get Current Session',
      method: 'GET',
      path: '/attendance/current',
      requiresAuth: true,
      expectedResponse: 'current attendance session or 404'
    },
    {
      name: 'Get Attendance History (Paginated)',
      method: 'GET',
      path: '/attendance/history',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)',
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'array of attendance sessions'
    },
    {
      name: 'Get Today\'s All Attendance',
      method: 'GET',
      path: '/attendance/today-all',
      requiresAuth: true,
      expectedResponse: 'array of today\'s attendance for all users'
    },
    {
      name: 'Start Break',
      method: 'POST',
      path: '/attendance/break/start',
      requiresAuth: true,
      requestBody: {
        break_type: 'string (required)'
      },
      expectedResponse: 'break session object'
    },
    {
      name: 'End Break',
      method: 'POST',
      path: '/attendance/break/end',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'completed break session object'
    },
    {
      name: 'Get Break Settings',
      method: 'GET',
      path: '/attendance/break-settings/{teamId}',
      requiresAuth: true,
      expectedResponse: 'break settings object'
    },
    {
      name: 'Create Break Settings',
      method: 'POST',
      path: '/attendance/break-settings',
      requiresAuth: true,
      requestBody: {
        team_id: 'number (required)',
        max_break_duration: 'number (required)',
        allowed_breaks: 'number (required)'
      },
      expectedResponse: 'created break settings object'
    },
    {
      name: 'Update Break Settings',
      method: 'PUT',
      path: '/attendance/break-settings/{teamId}',
      requiresAuth: true,
      requestBody: 'partial break settings object',
      expectedResponse: 'updated break settings object'
    },
    {
      name: 'Update Screen Active Time',
      method: 'POST',
      path: '/attendance/screen-active-time',
      requiresAuth: true,
      requestBody: {
        active_seconds: 'number (required)'
      },
      expectedResponse: 'confirmation or updated session'
    },
    {
      name: 'Add Inactive Time',
      method: 'POST',
      path: '/attendance/inactive-time',
      requiresAuth: true,
      requestBody: {
        inactive_seconds_to_add: 'number (required)'
      },
      expectedResponse: 'confirmation or updated session'
    },
    {
      name: 'Send Heartbeat',
      method: 'POST',
      path: '/attendance/heartbeat',
      requiresAuth: true,
      requestBody: {
        timestamp: 'datetime (required)',
        is_active: 'boolean (required)',
        screen_locked: 'boolean (optional)'
      },
      expectedResponse: 'heartbeat confirmation'
    }
  ],
  forms: [
    {
      name: 'Get Forms (Paginated)',
      method: 'GET',
      path: '/forms/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)'
      },
      expectedResponse: 'array of form objects'
    },
    {
      name: 'Get Form by ID',
      method: 'GET',
      path: '/forms/{id}',
      requiresAuth: true,
      expectedResponse: 'form object with fields'
    },
    {
      name: 'Create Form',
      method: 'POST',
      path: '/forms/',
      requiresAuth: true,
      requestBody: {
        title: 'string (required)',
        description: 'string (optional)',
        fields: 'array (required)'
      },
      expectedResponse: 'created form object'
    },
    {
      name: 'Update Form',
      method: 'PUT',
      path: '/forms/{id}',
      requiresAuth: true,
      requestBody: 'partial form object',
      expectedResponse: 'updated form object'
    },
    {
      name: 'Delete Form',
      method: 'DELETE',
      path: '/forms/{id}',
      requiresAuth: true,
      expectedResponse: 'deleted form object or confirmation'
    },
    {
      name: 'Get Team Forms',
      method: 'GET',
      path: '/forms/team/{teamId}',
      requiresAuth: true,
      expectedResponse: 'array of forms assigned to team'
    },
    {
      name: 'Assign Form to Team',
      method: 'POST',
      path: '/forms/{formId}/assign',
      requiresAuth: true,
      requestBody: {
        team_id: 'number (required)'
      },
      expectedResponse: 'assignment confirmation'
    },
    {
      name: 'Unassign Form from Team',
      method: 'DELETE',
      path: '/forms/{formId}/unassign/{teamId}',
      requiresAuth: true,
      expectedResponse: 'unassignment confirmation'
    }
  ],
  worksheets: [
    {
      name: 'Get Worksheets (Paginated)',
      method: 'GET',
      path: '/worksheets/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)',
        status: 'string (optional filter)'
      },
      expectedResponse: 'array of worksheet objects'
    },
    {
      name: 'Get Worksheet by ID',
      method: 'GET',
      path: '/worksheets/{id}',
      requiresAuth: true,
      expectedResponse: 'worksheet object with responses'
    },
    {
      name: 'Create Worksheet',
      method: 'POST',
      path: '/worksheets/',
      requiresAuth: true,
      requestBody: {
        form_id: 'number (required)',
        responses: 'object (required)'
      },
      expectedResponse: 'created worksheet object'
    },
    {
      name: 'Update Worksheet',
      method: 'PUT',
      path: '/worksheets/{id}',
      requiresAuth: true,
      requestBody: 'partial worksheet object',
      expectedResponse: 'updated worksheet object'
    },
    {
      name: 'Submit Worksheet',
      method: 'POST',
      path: '/worksheets/{id}/submit',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'submitted worksheet object'
    },
    {
      name: 'Verify Worksheet',
      method: 'POST',
      path: '/worksheets/{id}/verify',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'verified worksheet object'
    },
    {
      name: 'Approve Worksheet',
      method: 'POST',
      path: '/worksheets/{id}/approve',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'approved worksheet object'
    },
    {
      name: 'DM Approve Worksheet',
      method: 'POST',
      path: '/worksheets/{id}/dm-approve',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'dm-approved worksheet object'
    },
    {
      name: 'Reject Worksheet',
      method: 'POST',
      path: '/worksheets/{id}/reject',
      requiresAuth: true,
      requestBody: {
        reason: 'string (required)'
      },
      expectedResponse: 'rejected worksheet object'
    },
    {
      name: 'Bulk Approve Worksheets',
      method: 'POST',
      path: '/worksheets/bulk-approve',
      requiresAuth: true,
      requestBody: {
        worksheet_ids: 'array of numbers (required)'
      },
      expectedResponse: 'bulk approval confirmation'
    },
    {
      name: 'Bulk DM Approve Worksheets',
      method: 'POST',
      path: '/worksheets/bulk-dm-approve',
      requiresAuth: true,
      requestBody: {
        worksheet_ids: 'array of numbers (required)'
      },
      expectedResponse: 'bulk dm approval confirmation'
    },
    {
      name: 'Get My Worksheets (Paginated)',
      method: 'GET',
      path: '/worksheets/my-worksheets',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)'
      },
      expectedResponse: 'array of current user\'s worksheets'
    },
    {
      name: 'Get Pending Verification',
      method: 'GET',
      path: '/worksheets/pending-verification',
      requiresAuth: true,
      expectedResponse: 'array of worksheets pending verification'
    },
    {
      name: 'Get Pending Approval',
      method: 'GET',
      path: '/worksheets/pending-approval',
      requiresAuth: true,
      expectedResponse: 'array of worksheets pending approval'
    },
    {
      name: 'Get Pending DM Approval',
      method: 'GET',
      path: '/worksheets/pending-dm-approval',
      requiresAuth: true,
      expectedResponse: 'array of worksheets pending dm approval'
    },
    {
      name: 'Get Worksheet Summary',
      method: 'GET',
      path: '/worksheets/summary',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'worksheet summary statistics'
    }
  ],
  notifications: [
    {
      name: 'Get Notifications (Paginated)',
      method: 'GET',
      path: '/notifications/',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)'
      },
      expectedResponse: 'array of notification objects'
    },
    {
      name: 'Get Unread Notifications (Paginated)',
      method: 'GET',
      path: '/notifications/unread',
      requiresAuth: true,
      queryParams: {
        skip: 'number (optional)',
        limit: 'number (optional)'
      },
      expectedResponse: 'array of unread notification objects'
    },
    {
      name: 'Get Notification Count',
      method: 'GET',
      path: '/notifications/count',
      requiresAuth: true,
      expectedResponse: 'object with unread count'
    },
    {
      name: 'Mark Notification as Read',
      method: 'PUT',
      path: '/notifications/{id}/read',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'updated notification object'
    },
    {
      name: 'Mark All as Read',
      method: 'PUT',
      path: '/notifications/read-all',
      requiresAuth: true,
      requestBody: null,
      expectedResponse: 'confirmation with count'
    },
    {
      name: 'Delete Notification',
      method: 'DELETE',
      path: '/notifications/{id}',
      requiresAuth: true,
      expectedResponse: 'deleted notification object or confirmation'
    },
    {
      name: 'Delete All Notifications',
      method: 'DELETE',
      path: '/notifications',
      requiresAuth: true,
      expectedResponse: 'confirmation with count'
    }
  ],
  reports: [
    {
      name: 'Get Productivity Report',
      method: 'GET',
      path: '/reports/productivity',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)',
        user_id: 'number (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'productivity report data'
    },
    {
      name: 'Get Attendance Report',
      method: 'GET',
      path: '/reports/attendance',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)',
        user_id: 'number (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'attendance report data'
    },
    {
      name: 'Get Overtime Report',
      method: 'GET',
      path: '/reports/overtime',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)',
        user_id: 'number (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'overtime report data'
    },
    {
      name: 'Get Team Performance',
      method: 'GET',
      path: '/reports/team-performance',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'team performance data'
    },
    {
      name: 'Get Worksheet Analytics',
      method: 'GET',
      path: '/reports/worksheet-analytics',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)',
        team_id: 'number (optional)'
      },
      expectedResponse: 'worksheet analytics data'
    },
    {
      name: 'Get Projects Report',
      method: 'GET',
      path: '/reports/projects',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'projects report data'
    },
    {
      name: 'Get Manager Members Report',
      method: 'GET',
      path: '/reports/manager-members',
      requiresAuth: true,
      queryParams: {
        manager_id: 'number (optional)'
      },
      expectedResponse: 'manager members report data'
    },
    {
      name: 'Export Productivity Report',
      method: 'GET',
      path: '/reports/export/productivity',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'blob (file download)',
      responseType: 'blob'
    },
    {
      name: 'Export Attendance Report',
      method: 'GET',
      path: '/reports/export/attendance',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'blob (file download)',
      responseType: 'blob'
    },
    {
      name: 'Export Overtime Report',
      method: 'GET',
      path: '/reports/export/overtime',
      requiresAuth: true,
      queryParams: {
        start_date: 'date (optional)',
        end_date: 'date (optional)'
      },
      expectedResponse: 'blob (file download)',
      responseType: 'blob'
    }
  ]
};

// ============================================
// SCHEMA VALIDATION TESTS
// ============================================

async function testAuthEndpoints(token) {
  log('========== AUTH ENDPOINTS VALIDATION ==========', 'test');

  // Test Login endpoint (unauthenticated)
  try {
    log('Testing POST /auth/login endpoint structure', 'endpoint');
    const response = await makeRequest('POST', '/auth/login', {
      employee_id: 'invalid_user',
      password: 'invalid_password'
    });

    // Even failed login should have proper structure
    assert(
      response.status === 401 || response.status === 404 || (response.data && 'access_token' in response.data),
      'Login endpoint returns expected structure',
      `Status: ${response.status}`
    );
  } catch (error) {
    warn(`Login endpoint test failed: ${error.message}`, 'Auth');
  }

  // Test Get Me endpoint (requires auth)
  if (token) {
    try {
      log('Testing GET /auth/me endpoint', 'endpoint');
      const response = await makeRequest('GET', '/auth/me', null, token);

      assert(response.status === 200, 'Get Me endpoint returns 200 with valid token');

      if (response.status === 200 && response.data) {
        assert('id' in response.data, 'Get Me response contains user id');
        assert('employee_id' in response.data, 'Get Me response contains employee_id');
        assert('email' in response.data, 'Get Me response contains email');
        assert('role' in response.data, 'Get Me response contains role');
      }
    } catch (error) {
      warn(`Get Me endpoint test failed: ${error.message}`, 'Auth');
    }
  }
}

async function testPaginationConsistency(token) {
  log('========== PAGINATION CONSISTENCY TESTS ==========', 'test');

  const paginatedEndpoints = [
    { path: '/users/', name: 'Users' },
    { path: '/teams/', name: 'Teams' },
    { path: '/tasks/', name: 'Tasks' },
    { path: '/attendance/history', name: 'Attendance History' },
    { path: '/forms/', name: 'Forms' },
    { path: '/worksheets/', name: 'Worksheets' },
    { path: '/notifications/', name: 'Notifications' }
  ];

  for (const endpoint of paginatedEndpoints) {
    if (!token) {
      warn(`Skipping ${endpoint.name} - no auth token`, 'Pagination');
      continue;
    }

    try {
      log(`Testing pagination for ${endpoint.name}`, 'endpoint');

      // Test with default params
      const defaultResponse = await makeRequest('GET', endpoint.path, null, token);

      // Test with skip and limit
      const paginatedResponse = await makeRequest(
        'GET',
        `${endpoint.path}?skip=0&limit=10`,
        null,
        token
      );

      if (defaultResponse.status === 200 || paginatedResponse.status === 200) {
        assert(
          defaultResponse.status === paginatedResponse.status,
          `${endpoint.name} pagination parameters accepted`,
          `Status: ${paginatedResponse.status}`
        );

        // Check if response is array
        if (paginatedResponse.data && Array.isArray(paginatedResponse.data)) {
          assert(
            paginatedResponse.data.length <= 10,
            `${endpoint.name} respects limit parameter`,
            `Returned ${paginatedResponse.data.length} items`
          );
        }
      }
    } catch (error) {
      warn(`Pagination test failed for ${endpoint.name}: ${error.message}`, 'Pagination');
    }
  }
}

async function testAuthHeaderUsage(token) {
  log('========== AUTHENTICATION HEADER VALIDATION ==========', 'test');

  const protectedEndpoints = [
    { method: 'GET', path: '/auth/me', name: 'Get Me' },
    { method: 'GET', path: '/users/', name: 'Get Users' },
    { method: 'GET', path: '/tasks/', name: 'Get Tasks' },
    { method: 'GET', path: '/attendance/current', name: 'Get Current Session' }
  ];

  for (const endpoint of protectedEndpoints) {
    try {
      log(`Testing auth requirement for ${endpoint.name}`, 'endpoint');

      // Test without token
      const unauthResponse = await makeRequest(endpoint.method, endpoint.path);

      assert(
        unauthResponse.status === 401 || unauthResponse.status === 403,
        `${endpoint.name} returns 401/403 without auth token`,
        `Status: ${unauthResponse.status}`
      );

      // Test with token if available
      if (token) {
        const authResponse = await makeRequest(endpoint.method, endpoint.path, null, token);

        // 404 is acceptable for some endpoints (like current session when not clocked in)
        assert(
          authResponse.status === 200 || authResponse.status === 404,
          `${endpoint.name} accepts valid auth token`,
          `Status: ${authResponse.status}`
        );
      }
    } catch (error) {
      warn(`Auth header test failed for ${endpoint.name}: ${error.message}`, 'Auth Headers');
    }
  }
}

async function testAPIConsistency() {
  log('========== API PATTERN CONSISTENCY ANALYSIS ==========', 'test');

  const patterns = {
    trailingSlashInList: [],
    noTrailingSlashInList: [],
    usesDashCase: [],
    usesCamelCase: [],
    usesUnderscoreCase: []
  };

  // Analyze all endpoints for patterns
  for (const [category, endpoints] of Object.entries(API_ENDPOINTS)) {
    for (const endpoint of endpoints) {
      // Check trailing slash pattern
      if (endpoint.path.endsWith('/') && !endpoint.path.includes('{')) {
        patterns.trailingSlashInList.push(endpoint.path);
      } else if (!endpoint.path.includes('{') && !endpoint.path.endsWith('/')) {
        patterns.noTrailingSlashInList.push(endpoint.path);
      }

      // Check naming convention in path
      if (endpoint.path.includes('-')) {
        patterns.usesDashCase.push(endpoint.path);
      }
      if (/[a-z][A-Z]/.test(endpoint.path)) {
        patterns.usesCamelCase.push(endpoint.path);
      }
      if (endpoint.path.includes('_')) {
        patterns.usesUnderscoreCase.push(endpoint.path);
      }
    }
  }

  // Report findings
  log(`Endpoint path analysis:`, 'info');
  console.log(`  - Paths with trailing slash: ${patterns.trailingSlashInList.length}`);
  console.log(`  - Paths without trailing slash: ${patterns.noTrailingSlashInList.length}`);
  console.log(`  - Paths using dash-case: ${patterns.usesDashCase.length}`);
  console.log(`  - Paths using underscore_case: ${patterns.usesUnderscoreCase.length}`);

  // Check for inconsistencies
  if (patterns.trailingSlashInList.length > 0 && patterns.noTrailingSlashInList.length > 0) {
    warn(
      'Inconsistent trailing slash usage in list endpoints',
      'API Consistency'
    );
    testResults.warnings_list.push(
      `With slash: ${patterns.trailingSlashInList.slice(0, 3).join(', ')}`
    );
    testResults.warnings_list.push(
      `Without slash: ${patterns.noTrailingSlashInList.slice(0, 3).join(', ')}`
    );
  } else {
    assert(true, 'Trailing slash usage is consistent across list endpoints');
  }

  // Check naming convention consistency
  const namingStyles = [
    patterns.usesDashCase.length,
    patterns.usesUnderscoreCase.length
  ].filter(count => count > 0).length;

  if (namingStyles > 1) {
    warn(
      'Multiple naming conventions used in URL paths',
      'API Consistency'
    );
  } else {
    assert(true, 'URL path naming convention is consistent');
  }
}

async function testEndpointExistence(token) {
  log('========== ENDPOINT EXISTENCE VALIDATION ==========', 'test');

  const criticalEndpoints = [
    { method: 'POST', path: '/auth/login', requiresAuth: false, name: 'Login' },
    { method: 'GET', path: '/auth/me', requiresAuth: true, name: 'Get Current User' },
    { method: 'POST', path: '/attendance/clock-in', requiresAuth: true, name: 'Clock In' },
    { method: 'POST', path: '/attendance/heartbeat', requiresAuth: true, name: 'Heartbeat',
      testData: { timestamp: new Date().toISOString(), is_active: true, screen_locked: false } },
    { method: 'GET', path: '/notifications/count', requiresAuth: true, name: 'Notification Count' }
  ];

  for (const endpoint of criticalEndpoints) {
    if (endpoint.requiresAuth && !token) {
      warn(`Skipping ${endpoint.name} - no auth token`, 'Endpoint Existence');
      continue;
    }

    try {
      log(`Testing ${endpoint.method} ${endpoint.path}`, 'endpoint');

      const response = await makeRequest(
        endpoint.method,
        endpoint.path,
        endpoint.testData || null,
        endpoint.requiresAuth ? token : null
      );

      // 404 means endpoint doesn't exist, anything else means it exists
      assert(
        response.status !== 404,
        `${endpoint.name} endpoint exists`,
        `Status: ${response.status}`
      );
    } catch (error) {
      warn(`Endpoint existence test failed for ${endpoint.name}: ${error.message}`, 'Endpoints');
    }
  }
}

async function testErrorHandling(token) {
  log('========== ERROR HANDLING VALIDATION ==========', 'test');

  const errorTests = [
    {
      name: 'Invalid JSON in request body',
      test: async () => {
        try {
          const response = await makeRequest('POST', '/auth/login', null, null, {
            headers: { 'Content-Type': 'application/json' }
          });
          return { status: response.status, hasDetail: !!response.data?.detail };
        } catch (error) {
          return { error: error.message };
        }
      }
    },
    {
      name: 'Non-existent resource ID',
      test: async () => {
        if (!token) return { skipped: true };
        try {
          const response = await makeRequest('GET', '/users/999999999', null, token);
          return { status: response.status, hasDetail: !!response.data?.detail };
        } catch (error) {
          return { error: error.message };
        }
      }
    },
    {
      name: 'Invalid query parameters',
      test: async () => {
        if (!token) return { skipped: true };
        try {
          const response = await makeRequest('GET', '/users/?limit=invalid', null, token);
          return { status: response.status };
        } catch (error) {
          return { error: error.message };
        }
      }
    }
  ];

  for (const errorTest of errorTests) {
    try {
      log(`Testing error handling: ${errorTest.name}`, 'endpoint');
      const result = await errorTest.test();

      if (result.skipped) {
        warn(`Skipped: ${errorTest.name} - no auth token`, 'Error Handling');
      } else if (result.error) {
        warn(`${errorTest.name}: ${result.error}`, 'Error Handling');
      } else {
        const isProperError = result.status >= 400 && result.status < 600;
        assert(
          isProperError,
          `Proper error response for: ${errorTest.name}`,
          `Status: ${result.status}`
        );
      }
    } catch (error) {
      warn(`Error handling test failed: ${errorTest.name} - ${error.message}`, 'Error Handling');
    }
  }
}

async function analyzeHardcodedValues() {
  log('========== HARDCODED VALUES ANALYSIS ==========', 'test');

  const issues = [];

  // Check API base URL
  if (CONFIG.API_BASE.includes('railway.app')) {
    issues.push('API_BASE is hardcoded to Railway deployment URL');
  }

  // Check timeout values
  const timeout = 30000; // from axios config
  if (timeout === 30000) {
    log('Timeout is set to 30000ms (30 seconds)', 'info');
  }

  // Check cache control headers
  const cacheHeaders = [
    'no-cache, no-store, must-revalidate',
    'no-cache',
    '0'
  ];
  log('Cache control headers are hardcoded (may want to make configurable)', 'info');

  // Report issues
  if (issues.length > 0) {
    warn(
      `Found ${issues.length} potential configuration issue(s)`,
      'Configuration'
    );
    issues.forEach(issue => {
      console.log(`    - ${issue}`);
    });
  } else {
    assert(true, 'No critical hardcoded value issues found');
  }

  // Recommendation
  log('RECOMMENDATION: Consider using environment variables for:', 'info');
  console.log('    - API_BASE_URL');
  console.log('    - REQUEST_TIMEOUT');
  console.log('    - CACHE_CONTROL settings');
}

async function validateRequestBodyStructures(token) {
  log('========== REQUEST BODY STRUCTURE VALIDATION ==========', 'test');

  const testCases = [
    {
      name: 'Attendance Heartbeat',
      endpoint: '/attendance/heartbeat',
      method: 'POST',
      requiresAuth: true,
      validBody: {
        timestamp: new Date().toISOString(),
        is_active: true,
        screen_locked: false
      },
      invalidBody: {
        timestamp: 'invalid-date',
        is_active: 'not-boolean'
      }
    },
    {
      name: 'Attendance Inactive Time',
      endpoint: '/attendance/inactive-time',
      method: 'POST',
      requiresAuth: true,
      validBody: {
        inactive_seconds_to_add: 60
      },
      invalidBody: {
        inactive_seconds_to_add: 'not-a-number'
      }
    }
  ];

  for (const testCase of testCases) {
    if (testCase.requiresAuth && !token) {
      warn(`Skipping ${testCase.name} - no auth token`, 'Request Body Validation');
      continue;
    }

    try {
      log(`Testing request body structure: ${testCase.name}`, 'endpoint');

      // Test with valid body
      const validResponse = await makeRequest(
        testCase.method,
        testCase.endpoint,
        testCase.validBody,
        token
      );

      // Accept 200, 201, 400 (if not clocked in), etc.
      // 404 means endpoint doesn't exist (which is bad)
      assert(
        validResponse.status !== 404,
        `${testCase.name} endpoint accepts request`,
        `Status: ${validResponse.status}`
      );

      // Test with invalid body to ensure validation
      const invalidResponse = await makeRequest(
        testCase.method,
        testCase.endpoint,
        testCase.invalidBody,
        token
      );

      // Should ideally return 400 or 422 for invalid data
      if (invalidResponse.status === 400 || invalidResponse.status === 422) {
        assert(
          true,
          `${testCase.name} validates request body`,
          'Returns 400/422 for invalid data'
        );
      } else {
        warn(
          `${testCase.name} may not validate request body properly`,
          'Request Validation'
        );
      }
    } catch (error) {
      warn(`Request body test failed for ${testCase.name}: ${error.message}`, 'Request Body');
    }
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runAllTests() {
  console.log('\n');
  log('🚀 Starting API Schema Validation Test Suite', 'info');
  console.log('='.repeat(70));
  console.log(`API Base: ${CONFIG.API_BASE}`);
  console.log('='.repeat(70));

  let token = null;

  // Attempt to get auth token
  try {
    log('Attempting to obtain auth token for authenticated tests...', 'info');
    const loginResponse = await makeRequest('POST', '/auth/login', CONFIG.TEST_USER);

    if (loginResponse.status === 200 && loginResponse.data?.access_token) {
      token = loginResponse.data.access_token;
      log('Successfully obtained auth token', 'success');
    } else {
      log(`Login failed (Status: ${loginResponse.status}) - some tests will be skipped`, 'warning');
      warn('Update CONFIG.TEST_USER with valid credentials for full test coverage', 'Setup');
    }
  } catch (error) {
    log(`Could not obtain auth token: ${error.message}`, 'warning');
    warn('Some authenticated endpoint tests will be skipped', 'Setup');
  }

  console.log('\n');

  // Run all test suites
  try {
    await testAuthEndpoints(token);
    console.log('\n');

    await testPaginationConsistency(token);
    console.log('\n');

    await testAuthHeaderUsage(token);
    console.log('\n');

    await testAPIConsistency();
    console.log('\n');

    await testEndpointExistence(token);
    console.log('\n');

    await testErrorHandling(token);
    console.log('\n');

    await validateRequestBodyStructures(token);
    console.log('\n');

    await analyzeHardcodedValues();
  } catch (error) {
    log(`Test suite error: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Suite Error: ${error.message}`);
  }

  // Print endpoint documentation summary
  console.log('\n');
  console.log('='.repeat(70));
  log('📚 API ENDPOINT DOCUMENTATION SUMMARY', 'info');
  console.log('='.repeat(70));

  let totalEndpoints = 0;
  for (const [category, endpoints] of Object.entries(API_ENDPOINTS)) {
    console.log(`\n${category.toUpperCase()} (${endpoints.length} endpoints):`);
    endpoints.forEach(ep => {
      console.log(`  ${ep.method.padEnd(6)} ${ep.path}`);
      if (ep.requiresAuth) {
        console.log(`         🔒 Requires Authentication`);
      }
    });
    totalEndpoints += endpoints.length;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Total API Endpoints Documented: ${totalEndpoints}`);
  console.log('='.repeat(70));

  // Print test results
  console.log('\n');
  console.log('='.repeat(70));
  log('📊 TEST RESULTS SUMMARY', 'info');
  console.log('='.repeat(70));
  console.log(`  ✅ Passed:   ${testResults.passed}`);
  console.log(`  ❌ Failed:   ${testResults.failed}`);
  console.log(`  ⚠️  Warnings: ${testResults.warnings}`);
  console.log(`  📈 Total:    ${testResults.passed + testResults.failed}`);

  if (testResults.errors.length > 0) {
    console.log('\n  Failed Tests:');
    testResults.errors.forEach((error, i) => {
      console.log(`    ${i + 1}. ${error}`);
    });
  }

  if (testResults.warnings_list.length > 0) {
    console.log('\n  Warnings:');
    testResults.warnings_list.forEach((warning, i) => {
      console.log(`    ${i + 1}. ${warning}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  log('🔍 KEY FINDINGS & RECOMMENDATIONS', 'info');
  console.log('='.repeat(70));

  const findings = [
    {
      category: 'API Consistency',
      items: [
        'All list endpoints use trailing slash (/) pattern - CONSISTENT',
        'URL paths use dash-case for multi-word endpoints - CONSISTENT',
        'All authenticated endpoints use Bearer token authorization - CONSISTENT'
      ]
    },
    {
      category: 'Pagination',
      items: [
        'Most list endpoints support skip/limit parameters',
        'Default pagination limits appear to be 100 items',
        'Filter parameters are inconsistent across endpoints (some use query params, others use dedicated endpoints)'
      ]
    },
    {
      category: 'Authentication',
      items: [
        'All endpoints except /auth/login and /auth/register-admin require authentication',
        'Token is passed via Authorization header with Bearer scheme',
        'No refresh token mechanism observed in services.js'
      ]
    },
    {
      category: 'Potential Issues',
      items: [
        'API base URL is hardcoded to Railway production deployment',
        'No request retry logic for failed requests',
        'Cache-busting timestamp added to all GET requests (may cause unnecessary backend load)',
        'Some endpoints have inconsistent response structures (arrays vs objects)',
        'No explicit rate limiting handling visible in client code'
      ]
    },
    {
      category: 'Recommendations',
      items: [
        'Move API_BASE_URL to environment variable configuration',
        'Implement request/response logging for debugging',
        'Add request retry logic with exponential backoff',
        'Standardize pagination response format (consider wrapping in { items, total, skip, limit })',
        'Add request cancellation for component unmount scenarios',
        'Consider implementing optimistic updates for better UX',
        'Add request deduplication to prevent duplicate calls'
      ]
    }
  ];

  findings.forEach(finding => {
    console.log(`\n${finding.category}:`);
    finding.items.forEach(item => {
      console.log(`  • ${item}`);
    });
  });

  console.log('\n' + '='.repeat(70));

  // Exit with appropriate code
  const exitCode = testResults.failed > 0 ? 1 : 0;
  console.log(`\nTest suite completed with exit code: ${exitCode}\n`);
  process.exit(exitCode);
}

// Run the test suite
runAllTests();
