const https = require('https');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Test credentials
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

async function clockIn() {
  console.log('\n========== CLOCKING IN ==========');
  const res = await makeRequest('POST', '/attendance/clock-in', {}, token);

  if (res.status === 200) {
    console.log('✓ Clocked in successfully');
    return res.data;
  } else {
    console.log(`✗ Clock in failed: ${JSON.stringify(res.data)}`);
    return null;
  }
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
  console.log(`Screen active seconds (from API): ${session.screen_active_seconds}`);
  console.log(`Heartbeat count: ${session.heartbeat_count}`);
  console.log(`Last heartbeat: ${session.last_heartbeat}`);
  console.log(`Screen locked flag: ${session.screen_locked}`);

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

    const diff = Math.abs(expectedScreenActive - session.screen_active_seconds);
    if (diff > 5) {
      console.log(`⚠️ MISMATCH! Difference: ${diff}s`);
    } else {
      console.log(`✓ Values match (within 5s tolerance)`);
    }
  }
}

async function testFrontendScenario() {
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      SIMULATING EXACT FRONTEND LOCK/UNLOCK SCENARIO          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Step 1: Get or create session
  let session = await getSessionState();

  if (!session || session.status === 'completed') {
    console.log('\nNo active session. Clocking in...');
    session = await clockIn();
  }

  if (!session || session.status !== 'active') {
    console.log('\n⚠️ Cannot get active session');
    console.log('Session data:', JSON.stringify(session, null, 2));
    return;
  }

  await printSessionDetails('INITIAL STATE', session);

  const initialInactive = session.inactive_seconds || 0;
  const initialScreenActive = session.screen_active_seconds || 0;

  // Step 2: Send a few normal heartbeats (simulating normal work)
  console.log('\n[STEP 2] Sending normal heartbeats (user working)...');
  for (let i = 0; i < 3; i++) {
    await makeRequest('POST', '/attendance/heartbeat', {
      timestamp: new Date().toISOString(),
      is_active: true,
      screen_locked: false
    }, token);
    console.log(`  Heartbeat ${i + 1} sent`);
    await wait(2000);
  }

  session = await getSessionState();
  console.log(`\nAfter work: screen_active=${session.screen_active_seconds}s, inactive=${session.inactive_seconds}s`);
  const preWorkScreenActive = session.screen_active_seconds;

  // Step 3: Simulate screen lock
  console.log('\n[STEP 3] Simulating SCREEN LOCK...');
  const lockTime = Date.now();

  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);
  console.log('  Lock heartbeat sent');

  // Step 4: Wait while locked (10 seconds)
  console.log('\n[STEP 4] Screen locked for 10 seconds...');
  await wait(10000);

  // Check session during lock
  const lockedSession = await getSessionState();
  console.log(`\nDuring lock: screen_active=${lockedSession.screen_active_seconds}s, inactive=${lockedSession.inactive_seconds}s`);

  // Step 5: Unlock
  const unlockTime = Date.now();
  const lockDuration = Math.floor((unlockTime - lockTime) / 1000);
  console.log(`\n[STEP 5] Unlocking after ${lockDuration}s...`);

  // Send unlock heartbeat
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  // Step 6: Add inactive time (what frontend onUnlock does)
  console.log(`\n[STEP 6] Adding ${lockDuration}s inactive time...`);
  const addRes = await makeRequest('POST', '/attendance/inactive-time', {
    inactive_seconds_to_add: lockDuration
  }, token);
  console.log(`  Response: inactive_seconds=${addRes.data?.inactive_seconds}`);

  // Step 7: Fetch final session (what frontend does after unlock)
  console.log('\n[STEP 7] Fetching session after unlock...');
  await wait(500);
  const finalSession = await getSessionState();
  await printSessionDetails('FINAL STATE AFTER UNLOCK', finalSession);

  // ========== ANALYSIS ==========
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ANALYSIS                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  console.log(`\nInactive seconds:`);
  console.log(`  Before lock: ${initialInactive}s`);
  console.log(`  After unlock: ${finalSession.inactive_seconds}s`);
  console.log(`  Added: ${finalSession.inactive_seconds - initialInactive}s (expected ~${lockDuration}s)`);

  console.log(`\nScreen active seconds:`);
  console.log(`  Initial: ${initialScreenActive}s`);
  console.log(`  Before lock: ${preWorkScreenActive}s`);
  console.log(`  After unlock: ${finalSession.screen_active_seconds}s`);

  const screenActiveGrowth = finalSession.screen_active_seconds - preWorkScreenActive;
  console.log(`  Growth during test: ${screenActiveGrowth}s`);

  // THE KEY CHECK
  if (finalSession.screen_active_seconds === 0) {
    console.log('\n❌ CRITICAL BUG: Screen active time is 0!');
    console.log('   This should NEVER happen during an active session.');
    console.log('   The timer should have preserved the value from before lock.');
  } else if (screenActiveGrowth < -5) {
    console.log('\n❌ BUG: Screen active time DECREASED!');
    console.log('   This indicates the timer reset or calculation is wrong.');
  } else if (screenActiveGrowth > lockDuration + 5) {
    console.log('\n⚠️ WARNING: Screen active time grew during lock period!');
    console.log('   The lock duration should have been subtracted, not added.');
  } else {
    console.log('\n✓ Screen active time looks correct');
    console.log('   Timer paused during lock and resumed after unlock.');
  }

  // Return data for further analysis
  return {
    initialInactive,
    initialScreenActive,
    preWorkScreenActive,
    lockDuration,
    finalInactive: finalSession.inactive_seconds,
    finalScreenActive: finalSession.screen_active_seconds,
    screenActiveGrowth
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TIME TRACKER DEBUG v2 - Root Cause Analysis                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    // Login
    const loggedIn = await login();
    if (!loggedIn) {
      process.exit(1);
    }

    // Run the test
    const results = await testFrontendScenario();

    // Summary
    if (results) {
      console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║                    TEST COMPLETE                             ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log(JSON.stringify(results, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
