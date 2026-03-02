/**
 * Automated Physical Screen Lock/Unlock Test
 * Uses Windows API to lock screen and automatically unlock (no password required)
 */

const https = require('https');
const { exec } = require('child_process');

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

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    // Escape for command line
    const escapedScript = script.replace(/"/g, '\\"');
    exec(`powershell -ExecutionPolicy Bypass -Command "${escapedScript}"`, (error, stdout, stderr) => {
      if (error && !stderr.includes('cannot be sent')) {
        // Ignore "keys cannot be sent" error which happens when screen is locked
      }
      resolve({ stdout, stderr });
    });
  });
}

async function lockAndUnlockScreen(lockDurationSeconds) {
  console.log(`\n🔒 Locking screen for ${lockDurationSeconds} seconds...`);

  // Lock the workstation
  await runPowerShell(`
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class LockWorkStation {
        [DllImport("user32.dll")]
        public static extern bool LockWorkStation();
    }
"@
    [LockWorkStation]::LockWorkStation()
  `);

  console.log('   Screen locked!');

  // Wait for the lock duration
  console.log(`   Waiting ${lockDurationSeconds} seconds...`);
  await wait(lockDurationSeconds * 1000);

  console.log('\n🔓 Unlocking screen (simulating key press)...');

  // Simulate key press to unlock (works when no password is set)
  // We need to use a different approach - send input directly
  await runPowerShell(`
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class KeyPress {
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public const byte VK_RETURN = 0x0D;
        public const uint KEYEVENTF_KEYDOWN = 0x0000;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        public static void PressEnter() {
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);
            System.Threading.Thread.Sleep(50);
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }
"@
    [KeyPress]::PressEnter()
    Start-Sleep -Milliseconds 500
    [KeyPress]::PressEnter()
  `);

  // Also try moving mouse to wake screen
  await runPowerShell(`
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class MouseMove {
        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT {
            public int X;
            public int Y;
        }

        public static void Jiggle() {
            POINT p;
            GetCursorPos(out p);
            SetCursorPos(p.X + 1, p.Y);
            System.Threading.Thread.Sleep(50);
            SetCursorPos(p.X, p.Y);
        }
    }
"@
    [MouseMove]::Jiggle()
  `);

  console.log('   Unlock commands sent!');

  // Wait a moment for the system to process
  await wait(2000);
}

async function printSessionState(label) {
  const session = await getSession();
  console.log(`\n--- ${label} ---`);
  if (!session) {
    console.log('No active session');
    return null;
  }
  console.log(`Status: ${session.status}`);
  console.log(`Screen Active: ${formatTime(session.screen_active_seconds || 0)} (${session.screen_active_seconds}s)`);
  console.log(`Inactive (Lock/Sleep): ${formatTime(session.inactive_seconds || 0)} (${session.inactive_seconds}s)`);
  return session;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUTOMATED PHYSICAL LOCK/UNLOCK TEST                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('\n⚠️  WARNING: This will lock your screen for 10 seconds!');
  console.log('    Make sure you have no password set or the test will hang.\n');

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
    const initialSession = await printSessionState('INITIAL STATE (before lock)');
    const initialScreenActive = initialSession?.screen_active_seconds || 0;
    const initialInactive = initialSession?.inactive_seconds || 0;

    // Lock for 10 seconds
    const LOCK_DURATION = 10;
    const startTime = Date.now();

    await lockAndUnlockScreen(LOCK_DURATION);

    const endTime = Date.now();
    const actualDuration = Math.floor((endTime - startTime) / 1000);

    console.log(`\n⏱️  Actual elapsed time: ${actualDuration}s`);

    // Wait for backend to process
    console.log('\n⏳ Waiting 5 seconds for system to settle...');
    await wait(5000);

    // Get final state
    const finalSession = await printSessionState('FINAL STATE (after unlock)');
    const finalScreenActive = finalSession?.screen_active_seconds || 0;
    const finalInactive = finalSession?.inactive_seconds || 0;

    // Calculate changes
    const inactiveGrowth = finalInactive - initialInactive;
    const screenActiveGrowth = finalScreenActive - initialScreenActive;
    const totalElapsed = actualDuration + 5; // lock time + wait time

    // Analysis
    console.log('\n' + '═'.repeat(60));
    console.log('ANALYSIS');
    console.log('═'.repeat(60));

    console.log(`\nTotal test duration: ~${totalElapsed}s`);
    console.log(`Lock duration: ~${LOCK_DURATION}s`);

    console.log(`\nInactive time: ${initialInactive}s → ${finalInactive}s (Δ${inactiveGrowth}s)`);
    console.log(`Screen active: ${initialScreenActive}s → ${finalScreenActive}s (Δ${screenActiveGrowth}s)`);

    // Verification
    console.log('\n' + '─'.repeat(60));
    console.log('VERIFICATION');
    console.log('─'.repeat(60));

    let allPassed = true;

    // Test 1: Screen active should NOT be 0
    if (finalScreenActive === 0) {
      console.log('❌ CRITICAL: Screen active time became 0!');
      allPassed = false;
    } else {
      console.log('✓ Screen active time is NOT 0');
    }

    // Test 2: Screen active should have grown by roughly (totalElapsed - lockDuration)
    // During lock, screen active should pause, so growth should be minimal
    const expectedScreenGrowth = totalElapsed - LOCK_DURATION; // Should be ~5s (wait time after unlock)
    if (screenActiveGrowth >= 0 && screenActiveGrowth <= expectedScreenGrowth + 3) {
      console.log(`✓ Screen active grew reasonably: +${screenActiveGrowth}s (expected ~${expectedScreenGrowth}s)`);
    } else if (screenActiveGrowth < 0) {
      console.log(`❌ Screen active DECREASED: ${screenActiveGrowth}s`);
      allPassed = false;
    } else {
      console.log(`⚠️ Screen active grew more than expected: +${screenActiveGrowth}s (expected ~${expectedScreenGrowth}s)`);
    }

    // Test 3: Inactive should have increased (if PWA detected the lock)
    // Note: This depends on whether the PWA was running and detected the lock
    if (inactiveGrowth > 0) {
      console.log(`✓ Inactive time increased: +${inactiveGrowth}s`);

      // Check if it's roughly the lock duration (not double)
      if (Math.abs(inactiveGrowth - LOCK_DURATION) <= 3) {
        console.log(`✓ Inactive increase matches lock duration (~${LOCK_DURATION}s)`);
      } else if (inactiveGrowth > LOCK_DURATION * 1.5) {
        console.log(`⚠️ Inactive increased more than lock duration - possible double counting?`);
        console.log(`   Expected: ~${LOCK_DURATION}s, Got: ${inactiveGrowth}s`);
      }
    } else {
      console.log(`ℹ️ Inactive time did not increase (PWA might not have detected lock)`);
      console.log(`   This is expected if PWA was not running in browser`);
    }

    // Test 4: Total tracked time should equal elapsed time
    const totalTracked = screenActiveGrowth + inactiveGrowth;
    const trackingError = Math.abs(totalTracked - totalElapsed);
    if (trackingError <= 5) {
      console.log(`✓ Time accounting correct: screen(${screenActiveGrowth}) + inactive(${inactiveGrowth}) ≈ elapsed(${totalElapsed})`);
    } else {
      console.log(`⚠️ Time accounting off: screen(${screenActiveGrowth}) + inactive(${inactiveGrowth}) = ${totalTracked}, expected ~${totalElapsed}`);
    }

    console.log('\n' + '═'.repeat(60));
    if (allPassed) {
      console.log('✓ ALL CRITICAL TESTS PASSED');
    } else {
      console.log('❌ SOME TESTS FAILED - Review above');
    }
    console.log('═'.repeat(60));

    console.log('\nNote: If PWA was not running in browser, lock detection won\'t work.');
    console.log('      Make sure the PWA is open and you\'re clocked in before testing.');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
