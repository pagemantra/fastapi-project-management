/**
 * Electron App Test Suite
 * Tests the Electron-specific functionality including:
 * - Window creation
 * - Close prevention
 * - Tray functionality
 * - IPC communication
 * - Power monitor events
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(type, message) {
  const prefix = {
    info: `${colors.blue}[INFO]${colors.reset}`,
    pass: `${colors.green}[PASS]${colors.reset}`,
    fail: `${colors.red}[FAIL]${colors.reset}`,
    warn: `${colors.yellow}[WARN]${colors.reset}`,
    section: `${colors.cyan}${colors.bold}`,
  };
  console.log(`${prefix[type]} ${message}${type === 'section' ? colors.reset : ''}`);
}

function test(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    log('pass', name);
  } else {
    results.failed++;
    log('fail', `${name}${details ? ': ' + details : ''}`);
  }
}

// Test: Check if all required files exist
function testFileStructure() {
  log('section', '\n=== File Structure Tests ===\n');

  const electronAppDir = path.join(__dirname, '..');
  const requiredFiles = [
    'package.json',
    'main.js',
    'preload.js',
  ];

  requiredFiles.forEach(file => {
    const filePath = path.join(electronAppDir, file);
    const exists = fs.existsSync(filePath);
    test(`File exists: ${file}`, exists);
  });
}

// Test: Verify package.json configuration
function testPackageConfig() {
  log('section', '\n=== Package Configuration Tests ===\n');

  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  test('Package has name', !!pkg.name);
  test('Package has version', !!pkg.version);
  test('Package has main entry', pkg.main === 'main.js');
  test('Package has electron dependency', !!pkg.devDependencies?.electron);
  test('Package has electron-builder', !!pkg.devDependencies?.['electron-builder']);
  test('Package has electron-store', !!pkg.dependencies?.['electron-store']);
  test('Package has auto-launch', !!pkg.dependencies?.['auto-launch']);
  test('Package has build configuration', !!pkg.build);
  test('Build has appId', !!pkg.build?.appId);
  test('Build has Windows target', !!pkg.build?.win);
}

// Test: Verify main.js functionality
function testMainProcess() {
  log('section', '\n=== Main Process Tests ===\n');

  const mainPath = path.join(__dirname, '..', 'main.js');
  const mainContent = fs.readFileSync(mainPath, 'utf8');

  // Check for critical functionality
  test('Has BrowserWindow import', mainContent.includes('BrowserWindow'));
  test('Has powerMonitor import', mainContent.includes('powerMonitor'));
  test('Has Tray import', mainContent.includes('Tray'));
  test('Has Menu import', mainContent.includes('Menu'));
  test('Has electron-store usage', mainContent.includes("require('electron-store')"));
  test('Has auto-launch usage', mainContent.includes("require('auto-launch')"));

  // Check for close prevention
  test('Has close prevention logic', mainContent.includes("on('close'"));
  test('Has isQuitting flag', mainContent.includes('isQuitting'));
  test('Has minimize to tray', mainContent.includes('mainWindow.hide()'));

  // Check for power monitor events
  test('Has lock-screen handler', mainContent.includes("'lock-screen'"));
  test('Has unlock-screen handler', mainContent.includes("'unlock-screen'"));
  test('Has suspend handler', mainContent.includes("'suspend'"));
  test('Has resume handler', mainContent.includes("'resume'"));

  // Check for IPC handlers
  test('Has clock-status-changed IPC', mainContent.includes("'clock-status-changed'"));
  test('Has get-session-data IPC', mainContent.includes("'get-session-data'"));
  test('Has screen-lock-changed event', mainContent.includes("'screen-lock-changed'"));
}

// Test: Verify preload.js functionality
function testPreload() {
  log('section', '\n=== Preload Script Tests ===\n');

  const preloadPath = path.join(__dirname, '..', 'preload.js');
  const preloadContent = fs.readFileSync(preloadPath, 'utf8');

  // Check for contextBridge usage
  test('Uses contextBridge', preloadContent.includes('contextBridge'));
  test('Exposes electronAPI', preloadContent.includes('electronAPI'));

  // Check for exposed APIs
  test('Exposes setClockStatus', preloadContent.includes('setClockStatus'));
  test('Exposes getSessionData', preloadContent.includes('getSessionData'));
  test('Exposes onScreenLockChanged', preloadContent.includes('onScreenLockChanged'));
  test('Exposes onSystemSuspend', preloadContent.includes('onSystemSuspend'));
  test('Exposes onSystemResume', preloadContent.includes('onSystemResume'));
  test('Exposes minimizeToTray', preloadContent.includes('minimizeToTray'));
  test('Exposes getLockState', preloadContent.includes('getLockState'));
}

// Test: Verify frontend integration
function testFrontendIntegration() {
  log('section', '\n=== Frontend Integration Tests ===\n');

  const frontendDir = path.join(__dirname, '..', '..', 'frontend', 'src');

  // Check for electronBridge
  const bridgePath = path.join(frontendDir, 'utils', 'electronBridge.js');
  const bridgeExists = fs.existsSync(bridgePath);
  test('electronBridge.js exists', bridgeExists);

  if (bridgeExists) {
    const bridgeContent = fs.readFileSync(bridgePath, 'utf8');
    test('Bridge checks for Electron', bridgeContent.includes('window.electronAPI'));
    test('Bridge has setClockStatus', bridgeContent.includes('setClockStatus'));
    test('Bridge has initLockDetection', bridgeContent.includes('initLockDetection'));
  }

  // Check for useElectron hook
  const hookPath = path.join(frontendDir, 'hooks', 'useElectron.js');
  const hookExists = fs.existsSync(hookPath);
  test('useElectron.js exists', hookExists);

  // Check TimeTracker integration
  const trackerPath = path.join(frontendDir, 'components', 'TimeTracker.jsx');
  if (fs.existsSync(trackerPath)) {
    const trackerContent = fs.readFileSync(trackerPath, 'utf8');
    test('TimeTracker imports electronBridge', trackerContent.includes('electronBridge'));
    test('TimeTracker sets clock status', trackerContent.includes('setClockStatus'));
  }

  // Check screenLockDetector integration
  const detectorPath = path.join(frontendDir, 'utils', 'screenLockDetector.js');
  if (fs.existsSync(detectorPath)) {
    const detectorContent = fs.readFileSync(detectorPath, 'utf8');
    test('screenLockDetector has Electron support', detectorContent.includes('isElectron'));
    test('screenLockDetector has initElectronDetection', detectorContent.includes('initElectronDetection'));
  }
}

// Test: Verify build configuration
function testBuildConfig() {
  log('section', '\n=== Build Configuration Tests ===\n');

  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const build = pkg.build;

  test('Has productName', !!build?.productName);
  test('Has directories config', !!build?.directories);
  test('Has files config', !!build?.files);
  test('Has extraResources for frontend', !!build?.extraResources);

  // Windows specific
  test('Has Windows NSIS config', !!build?.nsis);
  test('NSIS creates desktop shortcut', build?.nsis?.createDesktopShortcut === true);
  test('NSIS creates start menu shortcut', build?.nsis?.createStartMenuShortcut === true);
}

// Print summary
function printSummary() {
  log('section', '\n=== Test Summary ===\n');

  console.log(`${colors.bold}Results:${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${results.failed}${colors.reset}`);
  console.log(`  Total:  ${results.passed + results.failed}`);
  console.log(`  Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%\n`);

  if (results.failed > 0) {
    console.log(`${colors.yellow}Failed Tests:${colors.reset}`);
    results.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`  - ${t.name}${t.details ? `: ${t.details}` : ''}`));
    console.log();
  }

  if (results.failed === 0) {
    console.log(`${colors.green}${colors.bold}All tests passed! The Electron app is ready for building.${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}${colors.bold}Some tests failed. Please fix the issues before building.${colors.reset}\n`);
  }
}

// Run all tests
async function runTests() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║            Work Tracker Electron App - Test Suite              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  testFileStructure();
  testPackageConfig();
  testMainProcess();
  testPreload();
  testFrontendIntegration();
  testBuildConfig();
  printSummary();

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests();
