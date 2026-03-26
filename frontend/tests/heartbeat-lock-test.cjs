/**
 * Heartbeat and Lock Detection Test Suite
 *
 * This test suite verifies the heartbeat and lock detection functionality
 * of the Work Tracker Electron app, including:
 * - Heartbeat configuration and timing
 * - Lock detection via Electron powerMonitor
 * - Event flow from main process to renderer
 * - Session data persistence
 * - Integration between components
 *
 * Run with: node frontend/tests/heartbeat-lock-test.cjs
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Test result tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const issues = [];

// Helper functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, colors.green);
  passedTests++;
  totalTests++;
}

function fail(message, details = '') {
  log(`✗ ${message}`, colors.red);
  if (details) {
    log(`  ${details}`, colors.yellow);
  }
  failedTests++;
  totalTests++;
  issues.push({ test: message, details });
}

function info(message) {
  log(`ℹ ${message}`, colors.blue);
}

function section(title) {
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(`${title}`, colors.bright + colors.cyan);
  log(`${'='.repeat(60)}`, colors.cyan);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Failed to read ${filePath}`, error.message);
    return null;
  }
}

// Test functions
function testHeartbeatConfiguration() {
  section('1. Heartbeat Configuration Tests');

  const timeTrackerPath = path.join(__dirname, '..', 'src', 'components', 'TimeTracker.jsx');
  const content = readFile(timeTrackerPath);

  if (!content) return;

  // Test 1.1: Verify heartbeat interval is 10 seconds
  const intervalMatch = content.match(/const\s+HEARTBEAT_INTERVAL\s*=\s*(\d+)/);
  if (intervalMatch) {
    const interval = parseInt(intervalMatch[1]);
    if (interval === 10000) {
      success('Heartbeat interval is correctly set to 10 seconds (10000ms)');
    } else {
      fail('Heartbeat interval is incorrect', `Expected 10000ms, found ${interval}ms`);
    }
  } else {
    fail('HEARTBEAT_INTERVAL constant not found in TimeTracker.jsx');
  }

  // Test 1.2: Verify heartbeat function exists
  if (content.includes('const sendHeartbeat = useCallback(async ()')) {
    success('sendHeartbeat function is defined');
  } else {
    fail('sendHeartbeat function not found');
  }

  // Test 1.3: Verify heartbeat sends lock status
  if (content.includes('screen_locked: isLocked')) {
    success('Heartbeat sends screen lock status to server');
  } else {
    fail('Heartbeat does not send screen_locked parameter');
  }

  // Test 1.4: Verify heartbeat sends active status
  if (content.includes('is_active: !isLocked')) {
    success('Heartbeat sends active status based on lock state');
  } else {
    fail('Heartbeat does not send is_active parameter');
  }

  // Test 1.5: Verify heartbeat interval setup
  if (content.includes('setInterval(() => {') &&
      content.includes('sendHeartbeat();') &&
      content.includes('HEARTBEAT_INTERVAL')) {
    success('Heartbeat interval is properly configured with setInterval');
  } else {
    fail('Heartbeat interval setup not found or incomplete');
  }

  // Test 1.6: Verify heartbeat cleanup
  if (content.includes('clearInterval(heartbeatIntervalRef.current)')) {
    success('Heartbeat cleanup on unmount is implemented');
  } else {
    fail('Heartbeat cleanup not found');
  }
}

function testLockDetectionBrowser() {
  section('2. Browser Lock Detection Tests (screenLockDetector.js)');

  const detectorPath = path.join(__dirname, '..', 'src', 'utils', 'screenLockDetector.js');
  const content = readFile(detectorPath);

  if (!content) return;

  // Test 2.1: Verify IdleDetector API usage
  if (content.includes("'IdleDetector' in window")) {
    success('IdleDetector API check is present');
  } else {
    fail('IdleDetector API check not found');
  }

  // Test 2.2: Verify lock event handling
  if (content.includes('handleScreenLock') && content.includes('handleScreenUnlock')) {
    success('Lock/unlock event handlers are defined');
  } else {
    fail('Lock/unlock event handlers not found');
  }

  // Test 2.3: Verify sleep/wake event handling
  if (content.includes('onSleep') && content.includes('onWake')) {
    success('Sleep/wake callbacks are supported');
  } else {
    fail('Sleep/wake callbacks not found');
  }

  // Test 2.4: Verify Page Lifecycle API
  if (content.includes("'freeze'") && content.includes("'resume'")) {
    success('Page Lifecycle API (freeze/resume) is used for sleep detection');
  } else {
    fail('Page Lifecycle API not found');
  }

  // Test 2.5: Verify heartbeat gap detection
  if (content.includes('heartbeatGap') && content.includes('lastHeartbeatTime')) {
    success('Heartbeat gap detection is implemented as fallback');
  } else {
    fail('Heartbeat gap detection not found');
  }

  // Test 2.6: Verify multiple listener support
  if (content.includes('lockCallbacks') &&
      content.includes('unlockCallbacks') &&
      content.includes('forEach(cb =>')) {
    success('Multiple callback listeners are supported');
  } else {
    fail('Multiple listener support not found');
  }

  // Test 2.7: Verify Electron detection
  if (content.includes('initElectronDetection') &&
      content.includes('window.electronAPI')) {
    success('Electron-specific detection mode is implemented');
  } else {
    fail('Electron detection mode not found');
  }
}

function testElectronIntegration() {
  section('3. Electron Integration Tests');

  const mainPath = path.join(__dirname, '..', '..', 'electron-app', 'main.js');
  const preloadPath = path.join(__dirname, '..', '..', 'electron-app', 'preload.js');
  const bridgePath = path.join(__dirname, '..', 'src', 'utils', 'electronBridge.js');

  const mainContent = readFile(mainPath);
  const preloadContent = readFile(preloadPath);
  const bridgeContent = readFile(bridgePath);

  if (!mainContent || !preloadContent || !bridgeContent) return;

  // Test 3.1: Verify powerMonitor in main.js
  if (mainContent.includes('powerMonitor')) {
    success('powerMonitor is imported in main.js');
  } else {
    fail('powerMonitor not found in main.js');
  }

  // Test 3.2: Verify lock-screen event
  if (mainContent.includes("powerMonitor.on('lock-screen'")) {
    success('lock-screen event listener is registered');
  } else {
    fail('lock-screen event listener not found');
  }

  // Test 3.3: Verify unlock-screen event
  if (mainContent.includes("powerMonitor.on('unlock-screen'")) {
    success('unlock-screen event listener is registered');
  } else {
    fail('unlock-screen event listener not found');
  }

  // Test 3.4: Verify suspend event
  if (mainContent.includes("powerMonitor.on('suspend'")) {
    success('suspend event listener is registered');
  } else {
    fail('suspend event listener not found');
  }

  // Test 3.5: Verify resume event
  if (mainContent.includes("powerMonitor.on('resume'")) {
    success('resume event listener is registered');
  } else {
    fail('resume event listener not found');
  }

  // Test 3.6: Verify lock duration calculation
  if (mainContent.includes('lockDuration') &&
      mainContent.includes('lockStartTime')) {
    success('Lock duration is calculated in main process');
  } else {
    fail('Lock duration calculation not found');
  }

  // Test 3.7: Verify events sent to renderer
  if (mainContent.includes("webContents.send('screen-lock-changed'")) {
    success('Lock events are sent to renderer process');
  } else {
    fail('Screen lock events not sent to renderer');
  }

  // Test 3.8: Verify suspend/resume events sent to renderer
  if (mainContent.includes("webContents.send('system-suspend'") &&
      mainContent.includes("webContents.send('system-resume'")) {
    success('System suspend/resume events are sent to renderer');
  } else {
    fail('Suspend/resume events not sent to renderer');
  }

  // Test 3.9: Verify preload exposes APIs
  if (preloadContent.includes('onScreenLockChanged') &&
      preloadContent.includes('onSystemSuspend') &&
      preloadContent.includes('onSystemResume')) {
    success('Preload script exposes all necessary APIs');
  } else {
    fail('Preload script missing required API exposures');
  }

  // Test 3.10: Verify contextBridge usage
  if (preloadContent.includes('contextBridge.exposeInMainWorld')) {
    success('contextBridge is used for secure API exposure');
  } else {
    fail('contextBridge not found in preload script');
  }

  // Test 3.11: Verify electron bridge detects Electron environment
  if (bridgeContent.includes('window.electronAPI !== undefined')) {
    success('Electron bridge correctly detects Electron environment');
  } else {
    fail('Electron environment detection not found in bridge');
  }
}

function testSessionPersistence() {
  section('4. Session Data Persistence Tests');

  const mainPath = path.join(__dirname, '..', '..', 'electron-app', 'main.js');
  const timeTrackerPath = path.join(__dirname, '..', 'src', 'components', 'TimeTracker.jsx');

  const mainContent = readFile(mainPath);
  const timeTrackerContent = readFile(timeTrackerPath);

  if (!mainContent || !timeTrackerContent) return;

  // Test 4.1: Verify electron-store usage
  if (mainContent.includes("require('electron-store')")) {
    success('electron-store is used for persistent storage');
  } else {
    fail('electron-store not found');
  }

  // Test 4.2: Verify session store
  if (mainContent.includes('sessionStore')) {
    success('Session store is configured');
  } else {
    fail('Session store not found');
  }

  // Test 4.3: Verify lock state persistence
  if (mainContent.includes("sessionStore.set('lockStartTime'")) {
    success('Lock start time is persisted to storage');
  } else {
    fail('Lock state persistence not found');
  }

  // Test 4.4: Verify localStorage usage in renderer
  if (timeTrackerContent.includes("localStorage.setItem('timeTracker_lockState'")) {
    success('Renderer uses localStorage for lock state backup');
  } else {
    fail('localStorage lock state backup not found');
  }

  // Test 4.5: Verify app close state tracking
  if (timeTrackerContent.includes("localStorage.setItem('timeTracker_appCloseState'")) {
    success('App close state is tracked for recovery');
  } else {
    fail('App close state tracking not found');
  }

  // Test 4.6: Verify recovery on app reopen
  if (timeTrackerContent.includes('recoverAppCloseTime')) {
    success('Recovery function exists for app close scenarios');
  } else {
    fail('Recovery function not found');
  }

  // Test 4.7: Verify heartbeat gap analysis
  if (timeTrackerContent.includes('heartbeatGap') &&
      timeTrackerContent.includes('last_heartbeat')) {
    success('Heartbeat gap is analyzed for lock detection during app close');
  } else {
    fail('Heartbeat gap analysis not found');
  }
}

function testEventFlow() {
  section('5. Event Flow Integration Tests');

  const timeTrackerPath = path.join(__dirname, '..', 'src', 'components', 'TimeTracker.jsx');
  const detectorPath = path.join(__dirname, '..', 'src', 'utils', 'screenLockDetector.js');

  const timeTrackerContent = readFile(timeTrackerPath);
  const detectorContent = readFile(detectorPath);

  if (!timeTrackerContent || !detectorContent) return;

  // Test 5.1: Verify detector initialization in TimeTracker
  if (timeTrackerContent.includes('screenLockDetector.init')) {
    success('Lock detector is initialized in TimeTracker');
  } else {
    fail('Lock detector initialization not found');
  }

  // Test 5.2: Verify onLock callback
  if (timeTrackerContent.includes('onLock: ()')) {
    success('onLock callback is registered');
  } else {
    fail('onLock callback not found');
  }

  // Test 5.3: Verify onUnlock callback
  if (timeTrackerContent.includes('onUnlock: (duration)')) {
    success('onUnlock callback is registered with duration parameter');
  } else {
    fail('onUnlock callback not found or missing duration parameter');
  }

  // Test 5.4: Verify onSleep callback
  if (timeTrackerContent.includes('onSleep: ()')) {
    success('onSleep callback is registered');
  } else {
    fail('onSleep callback not found');
  }

  // Test 5.5: Verify onWake callback
  if (timeTrackerContent.includes('onWake: (duration)')) {
    success('onWake callback is registered with duration parameter');
  } else {
    fail('onWake callback not found or missing duration parameter');
  }

  // Test 5.6: Verify inactive time is sent to server
  if (timeTrackerContent.includes('attendanceService.addInactiveTime')) {
    success('Inactive time is sent to server API');
  } else {
    fail('Inactive time API call not found');
  }

  // Test 5.7: Verify double-counting prevention
  if (timeTrackerContent.includes('inactiveTimeReportedRef') &&
      timeTrackerContent.includes('lockEventIdRef')) {
    success('Double-counting prevention mechanisms are in place');
  } else {
    fail('Double-counting prevention not found');
  }

  // Test 5.8: Verify state synchronization
  if (timeTrackerContent.includes('isLockedRef.current') &&
      timeTrackerContent.includes('setIsScreenLocked')) {
    success('Lock state is synchronized between ref and React state');
  } else {
    fail('Lock state synchronization not found');
  }

  // Test 5.9: Verify cleanup on unmount
  if (timeTrackerContent.includes('detectorCleanupRef.current') &&
      timeTrackerContent.includes('return () =>')) {
    success('Detector cleanup is implemented on component unmount');
  } else {
    fail('Detector cleanup not found');
  }
}

function testEdgeCases() {
  section('6. Edge Case Handling Tests');

  const timeTrackerPath = path.join(__dirname, '..', 'src', 'components', 'TimeTracker.jsx');
  const content = readFile(timeTrackerPath);

  if (!content) return;

  // Test 6.1: Verify duplicate lock event prevention
  if (content.includes('if (!isLockedRef.current)') &&
      content.includes('lockEventIdRef.current = Date.now()')) {
    success('Duplicate lock events are prevented');
  } else {
    fail('Duplicate lock event prevention not found');
  }

  // Test 6.2: Verify app close during lock scenario
  if (content.includes('wasLocked') &&
      content.includes('lockStartTime')) {
    success('App close during lock is handled');
  } else {
    fail('App close during lock handling not found');
  }

  // Test 6.3: Verify service worker integration
  if (content.includes('notifyServiceWorker') &&
      content.includes('SET_LOCK_STATE')) {
    success('Service worker is notified of lock state changes');
  } else {
    fail('Service worker integration not found');
  }

  // Test 6.4: Verify sleep/wake + lock/unlock coordination
  if (content.includes('Already reported?') &&
      content.includes('inactiveTimeReportedRef.current')) {
    success('Sleep/wake and lock/unlock events are coordinated to prevent duplication');
  } else {
    fail('Sleep/wake and lock/unlock coordination not found');
  }

  // Test 6.5: Verify minimum lock duration threshold
  if (content.includes('lockDuration > 10')) {
    success('Minimum lock duration threshold (10s) is enforced');
  } else {
    fail('Minimum lock duration threshold not found');
  }

  // Test 6.6: Verify session date validation
  if (content.includes('sessionDate') &&
      content.includes('different date')) {
    success('Lock state is validated against session date');
  } else {
    fail('Session date validation not found');
  }

  // Test 6.7: Verify pending inactive seconds tracking
  if (content.includes('pendingInactiveSecondsRef') &&
      content.includes('lastConfirmedInactiveRef')) {
    success('Pending and confirmed inactive seconds are tracked separately');
  } else {
    fail('Pending inactive seconds tracking not found');
  }
}

function testClosePreventionIntegration() {
  section('7. Close Prevention & Clock Status Tests');

  const mainPath = path.join(__dirname, '..', '..', 'electron-app', 'main.js');
  const timeTrackerPath = path.join(__dirname, '..', 'src', 'components', 'TimeTracker.jsx');

  const mainContent = readFile(mainPath);
  const timeTrackerContent = readFile(timeTrackerPath);

  if (!mainContent || !timeTrackerContent) return;

  // Test 7.1: Verify clock status tracking in main process
  if (mainContent.includes('isUserClockedIn')) {
    success('Main process tracks user clock status');
  } else {
    fail('Clock status tracking not found in main process');
  }

  // Test 7.2: Verify close event handler
  if (mainContent.includes("mainWindow.on('close'") &&
      mainContent.includes('event.preventDefault()')) {
    success('Window close event is intercepted');
  } else {
    fail('Close event interception not found');
  }

  // Test 7.3: Verify warning dialog on close
  if (mainContent.includes('dialog.showMessageBox') &&
      mainContent.includes('Active Work Session')) {
    success('Warning dialog is shown when attempting to close while clocked in');
  } else {
    fail('Close warning dialog not found');
  }

  // Test 7.4: Verify TimeTracker notifies Electron on clock in
  if (timeTrackerContent.includes('electronBridge.setClockStatus(true)')) {
    success('TimeTracker notifies Electron when user clocks in');
  } else {
    fail('Clock in notification to Electron not found');
  }

  // Test 7.5: Verify TimeTracker notifies Electron on clock out
  if (timeTrackerContent.includes('electronBridge.setClockStatus(false)')) {
    success('TimeTracker notifies Electron when user clocks out');
  } else {
    fail('Clock out notification to Electron not found');
  }

  // Test 7.6: Verify beforeunload warning
  if (timeTrackerContent.includes('handleBeforeUnload') &&
      timeTrackerContent.includes('returnValue')) {
    success('Browser beforeunload warning is implemented');
  } else {
    fail('beforeunload warning not found');
  }

  // Test 7.7: Verify tray menu updates
  if (mainContent.includes('updateTrayMenu')) {
    success('Tray menu updates based on clock status');
  } else {
    fail('Tray menu update function not found');
  }
}

// Run all tests
function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', colors.bright + colors.magenta);
  log('║  Work Tracker - Heartbeat & Lock Detection Test Suite     ║', colors.bright + colors.magenta);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.bright + colors.magenta);

  info('Testing heartbeat and lock detection functionality...\n');

  testHeartbeatConfiguration();
  testLockDetectionBrowser();
  testElectronIntegration();
  testSessionPersistence();
  testEventFlow();
  testEdgeCases();
  testClosePreventionIntegration();

  // Print summary
  section('Test Summary');
  log(`Total Tests: ${totalTests}`, colors.bright);
  log(`Passed: ${passedTests}`, colors.green);
  log(`Failed: ${failedTests}`, failedTests > 0 ? colors.red : colors.green);

  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  log(`Pass Rate: ${passRate}%\n`, passRate === 100 ? colors.green : colors.yellow);

  // Print issues if any
  if (issues.length > 0) {
    section('Issues Found');
    issues.forEach((issue, index) => {
      log(`${index + 1}. ${issue.test}`, colors.red);
      if (issue.details) {
        log(`   ${issue.details}`, colors.yellow);
      }
    });
    log('');
  }

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the test suite
runAllTests();
