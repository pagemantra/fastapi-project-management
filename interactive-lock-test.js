/**
 * Interactive Lock Test - Manual unlock required
 *
 * This test will:
 * 1. Check state before lock
 * 2. Lock your screen
 * 3. Wait for YOU to unlock (no auto-unlock)
 * 4. Check state after you unlock
 */

const https = require('https');
const { exec } = require('child_process');
const readline = require('readline');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';
const CREDENTIALS = { employee_id: 'JSAN313', password: 'JSAN313@456' };

let token = null;

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatTime(s) {
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
}

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(prompt, ans => { rl.close(); r(ans); }));
}

function lockScreen() {
  return new Promise(r => {
    exec('rundll32.exe user32.dll,LockWorkStation', () => r());
  });
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           INTERACTIVE SCREEN LOCK TEST                         ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  This test will verify the time tracker works during lock      ║');
  console.log('║                                                                 ║');
  console.log('║  BEFORE RUNNING:                                                ║');
  console.log('║  1. Open Chrome to http://localhost:5173                        ║');
  console.log('║  2. Login and clock in                                          ║');
  console.log('║  3. Wait for "Running" status on the timer                      ║');
  console.log('║  4. Grant "Idle Detection" permission if prompted               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Login
  console.log('Logging in to API...');
  const loginRes = await makeRequest('POST', '/auth/login', CREDENTIALS);
  if (loginRes.status !== 200) {
    console.error('Login failed!');
    return;
  }
  token = loginRes.data.access_token;
  console.log('✓ Logged in\n');

  // Check session
  const beforeRes = await makeRequest('GET', '/attendance/current');
  const before = beforeRes.data;

  if (!before || before.status !== 'active') {
    console.log('❌ No active session! Please clock in first in the browser.');
    return;
  }

  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  BEFORE LOCK                                                    │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│  Screen Active Time: ${formatTime(before.screen_active_seconds || 0).padEnd(41)}│`);
  console.log(`│  Inactive/Lock Time: ${formatTime(before.inactive_seconds || 0).padEnd(41)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  const beforeScreenActive = before.screen_active_seconds || 0;
  const beforeInactive = before.inactive_seconds || 0;

  await question('\nPress ENTER to lock your screen... ');

  console.log('\n🔒 LOCKING SCREEN NOW...\n');
  const lockTime = Date.now();
  await lockScreen();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('  Your screen is now LOCKED!');
  console.log('');
  console.log('  Wait at least 15 seconds, then:');
  console.log('    1. Press any key or move mouse to wake screen');
  console.log('    2. Press Enter on lock screen to unlock');
  console.log('    3. Come back to this terminal');
  console.log('════════════════════════════════════════════════════════════════════');

  await question('\nAfter unlocking, press ENTER here to continue... ');

  const unlockTime = Date.now();
  const lockDuration = Math.floor((unlockTime - lockTime) / 1000);

  console.log(`\n⏱️  You were locked for approximately ${lockDuration} seconds\n`);

  // Wait for PWA to process
  console.log('Waiting 3 seconds for PWA to send data to server...');
  await wait(3000);

  // Check after state
  const afterRes = await makeRequest('GET', '/attendance/current');
  const after = afterRes.data;

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  AFTER UNLOCK                                                   │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│  Screen Active Time: ${formatTime(after.screen_active_seconds || 0).padEnd(41)}│`);
  console.log(`│  Inactive/Lock Time: ${formatTime(after.inactive_seconds || 0).padEnd(41)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  const afterScreenActive = after.screen_active_seconds || 0;
  const afterInactive = after.inactive_seconds || 0;

  const screenActiveChange = afterScreenActive - beforeScreenActive;
  const inactiveChange = afterInactive - beforeInactive;

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  ANALYSIS                                                       │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│  Lock duration:      ~${lockDuration}s`.padEnd(66) + '│');
  console.log(`│  Screen active Δ:    +${screenActiveChange}s`.padEnd(66) + '│');
  console.log(`│  Inactive Δ:         +${inactiveChange}s`.padEnd(66) + '│');
  console.log('└─────────────────────────────────────────────────────────────────┘');

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  TEST RESULTS                                                   │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  let allPassed = true;

  // Test 1: Screen active NOT 0
  if (afterScreenActive === 0) {
    console.log('│  ❌ FAIL: Screen active time became 0!                          │');
    allPassed = false;
  } else {
    console.log('│  ✓ PASS: Screen active time is NOT 0                            │');
  }

  // Test 2: Inactive increased
  if (inactiveChange > 0) {
    console.log('│  ✓ PASS: Inactive time increased (lock was detected)            │');

    // Test 3: No double counting
    const expectedInactive = lockDuration;
    const tolerance = 5;
    if (Math.abs(inactiveChange - expectedInactive) <= tolerance) {
      console.log('│  ✓ PASS: No double counting (inactive ≈ lock duration)          │');
    } else if (inactiveChange > expectedInactive * 1.5) {
      console.log('│  ⚠️ WARN: Possible double counting                               │');
      console.log(`│         Expected ~${expectedInactive}s, got ${inactiveChange}s`.padEnd(65) + '│');
      allPassed = false;
    }

    // Test 4: Screen active paused
    const expectedScreenGrowth = 5; // just the wait time after unlock
    if (screenActiveChange <= expectedScreenGrowth + 3) {
      console.log('│  ✓ PASS: Screen active paused during lock                       │');
    } else {
      console.log('│  ⚠️ WARN: Screen active grew too much during lock                │');
    }
  } else {
    console.log('│  ℹ️ INFO: Inactive did not increase                              │');
    console.log('│         PWA may not have detected the lock                      │');
    console.log('│         Check browser console for IdleDetector errors           │');
  }

  console.log('├─────────────────────────────────────────────────────────────────┤');
  if (allPassed && inactiveChange > 0) {
    console.log('│  ✅ ALL TESTS PASSED - Time tracking is working correctly!      │');
  } else if (allPassed) {
    console.log('│  ⚠️ PARTIAL - Timer preserved but lock not detected by PWA      │');
  } else {
    console.log('│  ❌ TESTS FAILED - Review issues above                          │');
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log('');
}

main().catch(console.error);
