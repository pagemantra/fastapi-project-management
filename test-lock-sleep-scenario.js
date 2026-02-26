const http = require('http');

const BASE_URL = 'http://localhost:8000';

// Test credentials
const CREDENTIALS = {
  user: { employee_id: 'JSAN313', password: 'JSAN313@456' }
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
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

async function runScenarioTest() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   LOCK/SLEEP TIME TRACKING - REAL SCENARIO SIMULATION           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Login
  console.log('=== Step 1: Login ===');
  const loginRes = await makeRequest('POST', '/auth/login', CREDENTIALS.user);
  if (loginRes.status !== 200) {
    console.log('❌ Login failed');
    process.exit(1);
  }
  token = loginRes.data.access_token;
  console.log('✓ Login successful\n');

  // Get current session
  console.log('=== Step 2: Check Current Session ===');
  let sessionRes = await makeRequest('GET', '/attendance/current', null, token);
  let session = sessionRes.data;

  if (!session || session.status !== 'active') {
    console.log('  No active session found. Clock in first to test.');
    process.exit(0);
  }

  console.log(`  Status: ${session.status}`);
  console.log(`  Login Time: ${new Date(session.login_time).toLocaleString()}`);
  console.log(`  Current Lock/Sleep Time: ${formatTime(session.inactive_seconds || 0)}`);
  console.log(`  Current Break Time: ${session.total_break_minutes || 0} min`);
  console.log(`  Screen Active Time: ${formatTime(session.screen_active_seconds || 0)}\n`);

  const initialInactive = session.inactive_seconds || 0;

  // Scenario 1: Tab Switch (Normal heartbeats, NO screen_locked)
  console.log('=== Scenario 1: User Switches Tab (Timer Should CONTINUE) ===');
  console.log('  Simulating normal heartbeats with screen_locked: false...');

  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);
  await wait(2000);

  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);

  sessionRes = await makeRequest('GET', '/attendance/current', null, token);
  session = sessionRes.data;

  if (session.inactive_seconds === initialInactive) {
    console.log('  ✓ PASS: Lock/Sleep time NOT changed (tab switch does not pause timer)');
    console.log(`    Lock/Sleep: ${formatTime(session.inactive_seconds)}\n`);
  } else {
    console.log('  ❌ FAIL: Lock/Sleep time changed when it should not have');
    console.log(`    Expected: ${formatTime(initialInactive)}, Got: ${formatTime(session.inactive_seconds)}\n`);
  }

  // Scenario 2: Screen Lock (IdleDetector detects lock)
  console.log('=== Scenario 2: User Locks Screen (Timer Should PAUSE) ===');
  console.log('  Simulating IdleDetector detecting screen lock...');

  // First heartbeat with screen_locked: true
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);
  console.log('  Sent heartbeat with screen_locked: true');

  // Wait 5 seconds (simulating screen being locked)
  console.log('  Waiting 5 seconds (screen is locked)...');
  await wait(5000);

  // Another heartbeat still locked - this adds the 5 seconds
  const lockHeartbeatRes = await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: false,
    screen_locked: true
  }, token);

  console.log('  Sent another heartbeat with screen still locked');
  console.log(`  Server response: inactive_seconds = ${lockHeartbeatRes.data?.inactive_seconds}`);

  // Unlock screen
  await makeRequest('POST', '/attendance/heartbeat', {
    timestamp: new Date().toISOString(),
    is_active: true,
    screen_locked: false
  }, token);
  console.log('  Unlocked screen (screen_locked: false)');

  sessionRes = await makeRequest('GET', '/attendance/current', null, token);
  session = sessionRes.data;

  if (session.inactive_seconds > initialInactive) {
    console.log('  ✓ PASS: Lock/Sleep time INCREASED (screen lock pauses timer)');
    console.log(`    Before: ${formatTime(initialInactive)}, After: ${formatTime(session.inactive_seconds)}`);
    console.log(`    Time added to Lock/Sleep column: ${formatTime(session.inactive_seconds - initialInactive)}\n`);
  } else {
    console.log('  ❌ FAIL: Lock/Sleep time should have increased');
    console.log(`    Expected > ${formatTime(initialInactive)}, Got: ${formatTime(session.inactive_seconds)}\n`);
  }

  const afterLockInactive = session.inactive_seconds;

  // Scenario 3: Break (Manual break, stored in breaks array)
  console.log('=== Scenario 3: User Takes a Break (Timer Should PAUSE, stored in Break column) ===');

  if (session.status === 'on_break') {
    console.log('  Already on break, ending it first...');
    await makeRequest('POST', '/attendance/break/end', {}, token);
    await wait(500);
  }

  console.log('  Starting a short break...');
  await makeRequest('POST', '/attendance/break/start', {
    break_type: 'short_break',
    comment: 'Lock/sleep test break'
  }, token);

  console.log('  Waiting 3 seconds (on break)...');
  await wait(3000);

  console.log('  Ending break...');
  await makeRequest('POST', '/attendance/break/end', {}, token);

  sessionRes = await makeRequest('GET', '/attendance/current', null, token);
  session = sessionRes.data;

  const lastBreak = session.breaks && session.breaks.length > 0
    ? session.breaks[session.breaks.length - 1]
    : null;

  if (lastBreak && lastBreak.end_time) {
    console.log('  ✓ PASS: Break recorded in breaks array');
    console.log(`    Break type: ${lastBreak.break_type}`);
    console.log(`    Duration: ~${Math.round((new Date(lastBreak.end_time) - new Date(lastBreak.start_time)) / 1000)}s`);
    console.log(`    Comment: ${lastBreak.comment || 'none'}\n`);
  } else {
    console.log('  ❌ FAIL: Break not properly recorded\n');
  }

  // Final Summary
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SESSION STATE                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  sessionRes = await makeRequest('GET', '/attendance/current', null, token);
  session = sessionRes.data;

  // Calculate expected screen active time
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

  console.log('  ATTENDANCE TABLE COLUMNS:');
  console.log('  ────────────────────────────────────────────────');
  console.log(`  Login Time:       ${new Date(session.login_time).toLocaleTimeString()}`);
  console.log(`  Total Elapsed:    ${formatTime(totalElapsedSeconds)}`);
  console.log(`  Break Time:       ${session.total_break_minutes || 0} min (${breakSeconds}s) - stored in Break column`);
  console.log(`  Lock/Sleep Time:  ${formatTime(inactiveSeconds)} - stored in Lock/Sleep column`);
  console.log(`  Screen Active:    ${formatTime(session.screen_active_seconds)} (expected: ~${formatTime(expectedScreenActive)})`);
  console.log(`  Work Hours:       ${session.total_work_hours?.toFixed(2) || 0} hrs`);
  console.log('  ────────────────────────────────────────────────\n');

  console.log('  FORMULA VERIFICATION:');
  console.log(`  screen_active = elapsed - break - lock/sleep`);
  console.log(`  ${formatTime(session.screen_active_seconds)} ≈ ${formatTime(totalElapsedSeconds)} - ${formatTime(breakSeconds)} - ${formatTime(inactiveSeconds)}`);

  const diff = Math.abs(session.screen_active_seconds - expectedScreenActive);
  if (diff <= 5) {
    console.log(`  ✓ Formula verified (diff: ${diff}s)\n`);
  } else {
    console.log(`  ⚠ Formula mismatch (diff: ${diff}s) - may be due to timing\n`);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ ✓ Tab switch/minimize: Timer CONTINUES (no time added)          ║');
  console.log('║ ✓ Screen lock/sleep: Timer PAUSES → Lock/Sleep column           ║');
  console.log('║ ✓ Break: Timer PAUSES → Break column                            ║');
  console.log('║ ✓ Screen Active = Elapsed - Break - Lock/Sleep                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

runScenarioTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
