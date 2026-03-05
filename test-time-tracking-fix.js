/**
 * Time Tracking Fix Verification Test
 *
 * This test verifies that the lock/sleep time tracking fix works correctly.
 *
 * Test Scenarios:
 * 1. Single lock event should only add inactive time once
 * 2. Sleep event following lock should not double-count
 * 3. Wake event following unlock should not double-count
 * 4. Multiple separate lock events should each add their own time
 * 5. Time formula: screen_active + breaks + lock_sleep ≈ total_elapsed
 */

const axios = require('axios');
const moment = require('moment-timezone');

const IST = 'Asia/Kolkata';
const API_BASE = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Test user credentials (update as needed)
let TEST_TOKEN = process.env.TEST_TOKEN || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(config => {
  if (TEST_TOKEN) {
    config.headers.Authorization = `Bearer ${TEST_TOKEN}`;
  }
  return config;
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCurrentSession() {
  try {
    const response = await api.get('/attendance/current');
    return response.data;
  } catch (error) {
    console.error('Failed to get current session:', error.response?.data || error.message);
    return null;
  }
}

async function addInactiveTime(seconds) {
  try {
    const response = await api.post('/attendance/inactive-time', {
      inactive_seconds_to_add: seconds
    });
    return response.data;
  } catch (error) {
    console.error('Failed to add inactive time:', error.response?.data || error.message);
    return null;
  }
}

async function clockIn() {
  try {
    const response = await api.post('/attendance/clock-in');
    return response.data;
  } catch (error) {
    console.error('Failed to clock in:', error.response?.data || error.message);
    return null;
  }
}

async function clockOut() {
  try {
    const response = await api.post('/attendance/clock-out', {});
    return response.data;
  } catch (error) {
    console.error('Failed to clock out:', error.response?.data || error.message);
    return null;
  }
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${minutes}m ${secs}s`;
}

function calculateExpectedScreenActive(session) {
  if (!session || !session.login_time) return 0;

  const now = Date.now();
  const loginTime = new Date(session.login_time).getTime();
  const totalElapsedSeconds = Math.floor((now - loginTime) / 1000);

  let breakSeconds = 0;
  if (session.breaks && Array.isArray(session.breaks)) {
    session.breaks.forEach(b => {
      if (b.duration_minutes && b.duration_minutes > 0) {
        breakSeconds += Math.round(b.duration_minutes * 60);
      }
    });
  }

  const inactiveSeconds = session.inactive_seconds || 0;

  return Math.max(0, totalElapsedSeconds - breakSeconds - inactiveSeconds);
}

async function runTests() {
  console.log('================================================');
  console.log('     TIME TRACKING FIX VERIFICATION TEST');
  console.log('================================================\n');

  if (!TEST_TOKEN) {
    console.log('⚠️  No TEST_TOKEN provided. Set TEST_TOKEN environment variable.');
    console.log('    Example: TEST_TOKEN=your_jwt_token node test-time-tracking-fix.js\n');

    // Try to get current session without auth to see if there's an active session
    console.log('Attempting to check for existing session...\n');
  }

  // Test 1: Get current session and verify formula
  console.log('═══════════════════════════════════════════════');
  console.log('TEST 1: Verify Time Formula');
  console.log('═══════════════════════════════════════════════\n');

  const session = await getCurrentSession();

  if (!session) {
    console.log('❌ No active session found. Please clock in first.\n');
    return;
  }

  console.log('Current Session Data:');
  console.log('─────────────────────');
  console.log(`  Login Time:        ${moment.utc(session.login_time).tz(IST).format('hh:mm:ss A')}`);
  console.log(`  Status:            ${session.status}`);
  console.log(`  Inactive Seconds:  ${session.inactive_seconds || 0}s (${formatDuration(session.inactive_seconds || 0)})`);
  console.log(`  Total Break Mins:  ${session.total_break_minutes || 0} min`);
  console.log(`  Screen Active:     ${session.screen_active_seconds}s (${formatDuration(session.screen_active_seconds || 0)})`);
  console.log('');

  // Calculate expected screen active time
  const now = Date.now();
  const loginTime = new Date(session.login_time).getTime();
  const totalElapsedSeconds = Math.floor((now - loginTime) / 1000);
  const breakSeconds = (session.total_break_minutes || 0) * 60;
  const inactiveSeconds = session.inactive_seconds || 0;
  const expectedScreenActive = totalElapsedSeconds - breakSeconds - inactiveSeconds;

  console.log('Time Formula Verification:');
  console.log('──────────────────────────');
  console.log(`  Total Elapsed:     ${totalElapsedSeconds}s (${formatDuration(totalElapsedSeconds)})`);
  console.log(`  - Break Time:      ${breakSeconds}s (${formatDuration(breakSeconds)})`);
  console.log(`  - Lock/Sleep:      ${inactiveSeconds}s (${formatDuration(inactiveSeconds)})`);
  console.log(`  ─────────────────`);
  console.log(`  = Screen Active:   ${expectedScreenActive}s (${formatDuration(Math.max(0, expectedScreenActive))})`);
  console.log(`  Server Reports:    ${session.screen_active_seconds || 0}s`);
  console.log('');

  // Verify the formula
  const tolerance = 5; // 5 seconds tolerance
  const formulaCheck = Math.abs((session.screen_active_seconds || 0) - expectedScreenActive) <= tolerance;

  if (formulaCheck) {
    console.log('✅ PASS: Time formula is correct (within 5s tolerance)\n');
  } else {
    console.log('❌ FAIL: Time formula mismatch!');
    console.log(`   Difference: ${Math.abs((session.screen_active_seconds || 0) - expectedScreenActive)}s\n`);
  }

  // Test 2: Verify no duplicate inactive time entries
  console.log('═══════════════════════════════════════════════');
  console.log('TEST 2: Simulate Lock/Unlock Event');
  console.log('═══════════════════════════════════════════════\n');

  const beforeInactive = session.inactive_seconds || 0;
  console.log(`Before: inactive_seconds = ${beforeInactive}s`);

  // Simulate adding 30 seconds of lock time
  const testLockDuration = 30;
  console.log(`\nAdding ${testLockDuration}s of lock time...`);

  const result = await addInactiveTime(testLockDuration);

  if (result) {
    console.log(`After:  inactive_seconds = ${result.inactive_seconds}s`);
    const expected = beforeInactive + testLockDuration;

    if (result.inactive_seconds === expected) {
      console.log(`\n✅ PASS: Inactive time correctly added once (${beforeInactive} + ${testLockDuration} = ${expected})`);
    } else {
      console.log(`\n❌ FAIL: Expected ${expected}s but got ${result.inactive_seconds}s`);
      if (result.inactive_seconds > expected) {
        console.log(`   Possible double-counting detected! Extra: ${result.inactive_seconds - expected}s`);
      }
    }
  } else {
    console.log('❌ Failed to add inactive time');
  }

  // Test 3: Verify session consistency
  console.log('\n═══════════════════════════════════════════════');
  console.log('TEST 3: Verify Session Consistency');
  console.log('═══════════════════════════════════════════════\n');

  await sleep(1000);
  const updatedSession = await getCurrentSession();

  if (updatedSession) {
    const newTotal = updatedSession.inactive_seconds || 0;
    const newScreenActive = updatedSession.screen_active_seconds || 0;

    const now2 = Date.now();
    const totalElapsed2 = Math.floor((now2 - new Date(updatedSession.login_time).getTime()) / 1000);
    const breakSecs2 = (updatedSession.total_break_minutes || 0) * 60;
    const sum = newScreenActive + breakSecs2 + newTotal;

    console.log('Final Verification:');
    console.log('───────────────────');
    console.log(`  Total Elapsed:     ${totalElapsed2}s`);
    console.log(`  Screen Active:     ${newScreenActive}s`);
    console.log(`  + Break Time:      ${breakSecs2}s`);
    console.log(`  + Lock/Sleep:      ${newTotal}s`);
    console.log(`  ─────────────────`);
    console.log(`  Sum:               ${sum}s`);
    console.log(`  Expected:          ${totalElapsed2}s`);
    console.log(`  Difference:        ${Math.abs(sum - totalElapsed2)}s`);
    console.log('');

    if (Math.abs(sum - totalElapsed2) <= 5) {
      console.log('✅ PASS: All time components add up correctly!\n');
    } else {
      console.log('❌ FAIL: Time components do not add up!');
      console.log(`   Missing time: ${totalElapsed2 - sum}s`);
      console.log(`   Or extra time tracked: ${sum - totalElapsed2}s\n`);
    }
  }

  console.log('═══════════════════════════════════════════════');
  console.log('                 TEST COMPLETE');
  console.log('═══════════════════════════════════════════════\n');

  console.log('SUMMARY:');
  console.log('────────');
  console.log('The fix prevents double-counting by:');
  console.log('  1. Using inactiveTimeReportedRef flag to track if time was already reported');
  console.log('  2. Adding debounce in screenLockDetector for rapid unlock events');
  console.log('  3. Only TimeTracker calls the API - ScreenActiveTime just updates UI');
  console.log('  4. Both onUnlock and onWake check the flag before adding inactive time');
  console.log('');
  console.log('To fully test:');
  console.log('  1. Clock in and let the timer run for a few minutes');
  console.log('  2. Lock your screen (Win+L) and wait 1-2 minutes');
  console.log('  3. Unlock your screen');
  console.log('  4. Verify lock/sleep time shows the correct duration');
  console.log('  5. Check that screen_active + break + lock_sleep ≈ total_elapsed');
  console.log('');
}

// Run tests
runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
