const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

let testResults = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'pass' ? '✓' : type === 'fail' ? '✗' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    log(`PASS: ${description}`, 'pass');
    testResults.push({ test: description, status: 'PASS' });
  } catch (error) {
    failedTests++;
    const errorMsg = error.response?.data?.detail || error.message;
    log(`FAIL: ${description} - ${errorMsg}`, 'fail');
    testResults.push({ test: description, status: 'FAIL', error: errorMsg });
  }
}

async function loginUser(employee_id, password) {
  const response = await axios.post(`${BASE_URL}/auth/login`, { employee_id, password });
  return response.data.access_token;
}

async function runEndToEndTests() {
  console.log('\n'.repeat(2));
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  END-TO-END WORKFLOW TEST - ALL SCREENS & TOOLS');
  console.log('  Simulating real user workflows for complete verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let adminToken, managerToken, teamLeadToken, userToken;
  let adminHeaders, managerHeaders, teamLeadHeaders, userHeaders;

  // ============================================================
  // AUTHENTICATION WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 1] AUTHENTICATION & PROFILE');
  console.log('─'.repeat(60));

  await test('Admin: Login → Get Profile → Verify Data', async () => {
    adminToken = await loginUser('JSAN252', 'JSAN252@456');
    adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: adminHeaders });
    if (!profile.data.employee_id || profile.data.role !== 'admin') {
      throw new Error('Profile data incorrect');
    }
  });

  await test('Manager: Login → Get Profile → Verify Data', async () => {
    managerToken = await loginUser('JSAN261', 'JSAN261@456');
    managerHeaders = { Authorization: `Bearer ${managerToken}` };
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: managerHeaders });
    if (!profile.data.employee_id || profile.data.role !== 'manager') {
      throw new Error('Profile data incorrect');
    }
  });

  await test('Team Lead: Login → Get Profile → Verify Data', async () => {
    teamLeadToken = await loginUser('JSAN267', 'JSAN267@456');
    teamLeadHeaders = { Authorization: `Bearer ${teamLeadToken}` };
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: teamLeadHeaders });
    if (!profile.data.employee_id || profile.data.role !== 'team_lead') {
      throw new Error('Profile data incorrect');
    }
  });

  await test('User: Login → Get Profile → Verify Data', async () => {
    userToken = await loginUser('JSAN313', 'JSAN313@456');
    userHeaders = { Authorization: `Bearer ${userToken}` };
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: userHeaders });
    if (!profile.data.employee_id || profile.data.role !== 'employee') {
      throw new Error('Profile data incorrect');
    }
  });

  // ============================================================
  // DASHBOARD SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 2] DASHBOARD SCREEN - ALL WIDGETS');
  console.log('─'.repeat(60));

  await test('Dashboard: Load Tasks Widget', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/my-tasks`, { headers: userHeaders });
    if (!Array.isArray(response.data)) throw new Error('Tasks not array');
  });

  await test('Dashboard: Load Worksheets Widget', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets/my-worksheets`, { headers: userHeaders });
    if (!Array.isArray(response.data)) throw new Error('Worksheets not array');
  });

  await test('Dashboard: Load Notifications Count', async () => {
    const response = await axios.get(`${BASE_URL}/notifications/count`, { headers: userHeaders });
    if (response.data.total === undefined || response.data.unread === undefined) {
      throw new Error('Notification count missing');
    }
  });

  // ============================================================
  // TASKS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 3] TASKS SCREEN - COMPLETE LIFECYCLE');
  console.log('─'.repeat(60));

  let createdTaskId;

  await test('Tasks Screen: View All Tasks', async () => {
    const response = await axios.get(`${BASE_URL}/tasks`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('Tasks not array');
  });

  await test('Tasks Screen: Create New Task', async () => {
    const response = await axios.post(`${BASE_URL}/tasks`, {
      title: 'E2E Test Task',
      description: 'Created by end-to-end test',
      assigned_to: '69305167d0a70009cca658f8',
      priority: 'high',
      status: 'pending',
      due_date: '2025-12-20'
    }, { headers: managerHeaders });
    if (!response.data.id) throw new Error('Task not created');
    createdTaskId = response.data.id;
  });

  await test('Tasks Screen: View Single Task Details', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
    if (response.data.title !== 'E2E Test Task') throw new Error('Task details incorrect');
  });

  await test('Tasks Screen: Update Task Status', async () => {
    await axios.put(`${BASE_URL}/tasks/${createdTaskId}`, {
      status: 'in_progress'
    }, { headers: managerHeaders });
    const response = await axios.get(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
    if (response.data.status !== 'in_progress') throw new Error('Task not updated');
  });

  await test('Tasks Screen: View Assigned Tasks (Manager)', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/assigned-by-me`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('Assigned tasks not array');
  });

  // ============================================================
  // ATTENDANCE SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 4] ATTENDANCE SCREEN - TIME TRACKING');
  console.log('─'.repeat(60));

  await test('Attendance Screen: View Current Session', async () => {
    const response = await axios.get(`${BASE_URL}/attendance/current`, { headers: userHeaders });
    // Can be null or an object
    if (response.data !== null && !response.data.id) {
      throw new Error('Invalid session data');
    }
  });

  await test('Attendance Screen: View Attendance History', async () => {
    const response = await axios.get(`${BASE_URL}/attendance/history`, { headers: userHeaders });
    if (!Array.isArray(response.data)) throw new Error('History not array');
  });

  await test('Attendance Screen: Manager View Team Attendance', async () => {
    const response = await axios.get(`${BASE_URL}/attendance/today`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('Team attendance not array');
  });

  // ============================================================
  // WORKSHEETS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 5] WORKSHEETS SCREEN - COMPLETE WORKFLOW');
  console.log('─'.repeat(60));

  await test('Worksheets Screen: View My Worksheets', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets/my-worksheets`, { headers: userHeaders });
    if (!Array.isArray(response.data)) throw new Error('Worksheets not array');
  });

  await test('Worksheets Screen: View All Worksheets (Manager)', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('All worksheets not array');
  });

  await test('Worksheets Screen: View Pending Verification (Team Lead)', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets/pending-verification`, { headers: teamLeadHeaders });
    if (!Array.isArray(response.data)) throw new Error('Pending verification not array');
  });

  await test('Worksheets Screen: View Pending Approval (Manager)', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets/pending-approval`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('Pending approval not array');
  });

  // ============================================================
  // TEAMS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 6] TEAMS SCREEN - ORGANIZATION');
  console.log('─'.repeat(60));

  await test('Teams Screen: View All Teams', async () => {
    const response = await axios.get(`${BASE_URL}/teams`, { headers: adminHeaders });
    if (!Array.isArray(response.data)) throw new Error('Teams not array');
  });

  await test('Teams Screen: View Single Team Details', async () => {
    const teams = await axios.get(`${BASE_URL}/teams`, { headers: adminHeaders });
    if (teams.data.length > 0) {
      const teamId = teams.data[0].id;
      const response = await axios.get(`${BASE_URL}/teams/${teamId}`, { headers: adminHeaders });
      if (!response.data.id) throw new Error('Team details missing');
    }
  });

  // ============================================================
  // MY TEAM SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 7] MY TEAM SCREEN - TEAM MANAGEMENT');
  console.log('─'.repeat(60));

  await test('My Team Screen: View Team Members (Team Lead)', async () => {
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: teamLeadHeaders });
    if (profile.data.team_id) {
      const response = await axios.get(`${BASE_URL}/users?team_id=${profile.data.team_id}`, { headers: teamLeadHeaders });
      if (!Array.isArray(response.data)) throw new Error('Team members not array');
    }
  });

  // ============================================================
  // REPORTS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 8] REPORTS SCREEN - ANALYTICS');
  console.log('─'.repeat(60));

  await test('Reports Screen: Generate Productivity Report', async () => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await axios.get(`${BASE_URL}/reports/productivity?start_date=${startDate}&end_date=${endDate}`, { headers: managerHeaders });
    if (!response.data.overview) throw new Error('Report data missing');
  });

  // ============================================================
  // USERS SCREEN WORKFLOW (Admin)
  // ============================================================
  console.log('\n[WORKFLOW 9] USERS SCREEN - USER MANAGEMENT');
  console.log('─'.repeat(60));

  await test('Users Screen: View All Users', async () => {
    const response = await axios.get(`${BASE_URL}/users`, { headers: adminHeaders });
    if (!Array.isArray(response.data)) throw new Error('Users not array');
  });

  await test('Users Screen: Filter Managers', async () => {
    const response = await axios.get(`${BASE_URL}/users/managers`, { headers: adminHeaders });
    if (!Array.isArray(response.data)) throw new Error('Managers not array');
  });

  await test('Users Screen: Filter Team Leads', async () => {
    const response = await axios.get(`${BASE_URL}/users/team-leads`, { headers: adminHeaders });
    if (!Array.isArray(response.data)) throw new Error('Team leads not array');
  });

  await test('Users Screen: Filter Employees', async () => {
    const response = await axios.get(`${BASE_URL}/users/employees`, { headers: adminHeaders });
    if (!Array.isArray(response.data)) throw new Error('Employees not array');
  });

  // ============================================================
  // FORMS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 10] FORMS SCREEN - FORM MANAGEMENT');
  console.log('─'.repeat(60));

  let createdFormId;

  await test('Forms Screen: View All Forms', async () => {
    const response = await axios.get(`${BASE_URL}/forms`, { headers: managerHeaders });
    if (!Array.isArray(response.data)) throw new Error('Forms not array');
  });

  await test('Forms Screen: Create New Form', async () => {
    const response = await axios.post(`${BASE_URL}/forms`, {
      name: 'E2E Test Form',
      description: 'Created by end-to-end test',
      fields: [
        {
          field_id: 'test_field_1',
          label: 'Test Field',
          field_type: 'text',
          required: true
        }
      ],
      is_active: true
    }, { headers: managerHeaders });
    if (!response.data.id) throw new Error('Form not created');
    createdFormId = response.data.id;
  });

  await test('Forms Screen: View Single Form', async () => {
    const response = await axios.get(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
    if (response.data.name !== 'E2E Test Form') throw new Error('Form details incorrect');
  });

  await test('Forms Screen: Update Form', async () => {
    await axios.put(`${BASE_URL}/forms/${createdFormId}`, {
      name: 'E2E Test Form - Updated'
    }, { headers: managerHeaders });
    const response = await axios.get(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
    if (response.data.name !== 'E2E Test Form - Updated') throw new Error('Form not updated');
  });

  // ============================================================
  // NOTIFICATIONS SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 11] NOTIFICATIONS SCREEN');
  console.log('─'.repeat(60));

  await test('Notifications Screen: View All Notifications', async () => {
    const response = await axios.get(`${BASE_URL}/notifications`, { headers: userHeaders });
    if (!Array.isArray(response.data)) throw new Error('Notifications not array');
  });

  await test('Notifications Screen: Get Notification Count', async () => {
    const response = await axios.get(`${BASE_URL}/notifications/count`, { headers: userHeaders });
    if (response.data.total === undefined) throw new Error('Count missing');
  });

  // ============================================================
  // PROFILE SCREEN WORKFLOW
  // ============================================================
  console.log('\n[WORKFLOW 12] PROFILE SCREEN - USER SETTINGS');
  console.log('─'.repeat(60));

  await test('Profile Screen: View Own Profile', async () => {
    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers: userHeaders });
    if (!profile.data.employee_id) throw new Error('Profile missing');

    const userId = profile.data.id;
    const response = await axios.get(`${BASE_URL}/users/${userId}`, { headers: userHeaders });
    if (!response.data.employee_id) throw new Error('User details missing');
  });

  // ============================================================
  // CLEANUP
  // ============================================================
  console.log('\n[CLEANUP] Removing Test Data');
  console.log('─'.repeat(60));

  await test('Cleanup: Delete Test Task', async () => {
    await axios.delete(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
  });

  await test('Cleanup: Delete Test Form', async () => {
    await axios.delete(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
  });

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log('\n\n');
  console.log('═'.repeat(70));
  console.log('  END-TO-END WORKFLOW TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`\n  Total Workflows:   ${totalTests}`);
  console.log(`  ✓ Passed:          ${passedTests}${passedTests === totalTests ? ' 🎉' : ''}`);
  console.log(`  ✗ Failed:          ${failedTests}${failedTests > 0 ? ' ⚠️' : ''}`);
  console.log(`  Success Rate:      ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);
  console.log('═'.repeat(70));

  if (failedTests > 0) {
    console.log('\n\nFAILED WORKFLOWS:');
    console.log('─'.repeat(70));
    testResults.filter(r => r.status === 'FAIL').forEach((r, i) => {
      console.log(`${i + 1}. ${r.test}`);
      console.log(`   Error: ${r.error}\n`);
    });
  } else {
    console.log('\n✓ ALL SCREENS AND TOOLS WORKING PERFECTLY!');
    console.log('✓ FRONTEND-BACKEND INTEGRATION 100% OPERATIONAL!');
    console.log('✓ SYSTEM READY FOR PRODUCTION USE!\n');
  }

  console.log('\n\nEND-TO-END TEST COMPLETED!\n');
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runEndToEndTests().catch(error => {
  console.error('\n\nFATAL ERROR:', error);
  process.exit(1);
});
