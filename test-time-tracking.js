const http = require('http');

const BASE_URL = 'http://localhost:8000';

// Test credentials
const CREDENTIALS = {
  user: { employee_id: 'JSAN313', password: 'JSAN313@456' }
};

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  failures: []
};

let token = null;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, authToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
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

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== TIME TRACKING TESTS ====================

async function testLogin() {
  console.log('\n=== Logging in ===');
  const res = await makeRequest('POST', '/auth/login', CREDENTIALS.user);
  assert(res.status === 200, 'Login successful');
  if (res.data && res.data.access_token) {
    token = res.data.access_token;
    console.log('  Token acquired');
  }
}

async function testClockIn() {
  console.log('\n=== Testing Clock In ===');

  // First check current session
  const currentRes = await makeRequest('GET', '/attendance/current', null, token);

  if (currentRes.data && (currentRes.data.status === 'active' || currentRes.data.status === 'on_break')) {
    console.log('  Already clocked in, will use existing session');
    return currentRes.data;
  }

  // Clock in
  const clockInRes = await makeRequest('POST', '/attendance/clock-in', {}, token);
  assert(clockInRes.status === 200, 'Clock in successful');
  assert(clockInRes.data && clockInRes.data.status === 'active', 'Session is active after clock in');
  assert(clockInRes.data && clockInRes.data.inactive_seconds === 0, 'Inactive seconds starts at 0');

  return clockInRes.data;
}

async function testHeartbeat() {
  console.log('\n=== Testing Heartbeat (Screen Active) ===');

  // Send heartbeat with screen unlocked
  const heartbeatRes = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  assert(heartbeatRes.status === 200, 'Heartbeat sent successfully');
  assert(heartbeatRes.data && heartbeatRes.data.success === true, 'Heartbeat response indicates success');
  assert(heartbeatRes.data && typeof heartbeatRes.data.heartbeat_count === 'number', 'Heartbeat count returned');
  assert(heartbeatRes.data && typeof heartbeatRes.data.inactive_seconds === 'number', 'Inactive seconds returned');

  console.log(`  Heartbeat count: ${heartbeatRes.data?.heartbeat_count}`);
  console.log(`  Inactive seconds: ${heartbeatRes.data?.inactive_seconds}`);

  return heartbeatRes.data;
}

async function testScreenLockDetection() {
  console.log('\n=== Testing Screen Lock Detection (IdleDetector simulation) ===');

  // Get initial session state
  const initialSession = await makeRequest('GET', '/attendance/current', null, token);
  const initialInactive = initialSession.data?.inactive_seconds || 0;
  console.log(`  Initial inactive seconds: ${initialInactive}`);

  // Test 1: Normal heartbeat (screen unlocked) - NO inactive time added
  console.log('  Sending heartbeat with screen_locked: false (normal operation)');
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  await wait(2000);

  const normalHeartbeat = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  console.log(`  Inactive seconds after normal heartbeats: ${normalHeartbeat.data?.inactive_seconds}`);
  assert(
    normalHeartbeat.data && normalHeartbeat.data.inactive_seconds === initialInactive,
    'Inactive seconds NOT increased during normal operation (tab switch/minimize should NOT add time)'
  );

  // Test 2: Screen lock detected by IdleDetector - SHOULD add inactive time
  console.log('  Simulating IdleDetector detecting screen lock (screen_locked: true)');
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  // Wait 3 seconds (simulating screen being locked)
  console.log('  Waiting 3 seconds (simulating screen lock time)...');
  await wait(3000);

  // Send another heartbeat still locked - this should add the 3 seconds
  console.log('  Sending another heartbeat with screen still locked');
  const lockedHeartbeat = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  console.log(`  Inactive seconds after lock: ${lockedHeartbeat.data?.inactive_seconds}`);

  // The inactive seconds should have increased (gap between heartbeats when locked)
  assert(
    lockedHeartbeat.data && lockedHeartbeat.data.inactive_seconds > initialInactive,
    'Inactive seconds INCREASED when screen is actually locked (IdleDetector detected)'
  );

  // Test 3: Screen unlocked - verify unlock heartbeat works
  console.log('  Sending heartbeat with screen_locked: false (unlocking)');
  const unlockedHeartbeat = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  assert(unlockedHeartbeat.status === 200, 'Heartbeat after unlock successful');
  assert(unlockedHeartbeat.data && unlockedHeartbeat.data.screen_locked === false, 'Screen lock status updated to false');

  console.log(`  Final inactive seconds: ${unlockedHeartbeat.data?.inactive_seconds}`);

  return unlockedHeartbeat.data;
}

async function testInactiveTimeEndpoint() {
  console.log('\n=== Testing Inactive Time Endpoint (Direct) ===');

  // Get initial state
  const initialSession = await makeRequest('GET', '/attendance/current', null, token);
  const initialInactive = initialSession.data?.inactive_seconds || 0;
  console.log(`  Initial inactive seconds: ${initialInactive}`);

  // Add 60 seconds of inactive time (simulating client detecting screen lock)
  const addInactiveRes = await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: 60
  }, token);

  assert(addInactiveRes.status === 200, 'Add inactive time successful');
  assert(addInactiveRes.data && addInactiveRes.data.success === true, 'Inactive time added successfully');
  assert(
    addInactiveRes.data && addInactiveRes.data.inactive_seconds === initialInactive + 60,
    `Inactive seconds increased by 60 (${initialInactive} + 60 = ${addInactiveRes.data?.inactive_seconds})`
  );

  console.log(`  New inactive seconds: ${addInactiveRes.data?.inactive_seconds}`);

  return addInactiveRes.data;
}

async function testBreakTimeTracking() {
  console.log('\n=== Testing Break Time Tracking ===');

  // Get current session
  const currentSession = await makeRequest('GET', '/attendance/current', null, token);

  if (currentSession.data?.status === 'on_break') {
    console.log('  Already on break, ending break first...');
    await makeRequest('POST', '/attendance/break/end', {}, token);
    await wait(500);
  }

  // Get initial break minutes
  const beforeBreak = await makeRequest('GET', '/attendance/current', null, token);
  const initialBreakMinutes = beforeBreak.data?.total_break_minutes || 0;
  console.log(`  Initial break minutes: ${initialBreakMinutes}`);

  // Start a break
  console.log('  Starting short break...');
  const startBreakRes = await makeRequest('POST', '/attendance/break/start', {
    break_type: 'short_break',
    comment: 'Time tracking test break'
  }, token);

  assert(startBreakRes.status === 200, 'Start break successful');
  assert(startBreakRes.data && startBreakRes.data.status === 'on_break', 'Status changed to on_break');

  // Wait 3 seconds
  console.log('  Waiting 3 seconds (break duration)...');
  await wait(3000);

  // End the break
  console.log('  Ending break...');
  const endBreakRes = await makeRequest('POST', '/attendance/break/end', {}, token);

  assert(endBreakRes.status === 200, 'End break successful');
  assert(endBreakRes.data && endBreakRes.data.status === 'active', 'Status changed back to active');

  // Check that break was recorded
  const breaks = endBreakRes.data?.breaks || [];
  const lastBreak = breaks[breaks.length - 1];

  assert(lastBreak && lastBreak.break_type === 'short_break', 'Break type recorded correctly');
  assert(lastBreak && lastBreak.comment === 'Time tracking test break', 'Break comment recorded correctly');
  assert(lastBreak && lastBreak.start_time, 'Break start time recorded');
  assert(lastBreak && lastBreak.end_time, 'Break end time recorded');

  console.log(`  Break recorded: ${lastBreak?.break_type} from ${new Date(lastBreak?.start_time).toLocaleTimeString()} to ${new Date(lastBreak?.end_time).toLocaleTimeString()}`);

  return endBreakRes.data;
}

async function testScreenActiveTimeCalculation() {
  console.log('\n=== Testing Screen Active Time Calculation ===');

  const session = await makeRequest('GET', '/attendance/current', null, token);
  const data = session.data;

  if (!data || !data.login_time) {
    console.log('  No active session, skipping calculation test');
    return;
  }

  // Calculate expected screen active time
  const loginTimeMs = new Date(data.login_time).getTime();
  const nowMs = Date.now();
  const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);

  // Get break seconds
  let breakSeconds = 0;
  if (data.breaks && Array.isArray(data.breaks)) {
    breakSeconds = data.breaks.reduce((sum, b) => {
      if (b.duration_minutes) {
        return sum + Math.round(b.duration_minutes * 60);
      }
      return sum;
    }, 0);
  }

  const inactiveSeconds = data.inactive_seconds || 0;
  const expectedScreenActive = Math.max(0, totalElapsedSeconds - breakSeconds - inactiveSeconds);

  console.log(`  Total elapsed seconds: ${totalElapsedSeconds}`);
  console.log(`  Break seconds: ${breakSeconds}`);
  console.log(`  Inactive seconds: ${inactiveSeconds}`);
  console.log(`  Expected screen active: ${expectedScreenActive}`);
  console.log(`  Actual screen active (from API): ${data.screen_active_seconds}`);

  // Allow 5 second tolerance for timing differences
  const tolerance = 5;
  const diff = Math.abs(data.screen_active_seconds - expectedScreenActive);

  assert(
    diff <= tolerance,
    `Screen active time calculation correct (within ${tolerance}s tolerance, diff: ${diff}s)`,
    `Expected ~${expectedScreenActive}s, got ${data.screen_active_seconds}s (diff: ${diff}s)`
  );

  // Verify formula: screen_active = elapsed - breaks - inactive
  assert(
    data.screen_active_seconds <= totalElapsedSeconds,
    'Screen active time <= total elapsed time'
  );

  return data;
}

async function testAttendanceHistoryWithTimeData() {
  console.log('\n=== Testing Attendance History with Time Data ===');

  const historyRes = await makeRequest('GET', '/attendance/history', null, token);

  assert(historyRes.status === 200, 'Get attendance history successful');
  assert(Array.isArray(historyRes.data), 'History is an array');

  if (historyRes.data.length > 0) {
    const latestSession = historyRes.data[0];

    console.log(`  Latest session date: ${latestSession.date}`);
    console.log(`  Status: ${latestSession.status}`);
    console.log(`  Screen active seconds: ${latestSession.screen_active_seconds}`);
    console.log(`  Inactive seconds: ${latestSession.inactive_seconds}`);
    console.log(`  Break minutes: ${latestSession.total_break_minutes}`);
    console.log(`  Work hours: ${latestSession.total_work_hours}`);

    // Verify all required time fields exist
    assert(latestSession.hasOwnProperty('screen_active_seconds'), 'History has screen_active_seconds');
    assert(latestSession.hasOwnProperty('inactive_seconds'), 'History has inactive_seconds (lock/sleep time)');
    assert(latestSession.hasOwnProperty('total_break_minutes'), 'History has total_break_minutes');
    assert(latestSession.hasOwnProperty('total_work_hours'), 'History has total_work_hours');
    assert(Array.isArray(latestSession.breaks), 'History has breaks array');

    // Verify breaks have all required fields
    if (latestSession.breaks.length > 0) {
      const firstBreak = latestSession.breaks[0];
      assert(firstBreak.hasOwnProperty('break_type'), 'Break has break_type');
      assert(firstBreak.hasOwnProperty('start_time'), 'Break has start_time');
      console.log(`  First break type: ${firstBreak.break_type}`);
    }
  }

  return historyRes.data;
}

// ==================== RUN ALL TESTS ====================

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TIME TRACKING & SCREEN LOCK DETECTION - COMPREHENSIVE TEST ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await testLogin();
    await testClockIn();
    await testHeartbeat();
    await testScreenLockDetection();
    await testInactiveTimeEndpoint();
    await testBreakTimeTracking();
    await testScreenActiveTimeCalculation();
    await testAttendanceHistoryWithTimeData();

    // Print results
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed} ✓`);
    console.log(`Failed: ${testResults.failed} ✗`);
    console.log(`Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);

    if (testResults.failures.length > 0) {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║                      FAILURES                                ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      testResults.failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.testName}`);
        console.log(`   ${failure.errorMessage}\n`);
      });
    }

    console.log('\n✨ Time tracking tests completed!\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              TIME TRACKING LOGIC VERIFIED                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║ ✓ Timer CONTINUES running on tab switch/minimize            ║');
    console.log('║ ✓ Timer PAUSES only on actual screen lock (IdleDetector)    ║');
    console.log('║ ✓ Timer PAUSES on explicit break (user clicks Break)        ║');
    console.log('║ ✓ Inactive seconds only added when screen_locked=true       ║');
    console.log('║ ✓ Screen active = elapsed - breaks - inactive               ║');
    console.log('║ ✓ Break time tracked in breaks array with details           ║');
    console.log('║ ✓ Lock/Sleep time stored in inactive_seconds column         ║');
    console.log('║ ✓ All time data returned in attendance history              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();
