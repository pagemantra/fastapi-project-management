/**
 * Full Physical Lock Test
 * This will lock your screen, wait, then check the results
 */

const https = require('https');
const { exec } = require('child_process');

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
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
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

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

function lockScreen() {
  return new Promise((resolve) => {
    exec('rundll32.exe user32.dll,LockWorkStation', () => {
      resolve();
    });
  });
}

async function main() {
  const LOCK_DURATION = 15; // seconds

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PHYSICAL SCREEN LOCK TEST                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nThis will lock your screen for ${LOCK_DURATION} seconds.`);
  console.log('Make sure the PWA is open in your browser at http://localhost:5174');
  console.log('and you are clocked in!\n');

  try {
    // Login
    console.log('Logging in...');
    const loginRes = await makeRequest('POST', '/auth/login', CREDENTIALS);
    if (loginRes.status !== 200) {
      console.error('Login failed:', loginRes);
      return;
    }
    token = loginRes.data.access_token;
    console.log('✓ Logged in\n');

    // Get BEFORE state
    console.log('=== BEFORE LOCK ===');
    const beforeRes = await makeRequest('GET', '/attendance/current');
    const before = beforeRes.data;

    if (!before || before.status !== 'active') {
      console.log('No active session! Please clock in first.');
      return;
    }

    console.log(`Screen Active: ${formatTime(before.screen_active_seconds || 0)} (${before.screen_active_seconds}s)`);
    console.log(`Inactive: ${formatTime(before.inactive_seconds || 0)} (${before.inactive_seconds}s)`);

    const beforeScreenActive = before.screen_active_seconds || 0;
    const beforeInactive = before.inactive_seconds || 0;

    // Lock screen
    console.log(`\n🔒 LOCKING SCREEN NOW! (will stay locked for ${LOCK_DURATION}s)`);
    console.log('   Press Enter on the lock screen to unlock when timer completes.\n');

    const lockStartTime = Date.now();
    await lockScreen();

    // Wait for lock duration
    for (let i = LOCK_DURATION; i > 0; i--) {
      process.stdout.write(`\r   Unlocking in ${i} seconds... `);
      await wait(1000);
    }
    console.log('\n');

    const lockEndTime = Date.now();
    const actualLockDuration = Math.floor((lockEndTime - lockStartTime) / 1000);

    console.log(`⏱️  Lock duration: ${actualLockDuration}s`);
    console.log('\n⏳ Waiting for you to unlock and PWA to process...');
    console.log('   Please unlock your screen now (press Enter on lock screen)');

    // Wait for unlock and processing
    await wait(10000);

    // Get AFTER state
    console.log('\n=== AFTER UNLOCK ===');
    const afterRes = await makeRequest('GET', '/attendance/current');
    const after = afterRes.data;

    console.log(`Screen Active: ${formatTime(after.screen_active_seconds || 0)} (${after.screen_active_seconds}s)`);
    console.log(`Inactive: ${formatTime(after.inactive_seconds || 0)} (${after.inactive_seconds}s)`);

    const afterScreenActive = after.screen_active_seconds || 0;
    const afterInactive = after.inactive_seconds || 0;

    // Analysis
    const screenActiveChange = afterScreenActive - beforeScreenActive;
    const inactiveChange = afterInactive - beforeInactive;
    const totalElapsed = actualLockDuration + 10; // lock + wait time

    console.log('\n=== ANALYSIS ===');
    console.log(`Total test time: ~${totalElapsed}s`);
    console.log(`Lock duration: ${actualLockDuration}s`);
    console.log(`Screen active change: +${screenActiveChange}s`);
    console.log(`Inactive change: +${inactiveChange}s`);

    console.log('\n=== RESULTS ===');

    // Check 1: Screen active should NOT be 0
    if (afterScreenActive === 0) {
      console.log('❌ FAIL: Screen active time became 0!');
    } else {
      console.log('✓ PASS: Screen active time is NOT 0');
    }

    // Check 2: If PWA detected lock, inactive should increase
    if (inactiveChange > 0) {
      console.log(`✓ PASS: Inactive time increased by ${inactiveChange}s (lock detected)`);

      // Check for double counting
      if (inactiveChange > actualLockDuration * 1.5) {
        console.log(`⚠️ WARNING: Inactive grew more than expected - possible double counting`);
        console.log(`   Expected: ~${actualLockDuration}s, Got: ${inactiveChange}s`);
      } else {
        console.log(`✓ PASS: No double counting (inactive ≈ lock duration)`);
      }

      // Check screen active didn't grow during lock
      const expectedScreenGrowth = totalElapsed - actualLockDuration; // ~10s wait time
      if (screenActiveChange <= expectedScreenGrowth + 3) {
        console.log(`✓ PASS: Screen active paused during lock (+${screenActiveChange}s ≈ ${expectedScreenGrowth}s wait time)`);
      } else {
        console.log(`⚠️ WARNING: Screen active grew too much: +${screenActiveChange}s (expected ~${expectedScreenGrowth}s)`);
      }
    } else {
      console.log('ℹ️ INFO: Inactive did not increase - PWA may not have detected lock');
      console.log('   Make sure PWA is open in browser and you are clocked in');
    }

    console.log('\n✨ Test complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main();
