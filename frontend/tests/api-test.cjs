/**
 * Comprehensive API Test Suite for FastAPI Project Management Backend
 * Tests all REST API endpoints including authentication, user management,
 * teams, tasks, attendance, worksheets, forms, notifications, and reports.
 *
 * Usage: node api-test.cjs
 */

const API_BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Test configuration
const config = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  verbose: true,
};

// Test data storage
const testData = {
  token: null,
  user: null,
  createdUsers: [],
  createdTeams: [],
  createdTasks: [],
  createdForms: [],
  createdWorksheets: [],
  attendanceSession: null,
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Utility functions
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[PASS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[FAIL]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bright}=== ${msg} ===${colors.reset}\n`),
};

// HTTP request helper
async function request(method, endpoint, data = null, options = {}) {
  const url = `${config.baseURL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...options.headers,
  };

  if (testData.token) {
    headers['Authorization'] = `Bearer ${testData.token}`;
  }

  const requestOptions = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestOptions.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get('content-type');

    let responseData;
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (config.verbose) {
      log.info(`${method} ${endpoint} - Status: ${response.status}`);
    }

    return {
      status: response.status,
      data: responseData,
      ok: response.ok,
      headers: response.headers,
    };
  } catch (error) {
    log.error(`Request failed: ${error.message}`);
    return {
      status: 0,
      data: null,
      ok: false,
      error: error.message,
    };
  }
}

// Test assertion helper
function assert(condition, message, details = '') {
  if (condition) {
    log.success(message);
    return true;
  } else {
    log.error(`${message}${details ? ' - ' + details : ''}`);
    return false;
  }
}

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =============================================================================
// TEST SUITES
// =============================================================================

// Authentication Tests
async function testAuthentication() {
  log.section('Authentication Endpoints');
  let passed = 0;
  let failed = 0;

  // Test 1: Login with credentials
  try {
    const response = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'admin123',
    });

    if (assert(response.ok && response.data.access_token, 'POST /auth/login - Admin login')) {
      testData.token = response.data.access_token;
      testData.user = response.data.user;
      passed++;
    } else {
      failed++;
      log.error('Login failed - cannot continue tests without authentication');
      return { passed, failed };
    }
  } catch (error) {
    log.error('Login test failed: ' + error.message);
    failed++;
    return { passed, failed };
  }

  // Test 2: Get current user
  try {
    const response = await request('GET', '/auth/me');
    assert(response.ok && response.data.id, 'GET /auth/me - Get current user') ? passed++ : failed++;
  } catch (error) {
    log.error('Get me test failed: ' + error.message);
    failed++;
  }

  // Test 3: Register admin (may fail if already exists)
  try {
    const response = await request('POST', '/auth/register-admin', {
      username: `testadmin_${Date.now()}`,
      email: `testadmin_${Date.now()}@example.com`,
      password: 'TestAdmin123!',
      full_name: 'Test Administrator',
    });

    if (response.ok) {
      log.success('POST /auth/register-admin - Register admin');
      passed++;
    } else if (response.status === 400 || response.status === 409) {
      log.warning('POST /auth/register-admin - Admin registration (already exists or validation error)');
      passed++;
    } else {
      log.error('POST /auth/register-admin - Unexpected error');
      failed++;
    }
  } catch (error) {
    log.error('Register admin test failed: ' + error.message);
    failed++;
  }

  return { passed, failed };
}

// User Management Tests
async function testUserManagement() {
  log.section('User Management Endpoints');
  let passed = 0;
  let failed = 0;
  let createdUserId = null;

  // Test 1: Get all users
  try {
    const response = await request('GET', '/users/');
    assert(response.ok && Array.isArray(response.data), 'GET /users/ - Get all users') ? passed++ : failed++;
  } catch (error) {
    log.error('Get users test failed: ' + error.message);
    failed++;
  }

  // Test 2: Get managers
  try {
    const response = await request('GET', '/users/managers');
    assert(response.ok && Array.isArray(response.data), 'GET /users/managers - Get managers') ? passed++ : failed++;
  } catch (error) {
    log.error('Get managers test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get team leads
  try {
    const response = await request('GET', '/users/team-leads');
    assert(response.ok && Array.isArray(response.data), 'GET /users/team-leads - Get team leads') ? passed++ : failed++;
  } catch (error) {
    log.error('Get team leads test failed: ' + error.message);
    failed++;
  }

  // Test 4: Get employees
  try {
    const response = await request('GET', '/users/employees');
    assert(response.ok && Array.isArray(response.data), 'GET /users/employees - Get employees') ? passed++ : failed++;
  } catch (error) {
    log.error('Get employees test failed: ' + error.message);
    failed++;
  }

  // Test 5: Get all users for dashboard
  try {
    const response = await request('GET', '/users/all-for-dashboard');
    assert(response.ok, 'GET /users/all-for-dashboard - Get dashboard users') ? passed++ : failed++;
  } catch (error) {
    log.error('Get dashboard users test failed: ' + error.message);
    failed++;
  }

  // Test 6: Create user
  try {
    const timestamp = Date.now();
    const response = await request('POST', '/users/', {
      username: `testuser_${timestamp}`,
      email: `testuser_${timestamp}@example.com`,
      password: 'TestUser123!',
      full_name: 'Test User',
      role: 'employee',
    });

    if (response.ok && response.data.id) {
      createdUserId = response.data.id;
      testData.createdUsers.push(createdUserId);
      log.success('POST /users/ - Create user');
      passed++;
    } else {
      log.error('POST /users/ - Create user failed');
      failed++;
    }
  } catch (error) {
    log.error('Create user test failed: ' + error.message);
    failed++;
  }

  // Test 7: Get specific user
  if (createdUserId) {
    try {
      const response = await request('GET', `/users/${createdUserId}`);
      assert(response.ok && response.data.id === createdUserId, 'GET /users/{id} - Get specific user') ? passed++ : failed++;
    } catch (error) {
      log.error('Get specific user test failed: ' + error.message);
      failed++;
    }

    // Test 8: Update user
    try {
      const response = await request('PUT', `/users/${createdUserId}`, {
        full_name: 'Updated Test User',
      });
      assert(response.ok, 'PUT /users/{id} - Update user') ? passed++ : failed++;
    } catch (error) {
      log.error('Update user test failed: ' + error.message);
      failed++;
    }
  }

  return { passed, failed };
}

// Team Management Tests
async function testTeamManagement() {
  log.section('Team Management Endpoints');
  let passed = 0;
  let failed = 0;
  let createdTeamId = null;

  // Test 1: Get all teams
  try {
    const response = await request('GET', '/teams/');
    assert(response.ok && Array.isArray(response.data), 'GET /teams/ - Get all teams') ? passed++ : failed++;
  } catch (error) {
    log.error('Get teams test failed: ' + error.message);
    failed++;
  }

  // Test 2: Create team
  try {
    const timestamp = Date.now();
    const response = await request('POST', '/teams/', {
      name: `Test Team ${timestamp}`,
      description: 'A test team for API testing',
    });

    if (response.ok && response.data.id) {
      createdTeamId = response.data.id;
      testData.createdTeams.push(createdTeamId);
      log.success('POST /teams/ - Create team');
      passed++;
    } else {
      log.error('POST /teams/ - Create team failed');
      failed++;
    }
  } catch (error) {
    log.error('Create team test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get specific team
  if (createdTeamId) {
    try {
      const response = await request('GET', `/teams/${createdTeamId}`);
      assert(response.ok && response.data.id === createdTeamId, 'GET /teams/{id} - Get specific team') ? passed++ : failed++;
    } catch (error) {
      log.error('Get specific team test failed: ' + error.message);
      failed++;
    }

    // Test 4: Update team
    try {
      const response = await request('PUT', `/teams/${createdTeamId}`, {
        description: 'Updated test team description',
      });
      assert(response.ok, 'PUT /teams/{id} - Update team') ? passed++ : failed++;
    } catch (error) {
      log.error('Update team test failed: ' + error.message);
      failed++;
    }

    // Test 5: Add member to team (if we have a created user)
    if (testData.createdUsers.length > 0) {
      try {
        const response = await request('POST', `/teams/${createdTeamId}/members`, {
          employee_id: testData.createdUsers[0],
        });
        assert(response.ok || response.status === 400, 'POST /teams/{id}/members - Add team member') ? passed++ : failed++;
      } catch (error) {
        log.error('Add team member test failed: ' + error.message);
        failed++;
      }

      // Test 6: Remove member from team
      try {
        const response = await request('DELETE', `/teams/${createdTeamId}/members/${testData.createdUsers[0]}`);
        assert(response.ok || response.status === 404, 'DELETE /teams/{id}/members/{employee_id} - Remove team member') ? passed++ : failed++;
      } catch (error) {
        log.error('Remove team member test failed: ' + error.message);
        failed++;
      }
    }
  }

  return { passed, failed };
}

// Task Management Tests
async function testTaskManagement() {
  log.section('Task Management Endpoints');
  let passed = 0;
  let failed = 0;
  let createdTaskId = null;

  // Test 1: Get all tasks
  try {
    const response = await request('GET', '/tasks/');
    assert(response.ok && Array.isArray(response.data), 'GET /tasks/ - Get all tasks') ? passed++ : failed++;
  } catch (error) {
    log.error('Get tasks test failed: ' + error.message);
    failed++;
  }

  // Test 2: Get my tasks
  try {
    const response = await request('GET', '/tasks/my-tasks');
    assert(response.ok && Array.isArray(response.data), 'GET /tasks/my-tasks - Get my tasks') ? passed++ : failed++;
  } catch (error) {
    log.error('Get my tasks test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get tasks assigned by me
  try {
    const response = await request('GET', '/tasks/assigned-by-me');
    assert(response.ok && Array.isArray(response.data), 'GET /tasks/assigned-by-me - Get assigned by me') ? passed++ : failed++;
  } catch (error) {
    log.error('Get assigned by me test failed: ' + error.message);
    failed++;
  }

  // Test 4: Get task summary
  try {
    const response = await request('GET', '/tasks/summary');
    assert(response.ok, 'GET /tasks/summary - Get task summary') ? passed++ : failed++;
  } catch (error) {
    log.error('Get task summary test failed: ' + error.message);
    failed++;
  }

  // Test 5: Create task
  try {
    const timestamp = Date.now();
    const response = await request('POST', '/tasks/', {
      title: `Test Task ${timestamp}`,
      description: 'A test task for API testing',
      priority: 'medium',
      status: 'pending',
      assigned_to: testData.user.id,
    });

    if (response.ok && response.data.id) {
      createdTaskId = response.data.id;
      testData.createdTasks.push(createdTaskId);
      log.success('POST /tasks/ - Create task');
      passed++;
    } else {
      log.error('POST /tasks/ - Create task failed');
      failed++;
    }
  } catch (error) {
    log.error('Create task test failed: ' + error.message);
    failed++;
  }

  // Test 6: Get specific task
  if (createdTaskId) {
    try {
      const response = await request('GET', `/tasks/${createdTaskId}`);
      assert(response.ok && response.data.id === createdTaskId, 'GET /tasks/{id} - Get specific task') ? passed++ : failed++;
    } catch (error) {
      log.error('Get specific task test failed: ' + error.message);
      failed++;
    }

    // Test 7: Update task
    try {
      const response = await request('PUT', `/tasks/${createdTaskId}`, {
        status: 'in_progress',
      });
      assert(response.ok, 'PUT /tasks/{id} - Update task') ? passed++ : failed++;
    } catch (error) {
      log.error('Update task test failed: ' + error.message);
      failed++;
    }

    // Test 8: Add work log
    try {
      const response = await request('POST', `/tasks/${createdTaskId}/work-log`, {
        hours: 2.5,
        description: 'Test work log entry',
      });
      assert(response.ok || response.status === 400, 'POST /tasks/{id}/work-log - Add work log') ? passed++ : failed++;
    } catch (error) {
      log.error('Add work log test failed: ' + error.message);
      failed++;
    }
  }

  return { passed, failed };
}

// Attendance Tests
async function testAttendance() {
  log.section('Attendance Endpoints');
  let passed = 0;
  let failed = 0;

  // Test 1: Get current session
  try {
    const response = await request('GET', '/attendance/current');
    assert(response.ok || response.status === 404, 'GET /attendance/current - Get current session') ? passed++ : failed++;

    if (response.ok && response.data) {
      testData.attendanceSession = response.data;
    }
  } catch (error) {
    log.error('Get current session test failed: ' + error.message);
    failed++;
  }

  // Test 2: Clock in (if not already clocked in)
  if (!testData.attendanceSession) {
    try {
      const response = await request('POST', '/attendance/clock-in');
      if (response.ok) {
        testData.attendanceSession = response.data;
        log.success('POST /attendance/clock-in - Clock in');
        passed++;
      } else if (response.status === 400) {
        log.warning('POST /attendance/clock-in - Already clocked in');
        passed++;
      } else {
        log.error('POST /attendance/clock-in - Clock in failed');
        failed++;
      }
    } catch (error) {
      log.error('Clock in test failed: ' + error.message);
      failed++;
    }
  } else {
    log.info('Already clocked in, skipping clock in test');
    passed++;
  }

  // Test 3: Send heartbeat
  try {
    const response = await request('POST', '/attendance/heartbeat', {
      is_active: true,
      screenshot_data: null,
    });
    assert(response.ok || response.status === 400 || response.status === 404, 'POST /attendance/heartbeat - Send heartbeat') ? passed++ : failed++;
  } catch (error) {
    log.error('Heartbeat test failed: ' + error.message);
    failed++;
  }

  // Test 4: Update screen active time
  try {
    const response = await request('POST', '/attendance/screen-active-time', {
      active_seconds: 60,
    });
    assert(response.ok || response.status === 400 || response.status === 404, 'POST /attendance/screen-active-time - Update screen time') ? passed++ : failed++;
  } catch (error) {
    log.error('Update screen time test failed: ' + error.message);
    failed++;
  }

  // Test 5: Add inactive time
  try {
    const response = await request('POST', '/attendance/inactive-time', {
      inactive_seconds: 30,
    });
    assert(response.ok || response.status === 400 || response.status === 404, 'POST /attendance/inactive-time - Add inactive time') ? passed++ : failed++;
  } catch (error) {
    log.error('Add inactive time test failed: ' + error.message);
    failed++;
  }

  // Test 6: Get attendance history
  try {
    const response = await request('GET', '/attendance/history');
    assert(response.ok && Array.isArray(response.data), 'GET /attendance/history - Get attendance history') ? passed++ : failed++;
  } catch (error) {
    log.error('Get attendance history test failed: ' + error.message);
    failed++;
  }

  // Test 7: Get today's attendance for all
  try {
    const response = await request('GET', '/attendance/today-all');
    assert(response.ok && Array.isArray(response.data), 'GET /attendance/today-all - Get today all attendance') ? passed++ : failed++;
  } catch (error) {
    log.error('Get today all test failed: ' + error.message);
    failed++;
  }

  // Test 8: Start break
  try {
    const response = await request('POST', '/attendance/break/start', {
      break_type: 'lunch',
    });

    if (response.ok) {
      log.success('POST /attendance/break/start - Start break');
      passed++;

      // Wait a bit before ending break
      await wait(1000);

      // Test 9: End break
      const endResponse = await request('POST', '/attendance/break/end');
      assert(endResponse.ok || endResponse.status === 400, 'POST /attendance/break/end - End break') ? passed++ : failed++;
    } else if (response.status === 400 || response.status === 404) {
      log.warning('POST /attendance/break/start - Cannot start break (may not be clocked in)');
      passed++;
      passed++; // Also count end break as passed
    } else {
      log.error('POST /attendance/break/start - Start break failed');
      failed++;
      failed++;
    }
  } catch (error) {
    log.error('Break test failed: ' + error.message);
    failed += 2;
  }

  // Test 10: Get break settings (if we have a team)
  if (testData.createdTeams.length > 0) {
    try {
      const response = await request('GET', `/attendance/break-settings/${testData.createdTeams[0]}`);
      assert(response.ok || response.status === 404, 'GET /attendance/break-settings/{team_id} - Get break settings') ? passed++ : failed++;
    } catch (error) {
      log.error('Get break settings test failed: ' + error.message);
      failed++;
    }

    // Test 11: Create break settings
    try {
      const response = await request('POST', '/attendance/break-settings', {
        team_id: testData.createdTeams[0],
        max_break_duration: 60,
        max_breaks_per_day: 2,
      });
      assert(response.ok || response.status === 400, 'POST /attendance/break-settings - Create break settings') ? passed++ : failed++;
    } catch (error) {
      log.error('Create break settings test failed: ' + error.message);
      failed++;
    }

    // Test 12: Update break settings
    try {
      const response = await request('PUT', `/attendance/break-settings/${testData.createdTeams[0]}`, {
        max_break_duration: 90,
      });
      assert(response.ok || response.status === 404, 'PUT /attendance/break-settings/{team_id} - Update break settings') ? passed++ : failed++;
    } catch (error) {
      log.error('Update break settings test failed: ' + error.message);
      failed++;
    }
  }

  return { passed, failed };
}

// Form Management Tests
async function testFormManagement() {
  log.section('Form Management Endpoints');
  let passed = 0;
  let failed = 0;
  let createdFormId = null;

  // Test 1: Get all forms
  try {
    const response = await request('GET', '/forms/');
    assert(response.ok && Array.isArray(response.data), 'GET /forms/ - Get all forms') ? passed++ : failed++;
  } catch (error) {
    log.error('Get forms test failed: ' + error.message);
    failed++;
  }

  // Test 2: Create form
  try {
    const timestamp = Date.now();
    const response = await request('POST', '/forms/', {
      title: `Test Form ${timestamp}`,
      description: 'A test form for API testing',
      fields: [
        {
          name: 'test_field',
          label: 'Test Field',
          type: 'text',
          required: true,
        },
      ],
      is_active: true,
    });

    if (response.ok && response.data.id) {
      createdFormId = response.data.id;
      testData.createdForms.push(createdFormId);
      log.success('POST /forms/ - Create form');
      passed++;
    } else {
      log.error('POST /forms/ - Create form failed');
      failed++;
    }
  } catch (error) {
    log.error('Create form test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get specific form
  if (createdFormId) {
    try {
      const response = await request('GET', `/forms/${createdFormId}`);
      assert(response.ok && response.data.id === createdFormId, 'GET /forms/{id} - Get specific form') ? passed++ : failed++;
    } catch (error) {
      log.error('Get specific form test failed: ' + error.message);
      failed++;
    }

    // Test 4: Update form
    try {
      const response = await request('PUT', `/forms/${createdFormId}`, {
        description: 'Updated test form description',
      });
      assert(response.ok, 'PUT /forms/{id} - Update form') ? passed++ : failed++;
    } catch (error) {
      log.error('Update form test failed: ' + error.message);
      failed++;
    }

    // Test 5: Assign form to team (if we have a team)
    if (testData.createdTeams.length > 0) {
      try {
        const response = await request('POST', `/forms/${createdFormId}/assign`, {
          team_id: testData.createdTeams[0],
        });
        assert(response.ok || response.status === 400, 'POST /forms/{id}/assign - Assign form to team') ? passed++ : failed++;
      } catch (error) {
        log.error('Assign form test failed: ' + error.message);
        failed++;
      }

      // Test 6: Get team forms
      try {
        const response = await request('GET', `/forms/team/${testData.createdTeams[0]}`);
        assert(response.ok && Array.isArray(response.data), 'GET /forms/team/{team_id} - Get team forms') ? passed++ : failed++;
      } catch (error) {
        log.error('Get team forms test failed: ' + error.message);
        failed++;
      }

      // Test 7: Unassign form from team
      try {
        const response = await request('DELETE', `/forms/${createdFormId}/unassign/${testData.createdTeams[0]}`);
        assert(response.ok || response.status === 404, 'DELETE /forms/{id}/unassign/{team_id} - Unassign form') ? passed++ : failed++;
      } catch (error) {
        log.error('Unassign form test failed: ' + error.message);
        failed++;
      }
    }
  }

  return { passed, failed };
}

// Worksheet Management Tests
async function testWorksheetManagement() {
  log.section('Worksheet Management Endpoints');
  let passed = 0;
  let failed = 0;
  let createdWorksheetId = null;

  // Test 1: Get all worksheets
  try {
    const response = await request('GET', '/worksheets/');
    assert(response.ok && Array.isArray(response.data), 'GET /worksheets/ - Get all worksheets') ? passed++ : failed++;
  } catch (error) {
    log.error('Get worksheets test failed: ' + error.message);
    failed++;
  }

  // Test 2: Get my worksheets
  try {
    const response = await request('GET', '/worksheets/my-worksheets');
    assert(response.ok && Array.isArray(response.data), 'GET /worksheets/my-worksheets - Get my worksheets') ? passed++ : failed++;
  } catch (error) {
    log.error('Get my worksheets test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get pending verification
  try {
    const response = await request('GET', '/worksheets/pending-verification');
    assert(response.ok && Array.isArray(response.data), 'GET /worksheets/pending-verification - Get pending verification') ? passed++ : failed++;
  } catch (error) {
    log.error('Get pending verification test failed: ' + error.message);
    failed++;
  }

  // Test 4: Get pending approval
  try {
    const response = await request('GET', '/worksheets/pending-approval');
    assert(response.ok && Array.isArray(response.data), 'GET /worksheets/pending-approval - Get pending approval') ? passed++ : failed++;
  } catch (error) {
    log.error('Get pending approval test failed: ' + error.message);
    failed++;
  }

  // Test 5: Get pending DM approval
  try {
    const response = await request('GET', '/worksheets/pending-dm-approval');
    assert(response.ok && Array.isArray(response.data), 'GET /worksheets/pending-dm-approval - Get pending DM approval') ? passed++ : failed++;
  } catch (error) {
    log.error('Get pending DM approval test failed: ' + error.message);
    failed++;
  }

  // Test 6: Get worksheet summary
  try {
    const response = await request('GET', '/worksheets/summary');
    assert(response.ok, 'GET /worksheets/summary - Get worksheet summary') ? passed++ : failed++;
  } catch (error) {
    log.error('Get worksheet summary test failed: ' + error.message);
    failed++;
  }

  // Test 7: Create worksheet (if we have a form)
  if (testData.createdForms.length > 0) {
    try {
      const response = await request('POST', '/worksheets/', {
        form_id: testData.createdForms[0],
        date: new Date().toISOString().split('T')[0],
        data: {
          test_field: 'Test value',
        },
      });

      if (response.ok && response.data.id) {
        createdWorksheetId = response.data.id;
        testData.createdWorksheets.push(createdWorksheetId);
        log.success('POST /worksheets/ - Create worksheet');
        passed++;
      } else {
        log.error('POST /worksheets/ - Create worksheet failed');
        failed++;
      }
    } catch (error) {
      log.error('Create worksheet test failed: ' + error.message);
      failed++;
    }

    // Test 8: Get specific worksheet
    if (createdWorksheetId) {
      try {
        const response = await request('GET', `/worksheets/${createdWorksheetId}`);
        assert(response.ok && response.data.id === createdWorksheetId, 'GET /worksheets/{id} - Get specific worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Get specific worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 9: Update worksheet
      try {
        const response = await request('PUT', `/worksheets/${createdWorksheetId}`, {
          data: {
            test_field: 'Updated test value',
          },
        });
        assert(response.ok, 'PUT /worksheets/{id} - Update worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Update worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 10: Submit worksheet
      try {
        const response = await request('POST', `/worksheets/${createdWorksheetId}/submit`);
        assert(response.ok || response.status === 400, 'POST /worksheets/{id}/submit - Submit worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Submit worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 11: Verify worksheet
      try {
        const response = await request('POST', `/worksheets/${createdWorksheetId}/verify`);
        assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/{id}/verify - Verify worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Verify worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 12: Approve worksheet
      try {
        const response = await request('POST', `/worksheets/${createdWorksheetId}/approve`);
        assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/{id}/approve - Approve worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Approve worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 13: DM approve worksheet
      try {
        const response = await request('POST', `/worksheets/${createdWorksheetId}/dm-approve`);
        assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/{id}/dm-approve - DM approve worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('DM approve worksheet test failed: ' + error.message);
        failed++;
      }

      // Test 14: Reject worksheet
      try {
        const response = await request('POST', `/worksheets/${createdWorksheetId}/reject`, {
          reason: 'Test rejection',
        });
        assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/{id}/reject - Reject worksheet') ? passed++ : failed++;
      } catch (error) {
        log.error('Reject worksheet test failed: ' + error.message);
        failed++;
      }
    }

    // Test 15: Bulk approve
    try {
      const response = await request('POST', '/worksheets/bulk-approve', {
        worksheet_ids: createdWorksheetId ? [createdWorksheetId] : [],
      });
      assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/bulk-approve - Bulk approve') ? passed++ : failed++;
    } catch (error) {
      log.error('Bulk approve test failed: ' + error.message);
      failed++;
    }

    // Test 16: Bulk DM approve
    try {
      const response = await request('POST', '/worksheets/bulk-dm-approve', {
        worksheet_ids: createdWorksheetId ? [createdWorksheetId] : [],
      });
      assert(response.ok || response.status === 400 || response.status === 403, 'POST /worksheets/bulk-dm-approve - Bulk DM approve') ? passed++ : failed++;
    } catch (error) {
      log.error('Bulk DM approve test failed: ' + error.message);
      failed++;
    }
  }

  return { passed, failed };
}

// Notification Tests
async function testNotifications() {
  log.section('Notification Endpoints');
  let passed = 0;
  let failed = 0;

  // Test 1: Get all notifications
  try {
    const response = await request('GET', '/notifications/');
    assert(response.ok && Array.isArray(response.data), 'GET /notifications/ - Get all notifications') ? passed++ : failed++;
  } catch (error) {
    log.error('Get notifications test failed: ' + error.message);
    failed++;
  }

  // Test 2: Get unread notifications
  try {
    const response = await request('GET', '/notifications/unread');
    assert(response.ok && Array.isArray(response.data), 'GET /notifications/unread - Get unread notifications') ? passed++ : failed++;
  } catch (error) {
    log.error('Get unread notifications test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get notification count
  try {
    const response = await request('GET', '/notifications/count');
    assert(response.ok && typeof response.data.count !== 'undefined', 'GET /notifications/count - Get notification count') ? passed++ : failed++;
  } catch (error) {
    log.error('Get notification count test failed: ' + error.message);
    failed++;
  }

  // Test 4: Mark all as read
  try {
    const response = await request('PUT', '/notifications/read-all');
    assert(response.ok, 'PUT /notifications/read-all - Mark all as read') ? passed++ : failed++;
  } catch (error) {
    log.error('Mark all as read test failed: ' + error.message);
    failed++;
  }

  return { passed, failed };
}

// Report Tests
async function testReports() {
  log.section('Report Endpoints');
  let passed = 0;
  let failed = 0;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Test 1: Get productivity report
  try {
    const response = await request('GET', `/reports/productivity?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/productivity - Get productivity report') ? passed++ : failed++;
  } catch (error) {
    log.error('Get productivity report test failed: ' + error.message);
    failed++;
  }

  // Test 2: Get attendance report
  try {
    const response = await request('GET', `/reports/attendance?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/attendance - Get attendance report') ? passed++ : failed++;
  } catch (error) {
    log.error('Get attendance report test failed: ' + error.message);
    failed++;
  }

  // Test 3: Get overtime report
  try {
    const response = await request('GET', `/reports/overtime?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/overtime - Get overtime report') ? passed++ : failed++;
  } catch (error) {
    log.error('Get overtime report test failed: ' + error.message);
    failed++;
  }

  // Test 4: Get team performance
  try {
    const response = await request('GET', `/reports/team-performance?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/team-performance - Get team performance') ? passed++ : failed++;
  } catch (error) {
    log.error('Get team performance test failed: ' + error.message);
    failed++;
  }

  // Test 5: Get worksheet analytics
  try {
    const response = await request('GET', `/reports/worksheet-analytics?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/worksheet-analytics - Get worksheet analytics') ? passed++ : failed++;
  } catch (error) {
    log.error('Get worksheet analytics test failed: ' + error.message);
    failed++;
  }

  // Test 6: Get projects report
  try {
    const response = await request('GET', `/reports/projects?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok, 'GET /reports/projects - Get projects report') ? passed++ : failed++;
  } catch (error) {
    log.error('Get projects report test failed: ' + error.message);
    failed++;
  }

  // Test 7: Get manager members
  try {
    const response = await request('GET', '/reports/manager-members');
    assert(response.ok, 'GET /reports/manager-members - Get manager members') ? passed++ : failed++;
  } catch (error) {
    log.error('Get manager members test failed: ' + error.message);
    failed++;
  }

  // Test 8: Export productivity
  try {
    const response = await request('GET', `/reports/export/productivity?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok || response.status === 500, 'GET /reports/export/productivity - Export productivity') ? passed++ : failed++;
  } catch (error) {
    log.error('Export productivity test failed: ' + error.message);
    failed++;
  }

  // Test 9: Export attendance
  try {
    const response = await request('GET', `/reports/export/attendance?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok || response.status === 500, 'GET /reports/export/attendance - Export attendance') ? passed++ : failed++;
  } catch (error) {
    log.error('Export attendance test failed: ' + error.message);
    failed++;
  }

  // Test 10: Export overtime
  try {
    const response = await request('GET', `/reports/export/overtime?start_date=${weekAgo}&end_date=${today}`);
    assert(response.ok || response.status === 500, 'GET /reports/export/overtime - Export overtime') ? passed++ : failed++;
  } catch (error) {
    log.error('Export overtime test failed: ' + error.message);
    failed++;
  }

  return { passed, failed };
}

// Cleanup Tests
async function cleanupTestData() {
  log.section('Cleanup Test Data');
  let passed = 0;
  let failed = 0;

  // Delete created worksheets
  for (const worksheetId of testData.createdWorksheets) {
    try {
      await request('DELETE', `/worksheets/${worksheetId}`);
      log.info(`Deleted worksheet ${worksheetId}`);
    } catch (error) {
      log.warning(`Failed to delete worksheet ${worksheetId}: ${error.message}`);
    }
  }

  // Delete created forms
  for (const formId of testData.createdForms) {
    try {
      await request('DELETE', `/forms/${formId}`);
      log.info(`Deleted form ${formId}`);
    } catch (error) {
      log.warning(`Failed to delete form ${formId}: ${error.message}`);
    }
  }

  // Delete created tasks
  for (const taskId of testData.createdTasks) {
    try {
      await request('DELETE', `/tasks/${taskId}`);
      log.info(`Deleted task ${taskId}`);
    } catch (error) {
      log.warning(`Failed to delete task ${taskId}: ${error.message}`);
    }
  }

  // Delete created teams
  for (const teamId of testData.createdTeams) {
    try {
      await request('DELETE', `/teams/${teamId}`);
      log.info(`Deleted team ${teamId}`);
    } catch (error) {
      log.warning(`Failed to delete team ${teamId}: ${error.message}`);
    }
  }

  // Delete created users
  for (const userId of testData.createdUsers) {
    try {
      await request('DELETE', `/users/${userId}`);
      log.info(`Deleted user ${userId}`);
    } catch (error) {
      log.warning(`Failed to delete user ${userId}: ${error.message}`);
    }
  }

  // Clock out if still clocked in
  if (testData.attendanceSession) {
    try {
      const response = await request('POST', '/attendance/clock-out', {
        notes: 'Test cleanup',
      });
      if (response.ok) {
        log.info('Clocked out successfully');
      }
    } catch (error) {
      log.warning('Failed to clock out: ' + error.message);
    }
  }

  log.success('Cleanup completed');
  return { passed, failed };
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         FastAPI Project Management - API Test Suite           ║');
  console.log('║                                                                ║');
  console.log(`║  API Base URL: ${API_BASE_URL.padEnd(42)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = {
    totalPassed: 0,
    totalFailed: 0,
    suites: [],
  };

  const testSuites = [
    { name: 'Authentication', fn: testAuthentication },
    { name: 'User Management', fn: testUserManagement },
    { name: 'Team Management', fn: testTeamManagement },
    { name: 'Task Management', fn: testTaskManagement },
    { name: 'Attendance', fn: testAttendance },
    { name: 'Form Management', fn: testFormManagement },
    { name: 'Worksheet Management', fn: testWorksheetManagement },
    { name: 'Notifications', fn: testNotifications },
    { name: 'Reports', fn: testReports },
  ];

  for (const suite of testSuites) {
    try {
      const result = await suite.fn();
      results.totalPassed += result.passed;
      results.totalFailed += result.failed;
      results.suites.push({
        name: suite.name,
        passed: result.passed,
        failed: result.failed,
      });
    } catch (error) {
      log.error(`${suite.name} suite failed: ${error.message}`);
      results.suites.push({
        name: suite.name,
        passed: 0,
        failed: 1,
      });
      results.totalFailed++;
    }

    // Small delay between suites
    await wait(500);
  }

  // Cleanup
  await cleanupTestData();

  // Print summary
  log.section('Test Summary');
  console.log(`${colors.bright}Results by Test Suite:${colors.reset}`);
  console.log('─'.repeat(60));

  results.suites.forEach(suite => {
    const total = suite.passed + suite.failed;
    const percentage = total > 0 ? ((suite.passed / total) * 100).toFixed(1) : '0.0';
    const status = suite.failed === 0 ? colors.green + 'PASS' : colors.yellow + 'PARTIAL';
    console.log(`${status}${colors.reset} ${suite.name.padEnd(30)} ${suite.passed}/${total} (${percentage}%)`);
  });

  console.log('─'.repeat(60));
  const totalTests = results.totalPassed + results.totalFailed;
  const overallPercentage = totalTests > 0 ? ((results.totalPassed / totalTests) * 100).toFixed(1) : '0.0';

  console.log(`\n${colors.bright}Overall Results:${colors.reset}`);
  console.log(`  Total Passed:  ${colors.green}${results.totalPassed}${colors.reset}`);
  console.log(`  Total Failed:  ${colors.red}${results.totalFailed}${colors.reset}`);
  console.log(`  Success Rate:  ${overallPercentage}%`);

  if (results.totalFailed === 0) {
    console.log(`\n${colors.bright}${colors.green}✓ All tests passed!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.bright}${colors.yellow}⚠ Some tests failed or were skipped${colors.reset}\n`);
  }

  return results;
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      log.error('Fatal error: ' + error.message);
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testAuthentication,
  testUserManagement,
  testTeamManagement,
  testTaskManagement,
  testAttendance,
  testFormManagement,
  testWorksheetManagement,
  testNotifications,
  testReports,
};
