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

async function runCRUDTests() {
  console.log('\n'.repeat(2));
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE CRUD OPERATIONS TEST');
  console.log('  Testing Create, Read, Update, Delete for all entities');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let adminToken, managerToken, teamLeadToken, userToken;
  let createdTaskId, createdTeamId, createdFormId, createdUserId, createdWorksheetId;

  // ============================================================
  // LOGIN ALL USERS
  // ============================================================
  console.log('\n[SETUP] Logging in all users');
  console.log('─'.repeat(60));

  await test('Login as Admin', async () => {
    adminToken = await loginUser('JSAN252', 'JSAN252@456');
  });

  await test('Login as Manager', async () => {
    managerToken = await loginUser('JSAN261', 'JSAN261@456');
  });

  await test('Login as Team Lead', async () => {
    teamLeadToken = await loginUser('JSAN267', 'JSAN267@456');
  });

  await test('Login as User', async () => {
    userToken = await loginUser('JSAN313', 'JSAN313@456');
  });

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const managerHeaders = { Authorization: `Bearer ${managerToken}` };
  const teamLeadHeaders = { Authorization: `Bearer ${teamLeadToken}` };
  const userHeaders = { Authorization: `Bearer ${userToken}` };

  // ============================================================
  // TASKS CRUD
  // ============================================================
  console.log('\n[1] TASKS CRUD OPERATIONS');
  console.log('─'.repeat(60));

  await test('CREATE Task (Manager)', async () => {
    const response = await axios.post(`${BASE_URL}/tasks`, {
      title: 'Test Task CRUD',
      description: 'Testing task creation',
      assigned_to: '69305167d0a70009cca658f8', // JSAN313
      priority: 'medium',
      status: 'pending',
      due_date: '2025-12-15'
    }, { headers: managerHeaders });

    if (!response.data.id) throw new Error('No task ID returned');
    createdTaskId = response.data.id;
  });

  await test('READ Task', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
    if (response.data.title !== 'Test Task CRUD') throw new Error('Task data mismatch');
  });

  await test('UPDATE Task', async () => {
    await axios.put(`${BASE_URL}/tasks/${createdTaskId}`, {
      title: 'Test Task CRUD - Updated',
      status: 'in_progress'
    }, { headers: managerHeaders });

    const response = await axios.get(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
    if (response.data.title !== 'Test Task CRUD - Updated') throw new Error('Task not updated');
    if (response.data.status !== 'in_progress') throw new Error('Status not updated');
  });

  await test('DELETE Task', async () => {
    await axios.delete(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });

    // Verify it's deleted
    try {
      await axios.get(`${BASE_URL}/tasks/${createdTaskId}`, { headers: managerHeaders });
      throw new Error('Task still exists after delete');
    } catch (error) {
      if (error.response?.status !== 404) throw error;
    }
  });

  // ============================================================
  // TEAMS CRUD (Admin only)
  // ============================================================
  console.log('\n[2] TEAMS CRUD OPERATIONS');
  console.log('─'.repeat(60));

  await test('CREATE Team (Admin)', async () => {
    const response = await axios.post(`${BASE_URL}/teams`, {
      name: 'Test Team CRUD',
      description: 'Testing team creation',
      manager_id: '6930515fd0a70009cca658cc', // JSAN261 Manager
      team_lead_id: '6930515dd0a70009cca658d0' // JSAN267 Team Lead
    }, { headers: adminHeaders });

    if (!response.data.id) throw new Error('No team ID returned');
    createdTeamId = response.data.id;
  });

  await test('READ Team', async () => {
    const response = await axios.get(`${BASE_URL}/teams/${createdTeamId}`, { headers: adminHeaders });
    if (response.data.name !== 'Test Team CRUD') throw new Error('Team data mismatch');
  });

  await test('UPDATE Team', async () => {
    await axios.put(`${BASE_URL}/teams/${createdTeamId}`, {
      name: 'Test Team CRUD - Updated',
      description: 'Updated description'
    }, { headers: adminHeaders });

    const response = await axios.get(`${BASE_URL}/teams/${createdTeamId}`, { headers: adminHeaders });
    if (response.data.name !== 'Test Team CRUD - Updated') throw new Error('Team not updated');
  });

  await test('DELETE Team', async () => {
    await axios.delete(`${BASE_URL}/teams/${createdTeamId}`, { headers: adminHeaders });

    try {
      await axios.get(`${BASE_URL}/teams/${createdTeamId}`, { headers: adminHeaders });
      throw new Error('Team still exists after delete');
    } catch (error) {
      if (error.response?.status !== 404) throw error;
    }
  });

  // ============================================================
  // FORMS CRUD (Manager/Admin)
  // ============================================================
  console.log('\n[3] FORMS CRUD OPERATIONS');
  console.log('─'.repeat(60));

  await test('CREATE Form (Manager)', async () => {
    const response = await axios.post(`${BASE_URL}/forms`, {
      name: 'Test Form CRUD',
      description: 'Testing form creation',
      fields: [
        {
          field_id: 'test_field_1',
          label: 'Test Field',
          field_type: 'text',
          required: true,
          placeholder: 'Enter text'
        }
      ],
      is_active: true
    }, { headers: managerHeaders });

    if (!response.data.id) throw new Error('No form ID returned');
    createdFormId = response.data.id;
  });

  await test('READ Form', async () => {
    const response = await axios.get(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
    if (response.data.name !== 'Test Form CRUD') throw new Error('Form data mismatch');
  });

  await test('UPDATE Form', async () => {
    await axios.put(`${BASE_URL}/forms/${createdFormId}`, {
      name: 'Test Form CRUD - Updated',
      description: 'Updated description'
    }, { headers: managerHeaders });

    const response = await axios.get(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
    if (response.data.name !== 'Test Form CRUD - Updated') throw new Error('Form not updated');
  });

  await test('DELETE Form', async () => {
    await axios.delete(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });

    try {
      await axios.get(`${BASE_URL}/forms/${createdFormId}`, { headers: managerHeaders });
      throw new Error('Form still exists after delete');
    } catch (error) {
      if (error.response?.status !== 404) throw error;
    }
  });

  // ============================================================
  // USERS CRUD (Admin only)
  // ============================================================
  console.log('\n[4] USERS CRUD OPERATIONS');
  console.log('─'.repeat(60));

  await test('CREATE User (Admin)', async () => {
    const response = await axios.post(`${BASE_URL}/users`, {
      employee_id: 'TEST001',
      email: 'test001@example.com',
      full_name: 'Test User CRUD',
      password: 'Test123!',
      role: 'employee',
      department: 'IT'
    }, { headers: adminHeaders });

    if (!response.data.id) throw new Error('No user ID returned');
    createdUserId = response.data.id;
  });

  await test('READ User', async () => {
    const response = await axios.get(`${BASE_URL}/users/${createdUserId}`, { headers: adminHeaders });
    if (response.data.employee_id !== 'TEST001') throw new Error('User data mismatch');
  });

  await test('UPDATE User', async () => {
    await axios.put(`${BASE_URL}/users/${createdUserId}`, {
      full_name: 'Test User CRUD - Updated',
      department: 'HR'
    }, { headers: adminHeaders });

    const response = await axios.get(`${BASE_URL}/users/${createdUserId}`, { headers: adminHeaders });
    if (response.data.full_name !== 'Test User CRUD - Updated') throw new Error('User not updated');
    if (response.data.department !== 'HR') throw new Error('Department not updated');
  });

  await test('DELETE User (Deactivate)', async () => {
    await axios.delete(`${BASE_URL}/users/${createdUserId}`, { headers: adminHeaders });

    const response = await axios.get(`${BASE_URL}/users/${createdUserId}`, { headers: adminHeaders });
    if (response.data.is_active !== false) throw new Error('User not deactivated');
  });

  // ============================================================
  // WORKSHEETS CRUD
  // ============================================================
  console.log('\n[5] WORKSHEETS CRUD OPERATIONS');
  console.log('─'.repeat(60));

  await test('CREATE Worksheet (User)', async () => {
    const response = await axios.post(`${BASE_URL}/worksheets`, {
      date: '2025-12-09',
      form_responses: [
        { field_id: 'test_field', field_label: 'Test', value: 'Test data' }
      ],
      tasks_completed: ['Test task'],
      total_hours: 8,
      notes: 'Test worksheet'
    }, { headers: userHeaders });

    if (!response.data.id) throw new Error('No worksheet ID returned');
    createdWorksheetId = response.data.id;
  });

  await test('READ Worksheet', async () => {
    const response = await axios.get(`${BASE_URL}/worksheets/${createdWorksheetId}`, { headers: userHeaders });
    if (response.data.notes !== 'Test worksheet') throw new Error('Worksheet data mismatch');
  });

  await test('UPDATE Worksheet', async () => {
    await axios.put(`${BASE_URL}/worksheets/${createdWorksheetId}`, {
      notes: 'Test worksheet - Updated',
      total_hours: 9
    }, { headers: userHeaders });

    const response = await axios.get(`${BASE_URL}/worksheets/${createdWorksheetId}`, { headers: userHeaders });
    if (response.data.notes !== 'Test worksheet - Updated') throw new Error('Worksheet not updated');
    if (response.data.total_hours !== 9) throw new Error('Hours not updated');
  });

  await test('SUBMIT Worksheet', async () => {
    await axios.post(`${BASE_URL}/worksheets/${createdWorksheetId}/submit`, {}, { headers: userHeaders });

    const response = await axios.get(`${BASE_URL}/worksheets/${createdWorksheetId}`, { headers: userHeaders });
    if (response.data.status !== 'submitted') throw new Error('Worksheet not submitted');
  });

  // ============================================================
  // ATTENDANCE CRUD
  // ============================================================
  console.log('\n[6] ATTENDANCE OPERATIONS');
  console.log('─'.repeat(60));

  let sessionId;

  await test('Clock In', async () => {
    const response = await axios.post(`${BASE_URL}/attendance/clock-in`, {}, { headers: userHeaders });
    if (!response.data.id) throw new Error('No session ID returned');
    if (response.data.status !== 'active') throw new Error('Session not active');
    sessionId = response.data.id;
  });

  await test('Get Current Session', async () => {
    const response = await axios.get(`${BASE_URL}/attendance/current`, { headers: userHeaders });
    if (!response.data || response.data.id !== sessionId) throw new Error('Current session mismatch');
  });

  await test('Start Break', async () => {
    await axios.post(`${BASE_URL}/attendance/break/start`, {
      break_type: 'short_break',
      comment: 'Test break'
    }, { headers: userHeaders });

    const response = await axios.get(`${BASE_URL}/attendance/current`, { headers: userHeaders });
    if (response.data.status !== 'on_break') throw new Error('Break not started');
  });

  await test('End Break', async () => {
    await axios.post(`${BASE_URL}/attendance/break/end`, {}, { headers: userHeaders });

    const response = await axios.get(`${BASE_URL}/attendance/current`, { headers: userHeaders });
    if (response.data.status !== 'active') throw new Error('Break not ended');
  });

  await test('Clock Out', async () => {
    await axios.post(`${BASE_URL}/attendance/clock-out`, { notes: 'Test clock out' }, { headers: userHeaders });

    const response = await axios.get(`${BASE_URL}/attendance/current`, { headers: userHeaders });
    if (response.data !== null) throw new Error('Session still active after clock out');
  });

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log('\n\n');
  console.log('═'.repeat(70));
  console.log('  CRUD OPERATIONS TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`\n  Total Tests:   ${totalTests}`);
  console.log(`  ✓ Passed:      ${passedTests}${passedTests === totalTests ? ' 🎉' : ''}`);
  console.log(`  ✗ Failed:      ${failedTests}${failedTests > 0 ? ' ⚠️' : ''}`);
  console.log(`  Success Rate:  ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);
  console.log('═'.repeat(70));

  if (failedTests > 0) {
    console.log('\n\nFAILED TESTS:');
    console.log('─'.repeat(70));
    testResults.filter(r => r.status === 'FAIL').forEach((r, i) => {
      console.log(`${i + 1}. ${r.test}`);
      console.log(`   Error: ${r.error}\n`);
    });
  }

  console.log('\n\nCRUD TEST COMPLETED!\n');
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runCRUDTests().catch(error => {
  console.error('\n\nFATAL ERROR:', error);
  process.exit(1);
});
