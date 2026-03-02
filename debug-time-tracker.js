const https = require('https');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Test credentials - try multiple users
const CREDENTIALS = [
  { employee_id: 'JSAN313', password: 'JSAN313@456' },
  { employee_id: 'JSAN267', password: 'JSAN267@456' },
];

let token = null;
let currentUser = null;

// Helper function to make HTTPS requests
function makeRequest(method, path, data = null, authToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = https.request(options, (res) => {
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

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Format time
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

async function login() {
  console.log('\n========== LOGGING IN ==========');

  for (const cred of CREDENTIALS) {
    console.log(`Trying ${cred.employee_id}...`);
    const res = await makeRequest('POST', '/auth/login', cred);

    if (res.status === 200 && res.data?.access_token) {
      token = res.data.access_token;
      currentUser = cred.employee_id;
      console.log(`✓ Logged in as ${cred.employee_id}`);
      return true;
    }
  }

  console.log('✗ Failed to login with any credentials');
  return false;
}

async function getSessionState() {
  const res = await makeRequest('GET', '/attendance/current', null, token);
  return res.data;
}

async function printSessionDetails(label, session) {
  console.log(`\n---------- ${label} ----------`);

  if (!session) {
    console.log('No active session');
    return;
  }

  console.log(`Status: ${session.status}`);
  console.log(`Login time: ${session.login_time}`);

  // Calculate elapsed time
  if (session.login_time) {
    const loginTimeMs = new Date(session.login_time).getTime();
    const nowMs = Date.now();
    const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);
    console.log(`Total elapsed: ${formatTime(totalElapsedSeconds)}`);
  }

  console.log(`Inactive seconds (from DB): ${session.inactive_seconds}`);
  console.log(`Total break minutes: ${session.total_break_minutes}`);
  console.log(`Screen active seconds (calculated): ${session.screen_active_seconds}`);
  console.log(`Heartbeat count: ${session.heartbeat_count}`);
  console.log(`Last heartbeat: ${session.last_heartbeat}`);
  console.log(`Screen locked: ${session.screen_locked}`);

  // Calculate expected screen active time
  if (session.login_time) {
    const loginTimeMs = new Date(session.login_time).getTime();
    const nowMs = Date.now();
    const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);

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

    console.log(`\n--- Calculation Check ---`);
    console.log(`Elapsed: ${totalElapsedSeconds}s`);
    console.log(`- Break: ${breakSeconds}s`);
    console.log(`- Inactive: ${inactiveSeconds}s`);
    console.log(`= Expected Screen Active: ${expectedScreenActive}s (${formatTime(expectedScreenActive)})`);
    console.log(`API returns: ${session.screen_active_seconds}s`);

    if (Math.abs(expectedScreenActive - session.screen_active_seconds) > 5) {
      console.log(`⚠️ MISMATCH! Difference: ${Math.abs(expectedScreenActive - session.screen_active_seconds)}s`);
    }
  }
}

async function simulateLockUnlockCycle() {
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      SIMULATING SCREEN LOCK/UNLOCK CYCLE                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Step 1: Get initial state
  console.log('\n[STEP 1] Getting initial state...');
  const initialSession = await getSessionState();
  await printSessionDetails('INITIAL STATE', initialSession);

  if (!initialSession || initialSession.status !== 'active') {
    console.log('\n⚠️ No active session. Please clock in first.');
    return;
  }

  const initialInactive = initialSession.inactive_seconds || 0;
  const initialScreenActive = initialSession.screen_active_seconds || 0;

  // Step 2: Send heartbeat indicating screen lock
  console.log('\n[STEP 2] Sending heartbeat with screen_locked=true (simulating lock)...');
  const lockHeartbeatRes = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);
  console.log(`Heartbeat response: ${JSON.stringify(lockHeartbeatRes.data)}`);

  // Step 3: Wait 5 seconds (simulating lock duration)
  console.log('\n[STEP 3] Waiting 5 seconds (simulating screen being locked)...');
  await wait(5000);

  // Step 4: Get state while still "locked"
  console.log('\n[STEP 4] Getting state while still locked...');
  const lockedSession = await getSessionState();
  await printSessionDetails('STATE WHILE LOCKED', lockedSession);

  // Step 5: Send heartbeat indicating screen unlock
  console.log('\n[STEP 5] Sending heartbeat with screen_locked=false (simulating unlock)...');
  const unlockHeartbeatRes = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);
  console.log(`Heartbeat response: ${JSON.stringify(unlockHeartbeatRes.data)}`);

  // Step 6: Call the addInactiveTime endpoint (what frontend does on unlock)
  console.log('\n[STEP 6] Calling addInactiveTime endpoint with 5 seconds...');
  const addInactiveRes = await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: 5
  }, token);
  console.log(`Add inactive response: ${JSON.stringify(addInactiveRes.data)}`);

  // Step 7: Get final state
  console.log('\n[STEP 7] Getting final state after unlock...');
  await wait(1000); // Small delay
  const finalSession = await getSessionState();
  await printSessionDetails('FINAL STATE AFTER UNLOCK', finalSession);

  // Summary
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SUMMARY                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Initial inactive_seconds: ${initialInactive}`);
  console.log(`Final inactive_seconds: ${finalSession.inactive_seconds}`);
  console.log(`Difference: ${finalSession.inactive_seconds - initialInactive}s`);
  console.log(`Initial screen_active_seconds: ${initialScreenActive}`);
  console.log(`Final screen_active_seconds: ${finalSession.screen_active_seconds}`);

  // Check if screen active time was preserved
  const screenActiveDiff = finalSession.screen_active_seconds - initialScreenActive;
  console.log(`Screen active time change: ${screenActiveDiff}s`);

  // The screen active time should have increased by roughly (total time passed - lock time)
  // During 5 second lock, screen active should increase by roughly 0-1 seconds (just the test overhead)
  // NOT by the full elapsed time

  if (finalSession.screen_active_seconds === 0) {
    console.log('\n❌ PROBLEM: Screen active time is 0! This should NOT happen.');
  } else if (Math.abs(screenActiveDiff) < 3) {
    console.log('\n✓ Screen active time preserved during lock (only increased by test overhead)');
  } else {
    console.log(`\n⚠️ Screen active time changed significantly during lock period`);
  }
}

async function checkDatabaseDirectly() {
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      CHECKING DATABASE STATE DIRECTLY                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Get attendance history to see raw data
  const historyRes = await makeRequest('GET', '/attendance/history', null, token);

  if (historyRes.status === 200 && historyRes.data && historyRes.data.length > 0) {
    console.log('\n--- Latest 3 Attendance Records from DB ---');
    historyRes.data.slice(0, 3).forEach((record, i) => {
      console.log(`\n[Record ${i + 1}]`);
      console.log(`  Date: ${record.date}`);
      console.log(`  Status: ${record.status}`);
      console.log(`  Login: ${record.login_time}`);
      console.log(`  Logout: ${record.logout_time}`);
      console.log(`  Inactive seconds: ${record.inactive_seconds}`);
      console.log(`  Screen active seconds: ${record.screen_active_seconds}`);
      console.log(`  Total break minutes: ${record.total_break_minutes}`);
      console.log(`  Total work hours: ${record.total_work_hours}`);
    });
  }
}

async function testFrontendScenario() {
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      SIMULATING EXACT FRONTEND SCENARIO                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nThis simulates what happens when:');
  console.log('1. User is working (timer running)');
  console.log('2. User locks screen (Win+L)');
  console.log('3. User unlocks screen');
  console.log('4. Frontend resumes\n');

  // Step 1: Get current state (this is what frontend does on load)
  console.log('[1] Fetching current session (like frontend does on mount)...');
  const session1 = await getSessionState();
  await printSessionDetails('Session on frontend load', session1);

  if (!session1 || session1.status !== 'active') {
    console.log('\n⚠️ No active session');
    return;
  }

  const savedScreenActive1 = session1.screen_active_seconds;
  const savedInactive1 = session1.inactive_seconds;

  // Step 2: Wait a bit to simulate user working
  console.log('\n[2] Simulating user working for 3 seconds...');
  await wait(3000);

  // Step 3: Get state again (continuous polling)
  const session2 = await getSessionState();
  console.log(`\n[3] After 3s work: screen_active=${session2.screen_active_seconds}s (was ${savedScreenActive1}s)`);

  // Step 4: Simulate lock - send heartbeat and track lock time
  console.log('\n[4] Simulating screen lock...');
  const lockTime = Date.now();
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  // Step 5: Wait 10 seconds (locked)
  console.log('[5] Screen locked for 10 seconds...');
  await wait(10000);

  // Step 6: Calculate lock duration and send unlock heartbeat
  const unlockTime = Date.now();
  const lockDuration = Math.floor((unlockTime - lockTime) / 1000);
  console.log(`\n[6] Unlocking... (was locked for ${lockDuration}s)`);

  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  // Step 7: Add inactive time (this is what frontend does in onUnlock callback)
  console.log(`[7] Calling addInactiveTime with ${lockDuration}s...`);
  const addRes = await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: lockDuration
  }, token);
  console.log(`    Response: inactive_seconds=${addRes.data?.inactive_seconds}`);

  // Step 8: Fetch session (what frontend does after unlock)
  console.log('\n[8] Fetching session after unlock...');
  const session3 = await getSessionState();
  await printSessionDetails('Session after unlock', session3);

  // Analysis
  console.log('\n\n========== ANALYSIS ==========');
  console.log(`Before lock:`);
  console.log(`  screen_active_seconds: ${session2.screen_active_seconds}`);
  console.log(`  inactive_seconds: ${session2.inactive_seconds}`);
  console.log(`\nAfter unlock:`);
  console.log(`  screen_active_seconds: ${session3.screen_active_seconds}`);
  console.log(`  inactive_seconds: ${session3.inactive_seconds}`);

  console.log(`\nInactive increased by: ${session3.inactive_seconds - session2.inactive_seconds}s (expected ~${lockDuration}s)`);

  // The key check: screen_active should NOT have jumped by lock duration
  // It should be roughly: previous + small_overhead (not previous + lock_duration)
  const actualScreenActiveGrowth = session3.screen_active_seconds - session2.screen_active_seconds;
  console.log(`Screen active grew by: ${actualScreenActiveGrowth}s`);

  if (session3.screen_active_seconds === 0) {
    console.log('\n❌ CRITICAL: Screen active time is 0! Something reset it.');
  } else if (actualScreenActiveGrowth > lockDuration + 3) {
    console.log(`\n⚠️ Screen active grew too much during lock! Should be ~0, got ${actualScreenActiveGrowth}s`);
  } else if (actualScreenActiveGrowth < 0) {
    console.log(`\n❌ Screen active time DECREASED! This is wrong.`);
  } else {
    console.log('\n✓ Screen active time calculation looks correct');
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TIME TRACKER DEBUG - Finding the root cause               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    // Login
    const loggedIn = await login();
    if (!loggedIn) {
      process.exit(1);
    }

    // Check database state
    await checkDatabaseDirectly();

    // Run the exact frontend scenario
    await testFrontendScenario();

    // Final database check
    await checkDatabaseDirectly();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
