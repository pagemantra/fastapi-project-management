/**
 * Comprehensive Time Tracker Test
 * Tests all time tracking scenarios to verify correct behavior
 */

const https = require('https');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

const CREDENTIALS = [
  { employee_id: 'JSAN313', password: 'JSAN313@456' },
  { employee_id: 'JSAN267', password: 'JSAN267@456' },
];

let token = null;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function makeRequest(method, path, data = null, authToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    };
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function test(name, condition, expected, actual) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    testsPassed++;
    return true;
  } else {
    console.log(`  ✗ ${name}`);
    console.log(`    Expected: ${expected}`);
    console.log(`    Actual: ${actual}`);
    testsFailed++;
    failures.push({ name, expected, actual });
    return false;
  }
}

async function login() {
  for (const cred of CREDENTIALS) {
    const res = await makeRequest('POST', '/auth/login', cred);
    if (res.status === 200 && res.data?.access_token) {
      token = res.data.access_token;
      console.log(`Logged in as ${cred.employee_id}\n`);
      return true;
    }
  }
  console.log('Failed to login');
  return false;
}

async function getSession() {
  const res = await makeRequest('GET', '/attendance/current', null, token);
  return res.data;
}

async function clockIn() {
  const res = await makeRequest('POST', '/attendance/clock-in', {}, token);
  return res.data;
}

// ==================== TEST SUITES ====================

async function testClockIn() {
  console.log('\n[TEST SUITE] Clock In');
  console.log('='.repeat(50));

  let session = await getSession();

  if (session && (session.status === 'active' || session.status === 'on_break')) {
    console.log('  Already have an active session, using it');
    return session;
  }

  session = await clockIn();

  test('Clock in returns session', session !== null, 'session object', session);
  test('Session status is active', session?.status === 'active', 'active', session?.status);
  test('Initial inactive_seconds is 0', session?.inactive_seconds === 0, 0, session?.inactive_seconds);

  return session;
}

async function testHeartbeatDoesNotAddInactiveTime() {
  console.log('\n[TEST SUITE] Heartbeat Does NOT Auto-Add Inactive Time');
  console.log('='.repeat(50));

  // Get initial state
  let session = await getSession();
  const initialInactive = session?.inactive_seconds || 0;
  console.log(`  Initial inactive_seconds: ${initialInactive}`);

  // Send heartbeat with screen_locked=true (simulating lock detected)
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  // Wait 3 seconds
  console.log('  Waiting 3 seconds with screen_locked=true...');
  await wait(3000);

  // Send another heartbeat still locked
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  // Check session
  session = await getSession();
  console.log(`  After locked heartbeats: inactive_seconds=${session?.inactive_seconds}`);

  // CRITICAL: inactive_seconds should NOT have increased from heartbeat alone
  // The fix was to remove auto-adding from heartbeat
  test(
    'Heartbeat does NOT auto-add inactive time',
    session?.inactive_seconds === initialInactive,
    initialInactive,
    session?.inactive_seconds
  );

  // Send unlock heartbeat
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  return session;
}

async function testAddInactiveTimeEndpoint() {
  console.log('\n[TEST SUITE] Add Inactive Time Endpoint');
  console.log('='.repeat(50));

  // Get initial state
  let session = await getSession();
  const initialInactive = session?.inactive_seconds || 0;
  console.log(`  Initial inactive_seconds: ${initialInactive}`);

  // Add exactly 30 seconds
  const addAmount = 30;
  const res = await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: addAmount
  }, token);

  test('Add inactive time returns success', res.data?.success === true, true, res.data?.success);
  test(
    'Inactive seconds increased by exact amount',
    res.data?.inactive_seconds === initialInactive + addAmount,
    initialInactive + addAmount,
    res.data?.inactive_seconds
  );

  // Verify via session fetch
  session = await getSession();
  test(
    'Session reflects updated inactive_seconds',
    session?.inactive_seconds === initialInactive + addAmount,
    initialInactive + addAmount,
    session?.inactive_seconds
  );

  return session;
}

async function testScreenActiveCalculation() {
  console.log('\n[TEST SUITE] Screen Active Time Calculation');
  console.log('='.repeat(50));

  const session = await getSession();

  if (!session || !session.login_time) {
    console.log('  SKIP: No active session');
    return;
  }

  const loginTimeMs = new Date(session.login_time).getTime();
  const nowMs = Date.now();
  const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);

  // Calculate breaks
  let breakSeconds = 0;
  if (session.breaks && Array.isArray(session.breaks)) {
    session.breaks.forEach(b => {
      if (b.duration_minutes) {
        breakSeconds += Math.round(b.duration_minutes * 60);
      }
    });
  }

  const inactiveSeconds = session.inactive_seconds || 0;
  const expectedScreenActive = Math.max(0, totalElapsedSeconds - breakSeconds - inactiveSeconds);

  console.log(`  Total elapsed: ${totalElapsedSeconds}s`);
  console.log(`  Break time: ${breakSeconds}s`);
  console.log(`  Inactive time: ${inactiveSeconds}s`);
  console.log(`  Expected screen active: ${expectedScreenActive}s`);
  console.log(`  API screen_active_seconds: ${session.screen_active_seconds}s`);

  // Allow 5 second tolerance
  const diff = Math.abs(expectedScreenActive - session.screen_active_seconds);
  test(
    'Screen active time calculation is correct (within 5s)',
    diff <= 5,
    `~${expectedScreenActive}s`,
    `${session.screen_active_seconds}s (diff: ${diff}s)`
  );
}

async function testFullLockUnlockCycle() {
  console.log('\n[TEST SUITE] Full Lock/Unlock Cycle Simulation');
  console.log('='.repeat(50));

  // Get initial state
  let session = await getSession();
  const initialInactive = session?.inactive_seconds || 0;
  const initialScreenActive = session?.screen_active_seconds || 0;
  console.log(`  Initial: inactive=${initialInactive}s, screen_active=${initialScreenActive}s`);

  // Simulate lock
  console.log('  Simulating screen lock...');
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  // Wait (simulating lock duration)
  const lockDuration = 5;
  console.log(`  Waiting ${lockDuration} seconds (simulating lock)...`);
  await wait(lockDuration * 1000);

  // Simulate unlock and add inactive time (what frontend does)
  console.log('  Simulating unlock and adding inactive time...');
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: lockDuration
  }, token);

  // Small delay for server
  await wait(500);

  // Get final state
  session = await getSession();
  const finalInactive = session?.inactive_seconds || 0;
  const finalScreenActive = session?.screen_active_seconds || 0;

  console.log(`  Final: inactive=${finalInactive}s, screen_active=${finalScreenActive}s`);
  console.log(`  Inactive change: +${finalInactive - initialInactive}s (expected: +${lockDuration}s)`);

  // CRITICAL TESTS
  test(
    'Inactive seconds increased by lock duration',
    finalInactive === initialInactive + lockDuration,
    initialInactive + lockDuration,
    finalInactive
  );

  test(
    'Screen active time did NOT become 0',
    finalScreenActive > 0,
    '> 0',
    finalScreenActive
  );

  // Screen active should have grown by roughly (total_time_passed - lock_duration)
  // Which should be small (just the test overhead ~0-2s)
  const screenActiveGrowth = finalScreenActive - initialScreenActive;
  const testDuration = lockDuration + 1; // approximate total test time
  const expectedGrowth = testDuration - lockDuration; // should be ~0-1s

  test(
    'Screen active time froze during lock (grew by ~0-3s not full duration)',
    screenActiveGrowth >= 0 && screenActiveGrowth <= 3,
    `0-3s growth`,
    `${screenActiveGrowth}s growth`
  );
}

async function testNoDoubleCountingOnMultipleHeartbeats() {
  console.log('\n[TEST SUITE] No Double Counting on Multiple Heartbeats');
  console.log('='.repeat(50));

  let session = await getSession();
  const initialInactive = session?.inactive_seconds || 0;

  // Send multiple heartbeats with screen_locked=true
  for (let i = 0; i < 5; i++) {
    await makeRequest('POST', '/attendance/heartbeat', {
      timestamp: new Date().toISOString(),
      is_active: false,
      screen_locked: true
    }, token);
    await wait(1000);
  }

  // Check that inactive_seconds has NOT changed from heartbeats
  session = await getSession();
  test(
    'No inactive time added from locked heartbeats',
    session?.inactive_seconds === initialInactive,
    initialInactive,
    session?.inactive_seconds
  );

  // Now explicitly add 5 seconds (simulating frontend reporting)
  await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: 5
  }, token);

  // Send unlock heartbeat
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  // Check final state
  session = await getSession();
  test(
    'Only explicit addInactiveTime updated the value',
    session?.inactive_seconds === initialInactive + 5,
    initialInactive + 5,
    session?.inactive_seconds
  );
}

// ==================== MAIN ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE TIME TRACKER TEST                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    if (!await login()) {
      process.exit(1);
    }

    await testClockIn();
    await testHeartbeatDoesNotAddInactiveTime();
    await testAddInactiveTimeEndpoint();
    await testScreenActiveCalculation();
    await testFullLockUnlockCycle();
    await testNoDoubleCountingOnMultipleHeartbeats();

    // Final summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`Total: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed} ✓`);
    console.log(`Failed: ${testsFailed} ✗`);
    console.log(`Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

    if (failures.length > 0) {
      console.log('\n--- FAILURES ---');
      failures.forEach((f, i) => {
        console.log(`${i + 1}. ${f.name}`);
        console.log(`   Expected: ${f.expected}`);
        console.log(`   Actual: ${f.actual}`);
      });
    }

    if (testsFailed === 0) {
      console.log('\n✓ ALL TESTS PASSED! Time tracking logic is working correctly.');
    } else {
      console.log('\n✗ SOME TESTS FAILED. Please review the failures above.');
    }

    process.exit(testsFailed > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
