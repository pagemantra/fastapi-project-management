/**
 * Physical Screen Lock/Unlock Test
 * Uses Windows API to actually lock the screen and test the time tracker
 */

const https = require('https');
const { exec, spawn } = require('child_process');
const readline = require('readline');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

const CREDENTIALS = [
  { employee_id: 'JSAN313', password: 'JSAN313@456' },
  { employee_id: 'JSAN267', password: 'JSAN267@456' },
];

let token = null;

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

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

async function login() {
  for (const cred of CREDENTIALS) {
    const res = await makeRequest('POST', '/auth/login', cred);
    if (res.status === 200 && res.data?.access_token) {
      token = res.data.access_token;
      console.log(`✓ Logged in as ${cred.employee_id}\n`);
      return true;
    }
  }
  console.log('✗ Failed to login');
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

function lockScreen() {
  return new Promise((resolve, reject) => {
    console.log('\n🔒 LOCKING SCREEN using Windows API...\n');

    // Use rundll32 to call LockWorkStation
    exec('rundll32.exe user32.dll,LockWorkStation', (error) => {
      if (error) {
        console.error('Lock command error:', error);
        reject(error);
      } else {
        console.log('Lock command sent successfully');
        resolve();
      }
    });
  });
}

function simulateKeyPress() {
  return new Promise((resolve) => {
    console.log('\n🔓 Simulating key press to wake/unlock screen...\n');

    // Use PowerShell to send a key press (this will dismiss the lock screen if no password)
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      Start-Sleep -Milliseconds 500
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    `;

    exec(`powershell -Command "${psScript}"`, (error) => {
      if (error) {
        console.log('Key press simulation completed (may have errors if screen locked)');
      }
      resolve();
    });
  });
}

async function printSessionState(label) {
  const session = await getSession();
  console.log(`\n--- ${label} ---`);
  if (!session) {
    console.log('No active session');
    return null;
  }
  console.log(`Status: ${session.status}`);
  console.log(`Screen Active: ${formatTime(session.screen_active_seconds || 0)}`);
  console.log(`Inactive (Lock/Sleep): ${formatTime(session.inactive_seconds || 0)}`);
  console.log(`Screen Locked Flag: ${session.last_screen_locked || false}`);
  return session;
}

async function waitForUserInput(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PHYSICAL SCREEN LOCK/UNLOCK TEST                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    // Login
    if (!await login()) {
      process.exit(1);
    }

    // Ensure we have an active session
    let session = await getSession();
    if (!session || session.status !== 'active') {
      console.log('No active session. Clocking in...');
      session = await clockIn();
    }

    // Get initial state
    const initialSession = await printSessionState('INITIAL STATE');
    const initialScreenActive = initialSession?.screen_active_seconds || 0;
    const initialInactive = initialSession?.inactive_seconds || 0;

    console.log('\n' + '='.repeat(60));
    console.log('IMPORTANT: This test will PHYSICALLY LOCK your Windows screen!');
    console.log('Since you have no password, press Enter to unlock when prompted.');
    console.log('='.repeat(60));

    await waitForUserInput('\nPress ENTER to start the lock test...');

    // Record time before lock
    const lockStartTime = Date.now();

    // Lock the screen
    await lockScreen();

    console.log('\n⏳ Screen is now LOCKED. Waiting 10 seconds...');
    console.log('   (The PWA in the background should detect this via IdleDetector)\n');

    // Wait while locked
    await wait(10000);

    const lockEndTime = Date.now();
    const actualLockDuration = Math.floor((lockEndTime - lockStartTime) / 1000);

    console.log(`\n⏱️ Lock duration: ${actualLockDuration} seconds`);

    // Try to unlock
    console.log('\n🔓 Attempting to unlock screen...');
    await simulateKeyPress();

    console.log('\n' + '='.repeat(60));
    await waitForUserInput('Please UNLOCK your screen manually (press Enter on lock screen), then press ENTER here to continue...');
    console.log('='.repeat(60));

    // Wait for frontend to process the unlock
    console.log('\n⏳ Waiting 5 seconds for PWA to process unlock event...');
    await wait(5000);

    // Get final state
    const finalSession = await printSessionState('FINAL STATE AFTER UNLOCK');
    const finalScreenActive = finalSession?.screen_active_seconds || 0;
    const finalInactive = finalSession?.inactive_seconds || 0;

    // Analysis
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS');
    console.log('='.repeat(60));

    const inactiveGrowth = finalInactive - initialInactive;
    const screenActiveGrowth = finalScreenActive - initialScreenActive;
    const totalTimeElapsed = actualLockDuration + 5; // lock time + wait after unlock

    console.log(`\nTime elapsed during test: ~${totalTimeElapsed}s`);
    console.log(`Actual lock duration: ${actualLockDuration}s`);
    console.log(`\nInactive seconds change: ${initialInactive} → ${finalInactive} (+${inactiveGrowth}s)`);
    console.log(`Screen active change: ${initialScreenActive} → ${finalScreenActive} (+${screenActiveGrowth}s)`);

    // Verify results
    console.log('\n--- VERIFICATION ---');

    // Check 1: Screen active should NOT be 0
    if (finalScreenActive === 0) {
      console.log('❌ FAIL: Screen active time is 0! This is the bug we were fixing.');
    } else {
      console.log('✓ PASS: Screen active time is NOT 0');
    }

    // Check 2: Inactive time should have increased by roughly lock duration
    const inactiveDiff = Math.abs(inactiveGrowth - actualLockDuration);
    if (inactiveDiff <= 3) {
      console.log(`✓ PASS: Inactive time increased by ~${inactiveGrowth}s (expected ~${actualLockDuration}s)`);
    } else {
      console.log(`⚠️ WARNING: Inactive time increased by ${inactiveGrowth}s but expected ~${actualLockDuration}s (diff: ${inactiveDiff}s)`);
    }

    // Check 3: Screen active should have grown by (totalTimeElapsed - lockDuration)
    const expectedScreenActiveGrowth = totalTimeElapsed - actualLockDuration;
    const screenActiveDiff = Math.abs(screenActiveGrowth - expectedScreenActiveGrowth);
    if (screenActiveDiff <= 5) {
      console.log(`✓ PASS: Screen active grew by ~${screenActiveGrowth}s (expected ~${expectedScreenActiveGrowth}s)`);
    } else {
      console.log(`⚠️ WARNING: Screen active grew by ${screenActiveGrowth}s but expected ~${expectedScreenActiveGrowth}s`);
    }

    // Check 4: No double counting - screen active + inactive should roughly equal elapsed time
    const totalTrackedGrowth = screenActiveGrowth + inactiveGrowth;
    const trackingDiff = Math.abs(totalTrackedGrowth - totalTimeElapsed);
    if (trackingDiff <= 5) {
      console.log(`✓ PASS: Total tracked time (${totalTrackedGrowth}s) ≈ elapsed time (${totalTimeElapsed}s)`);
    } else {
      console.log(`❌ FAIL: Total tracked (${totalTrackedGrowth}s) != elapsed (${totalTimeElapsed}s) - possible double counting!`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
