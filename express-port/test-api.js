const http = require('http');

const BASE_URL = 'http://localhost:8000';

// Test credentials provided by user
const CREDENTIALS = {
  user: { employee_id: 'JSAN313', password: 'JSAN313@456' },
  admin: { employee_id: 'JSAN252', password: 'JSAN252@456' },
  manager: { employee_id: 'JSAN261', password: 'JSAN261@456' },
  teamLead: { employee_id: 'JSAN267', password: 'JSAN267@456' }
};

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  failures: []
};

let tokens = {};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = {
            status: res.statusCode,
            headers: res.headers,
            data: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test assertion helper
function assert(condition, testName, errorMessage = '') {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    console.log(`✓ ${testName}`);
  } else {
    testResults.failed++;
    testResults.failures.push({ testName, errorMessage });
    console.log(`✗ ${testName}: ${errorMessage}`);
  }
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await makeRequest('GET', '/health');
      if (res.status === 200) {
        console.log('✓ Server is ready\n');
        return true;
      }
    } catch (error) {
      console.log(`Waiting for server... (attempt ${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Server did not start in time');
}

// ==================== TEST SUITES ====================

async function testHealthCheck() {
  console.log('\n=== Testing Health Check ===');

  const res = await makeRequest('GET', '/health');
  assert(res.status === 200, 'GET /health returns 200');
  assert(res.data && res.data.status === 'healthy', 'Health check returns correct status');

  const rootRes = await makeRequest('GET', '/');
  assert(rootRes.status === 200, 'GET / returns 200');
  assert(rootRes.data && rootRes.data.message, 'Root endpoint returns message');
}

async function testAuthentication() {
  console.log('\n=== Testing Authentication ===');

  // Test login with User (Associate)
  const userLoginRes = await makeRequest('POST', '/auth/login', CREDENTIALS.user);
  assert(userLoginRes.status === 200, 'User login successful');
  assert(userLoginRes.data && userLoginRes.data.access_token, 'User receives access token');
  if (userLoginRes.data && userLoginRes.data.access_token) {
    tokens.user = userLoginRes.data.access_token;
  }

  // Test login with Admin
  const adminLoginRes = await makeRequest('POST', '/auth/login', CREDENTIALS.admin);
  assert(adminLoginRes.status === 200, 'Admin login successful');
  assert(adminLoginRes.data && adminLoginRes.data.access_token, 'Admin receives access token');
  if (adminLoginRes.data && adminLoginRes.data.access_token) {
    tokens.admin = adminLoginRes.data.access_token;
  }

  // Test login with Manager
  const managerLoginRes = await makeRequest('POST', '/auth/login', CREDENTIALS.manager);
  assert(managerLoginRes.status === 200, 'Manager login successful');
  assert(managerLoginRes.data && managerLoginRes.data.access_token, 'Manager receives access token');
  if (managerLoginRes.data && managerLoginRes.data.access_token) {
    tokens.manager = managerLoginRes.data.access_token;
  }

  // Test login with Team Lead
  const teamLeadLoginRes = await makeRequest('POST', '/auth/login', CREDENTIALS.teamLead);
  assert(teamLeadLoginRes.status === 200, 'Team Lead login successful');
  assert(teamLeadLoginRes.data && teamLeadLoginRes.data.access_token, 'Team Lead receives access token');
  if (teamLeadLoginRes.data && teamLeadLoginRes.data.access_token) {
    tokens.teamLead = teamLeadLoginRes.data.access_token;
  }

  // Test invalid credentials
  const invalidLoginRes = await makeRequest('POST', '/auth/login', {
    employee_id: 'INVALID',
    password: 'WRONG'
  });
  assert(invalidLoginRes.status === 401, 'Invalid credentials return 401');

  // Test /auth/me endpoint
  if (tokens.user) {
    const meRes = await makeRequest('GET', '/auth/me', null, tokens.user);
    assert(meRes.status === 200, 'GET /auth/me returns 200');
    assert(meRes.data && meRes.data.employee_id === CREDENTIALS.user.employee_id, '/auth/me returns correct user data');
  }

  // Test authentication without token
  const noAuthRes = await makeRequest('GET', '/auth/me');
  assert(noAuthRes.status === 401, 'Request without token returns 401');
}

async function testUserManagement() {
  console.log('\n=== Testing User Management ===');

  if (!tokens.admin) {
    console.log('Skipping user management tests (no admin token)');
    return;
  }

  // Get all users as admin
  const usersRes = await makeRequest('GET', '/users', null, tokens.admin);
  assert(usersRes.status === 200, 'Admin can get all users');
  assert(Array.isArray(usersRes.data), 'Users endpoint returns array');

  // Get managers
  const managersRes = await makeRequest('GET', '/users/managers', null, tokens.admin);
  assert(managersRes.status === 200, 'Admin can get managers');
  assert(Array.isArray(managersRes.data), 'Managers endpoint returns array');

  // Get team leads
  const teamLeadsRes = await makeRequest('GET', '/users/team-leads', null, tokens.admin);
  assert(teamLeadsRes.status === 200, 'Admin can get team leads');

  // Get employees
  const employeesRes = await makeRequest('GET', '/users/employees', null, tokens.admin);
  assert(employeesRes.status === 200, 'Admin can get employees');

  // Get dashboard users
  const dashboardRes = await makeRequest('GET', '/users/all-for-dashboard', null, tokens.admin);
  assert(dashboardRes.status === 200, 'Admin can get dashboard users');

  // Test role-based access - User should only see themselves
  if (tokens.user) {
    const userUsersRes = await makeRequest('GET', '/users', null, tokens.user);
    assert(userUsersRes.status === 200, 'User can access users endpoint');
    assert(Array.isArray(userUsersRes.data) && userUsersRes.data.length >= 1, 'User sees at least themselves');
  }
}

async function testTeamManagement() {
  console.log('\n=== Testing Team Management ===');

  if (!tokens.manager && !tokens.admin) {
    console.log('Skipping team management tests (no manager/admin token)');
    return;
  }

  const token = tokens.manager || tokens.admin;

  // Get all teams
  const teamsRes = await makeRequest('GET', '/teams', null, token);
  assert(teamsRes.status === 200, 'Can get teams');
  assert(Array.isArray(teamsRes.data), 'Teams endpoint returns array');

  // Get specific team if teams exist
  if (teamsRes.data && teamsRes.data.length > 0) {
    const teamId = teamsRes.data[0].id;
    const teamRes = await makeRequest('GET', `/teams/${teamId}`, null, token);
    assert(teamRes.status === 200 || teamRes.status === 403, 'Can attempt to get specific team');
  }
}

async function testTaskManagement() {
  console.log('\n=== Testing Task Management ===');

  if (!tokens.user) {
    console.log('Skipping task management tests (no user token)');
    return;
  }

  // Get all tasks
  const tasksRes = await makeRequest('GET', '/tasks', null, tokens.user);
  assert(tasksRes.status === 200, 'Can get tasks');
  assert(Array.isArray(tasksRes.data), 'Tasks endpoint returns array');

  // Get my tasks
  const myTasksRes = await makeRequest('GET', '/tasks/my-tasks', null, tokens.user);
  assert(myTasksRes.status === 200, 'Can get my tasks');
  assert(Array.isArray(myTasksRes.data), 'My tasks endpoint returns array');

  // Test task creation as team lead
  if (tokens.teamLead) {
    const assignedByMeRes = await makeRequest('GET', '/tasks/assigned-by-me', null, tokens.teamLead);
    assert(assignedByMeRes.status === 200, 'Team Lead can get assigned-by-me tasks');
  }
}

async function testAttendance() {
  console.log('\n=== Testing Attendance ===');

  if (!tokens.user) {
    console.log('Skipping attendance tests (no user token)');
    return;
  }

  // Get current session
  const currentRes = await makeRequest('GET', '/attendance/current', null, tokens.user);
  assert(currentRes.status === 200, 'Can get current attendance session');

  // Try to clock in (may already be clocked in)
  const clockInRes = await makeRequest('POST', '/attendance/clock-in', {}, tokens.user);
  assert([200, 400].includes(clockInRes.status), 'Clock in returns 200 or 400 (if already clocked in)');

  // If clocked in successfully, try to start a break
  if (clockInRes.status === 200) {
    const breakRes = await makeRequest('POST', '/attendance/break/start', {
      break_type: 'short',
      comment: 'Quick coffee break'
    }, tokens.user);
    assert([200, 400].includes(breakRes.status), 'Can start break or already on break');

    // Try to end break
    if (breakRes.status === 200) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      const endBreakRes = await makeRequest('POST', '/attendance/break/end', {}, tokens.user);
      assert([200, 400].includes(endBreakRes.status), 'Can end break');
    }
  }

  // Get attendance history
  const historyRes = await makeRequest('GET', '/attendance/history', null, tokens.user);
  assert(historyRes.status === 200, 'Can get attendance history');
  assert(Array.isArray(historyRes.data), 'Attendance history returns array');

  // Test today-all as manager/team lead
  if (tokens.manager || tokens.teamLead) {
    const token = tokens.manager || tokens.teamLead;
    const todayAllRes = await makeRequest('GET', '/attendance/today-all', null, token);
    assert(todayAllRes.status === 200, 'Manager/Team Lead can get today-all attendance');
  }
}

async function testForms() {
  console.log('\n=== Testing Forms ===');

  if (!tokens.user) {
    console.log('Skipping forms tests (no user token)');
    return;
  }

  // Get all forms
  const formsRes = await makeRequest('GET', '/forms', null, tokens.user);
  assert(formsRes.status === 200, 'Can get forms');
  assert(Array.isArray(formsRes.data), 'Forms endpoint returns array');
}

async function testWorksheets() {
  console.log('\n=== Testing Worksheets ===');

  if (!tokens.user) {
    console.log('Skipping worksheets tests (no user token)');
    return;
  }

  // Get all worksheets
  const worksheetsRes = await makeRequest('GET', '/worksheets', null, tokens.user);
  assert(worksheetsRes.status === 200, 'Can get worksheets');
  assert(Array.isArray(worksheetsRes.data), 'Worksheets endpoint returns array');

  // Test worksheet creation (may fail if already exists for today)
  const today = new Date().toISOString().split('T')[0];
  const createRes = await makeRequest('POST', '/worksheets', {
    date: today,
    form_id: null,
    form_responses: [],
    tasks_completed: ['Test task'],
    total_hours: 8,
    notes: 'API Test Worksheet'
  }, tokens.user);
  assert([200, 400].includes(createRes.status), 'Worksheet creation returns 200 or 400');

  // Test pending verification as Team Lead
  if (tokens.teamLead) {
    const pendingRes = await makeRequest('GET', '/worksheets?status=submitted', null, tokens.teamLead);
    assert(pendingRes.status === 200, 'Team Lead can get pending worksheets');
  }

  // Test pending approval as Manager
  if (tokens.manager) {
    const pendingRes = await makeRequest('GET', '/worksheets?status=tl_verified', null, tokens.manager);
    assert(pendingRes.status === 200, 'Manager can get pending approval worksheets');
  }
}

async function testNotifications() {
  console.log('\n=== Testing Notifications ===');

  if (!tokens.user) {
    console.log('Skipping notifications tests (no user token)');
    return;
  }

  // Get all notifications
  const notificationsRes = await makeRequest('GET', '/notifications', null, tokens.user);
  assert(notificationsRes.status === 200, 'Can get notifications');
  assert(Array.isArray(notificationsRes.data), 'Notifications endpoint returns array');

  // Get notification count (this endpoint may not exist in simplified version)
  // const countRes = await makeRequest('GET', '/notifications/count', null, tokens.user);
  // assert(countRes.status === 200, 'Can get notification count');
}

async function testReports() {
  console.log('\n=== Testing Reports ===');

  if (!tokens.manager && !tokens.admin) {
    console.log('Skipping reports tests (no manager/admin token)');
    return;
  }

  const token = tokens.manager || tokens.admin;

  // Test productivity report
  const productivityRes = await makeRequest('GET', '/reports/productivity', null, token);
  assert(productivityRes.status === 200, 'Can get productivity report');
  assert(productivityRes.data && productivityRes.data.report_type === 'productivity', 'Productivity report has correct type');
}

async function testRoleBasedAccess() {
  console.log('\n=== Testing Role-Based Access Control ===');

  // User should NOT be able to create other users
  if (tokens.user) {
    const createUserRes = await makeRequest('POST', '/users', {
      full_name: 'Test User',
      employee_id: 'TEST001',
      password: 'password123',
      role: 'employee'
    }, tokens.user);
    assert(createUserRes.status === 403, 'User cannot create other users');
  }

  // User should NOT be able to create teams
  if (tokens.user) {
    const createTeamRes = await makeRequest('POST', '/teams', {
      name: 'Test Team',
      team_lead_id: 'some_id',
      manager_id: 'some_id'
    }, tokens.user);
    assert(createTeamRes.status === 403, 'User cannot create teams');
  }

  // User should NOT access manager reports
  if (tokens.user) {
    const reportRes = await makeRequest('GET', '/reports/productivity', null, tokens.user);
    assert(reportRes.status === 403, 'User cannot access manager reports');
  }

  // Manager should be able to access their reports
  if (tokens.manager) {
    const reportRes = await makeRequest('GET', '/reports/productivity', null, tokens.manager);
    assert(reportRes.status === 200, 'Manager can access reports');
  }
}

async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');

  // Test invalid ObjectId format
  if (tokens.admin) {
    const invalidIdRes = await makeRequest('GET', '/users/invalid_id', null, tokens.admin);
    assert(invalidIdRes.status === 400, 'Invalid ObjectId returns 400');
  }

  // Test not found
  if (tokens.admin) {
    const notFoundRes = await makeRequest('GET', '/users/000000000000000000000000', null, tokens.admin);
    assert(notFoundRes.status === 404, 'Non-existent user returns 404');
  }

  // Test malformed JSON (hard to test with JSON.stringify, so skip)
  console.log('  (Skipping malformed JSON test)');
}

// ==================== RUN ALL TESTS ====================

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Associate Work Tracking System - Express API Tests ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await waitForServer();

    // Run test suites
    await testHealthCheck();
    await testAuthentication();
    await testUserManagement();
    await testTeamManagement();
    await testTaskManagement();
    await testAttendance();
    await testForms();
    await testWorksheets();
    await testNotifications();
    await testReports();
    await testRoleBasedAccess();
    await testErrorHandling();

    // Print results
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed} ✓`);
    console.log(`Failed: ${testResults.failed} ✗`);
    console.log(`Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);

    if (testResults.failures.length > 0) {
      console.log('\n╔═══════════════════════════════════════════════════════╗');
      console.log('║                      FAILURES                         ║');
      console.log('╚═══════════════════════════════════════════════════════╝');
      testResults.failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.testName}`);
        console.log(`   ${failure.errorMessage}\n`);
      });
    }

    console.log('\n✨ All tests completed!\n');

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();
