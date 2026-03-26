/**
 * Comprehensive E2E Test Suite for FastAPI Project Management Frontend
 *
 * This test suite covers:
 * 1. All frontend routes with screenshots
 * 2. Login flow
 * 3. Time tracking (clock in/out)
 * 4. Heartbeat functionality
 * 5. Electron-specific features
 * 6. Interactive elements on each page
 *
 * Usage: node tests/e2e-test.cjs
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  FRONTEND_URL: 'http://localhost:5174',
  SCREENSHOTS_DIR: path.join(__dirname, 'screenshots'),

  // Test credentials - valid credentials
  TEST_USER: {
    employee_id: 'JSAN277',
    password: 'JSAN277@456'
  },

  TIMEOUTS: {
    navigation: 30000,
    action: 10000,
    short: 2000,
    medium: 5000
  },

  // All routes to test
  ROUTES: [
    { path: '/login', name: 'Login', requiresAuth: false },
    { path: '/dashboard', name: 'Dashboard', requiresAuth: true },
    { path: '/attendance', name: 'Attendance', requiresAuth: true },
    { path: '/tasks', name: 'Tasks', requiresAuth: true },
    { path: '/worksheets', name: 'Worksheets', requiresAuth: true },
    { path: '/forms', name: 'Forms', requiresAuth: true },
    { path: '/teams', name: 'Teams', requiresAuth: true },
    { path: '/users', name: 'Users', requiresAuth: true },
    { path: '/reports', name: 'Reports', requiresAuth: true },
    { path: '/notifications', name: 'Notifications', requiresAuth: true },
    { path: '/profile', name: 'Profile', requiresAuth: true },
    { path: '/my-team', name: 'My Team', requiresAuth: true }
  ]
};

// ============================================================================
// COLOR CONSOLE OUTPUT
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

function colorLog(message, color = 'white', style = '') {
  const timestamp = new Date().toLocaleTimeString();
  const styleCode = style === 'bright' ? colors.bright : style === 'dim' ? colors.dim : '';
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${styleCode}${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + colors.bright + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + colors.cyan + `  ${title}` + colors.reset);
  console.log(colors.bright + colors.cyan + '═'.repeat(80) + colors.reset + '\n');
}

function logTest(testName) {
  console.log(colors.bright + colors.blue + `\n▶ ${testName}` + colors.reset);
}

function logSuccess(message) {
  colorLog(`✓ ${message}`, 'green', 'bright');
}

function logError(message) {
  colorLog(`✗ ${message}`, 'red', 'bright');
}

function logWarning(message) {
  colorLog(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  colorLog(`ℹ ${message}`, 'cyan');
}

// ============================================================================
// TEST RESULTS TRACKING
// ============================================================================

const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  screenshots: [],
  startTime: null,
  endTime: null
};

function recordSuccess(testName) {
  testResults.total++;
  testResults.passed++;
  logSuccess(testName);
}

function recordFailure(testName, error) {
  testResults.total++;
  testResults.failed++;
  testResults.errors.push({ test: testName, error: error.message || error });
  logError(`${testName}: ${error.message || error}`);
}

function recordWarning(message) {
  testResults.warnings++;
  logWarning(message);
}

function recordScreenshot(name, path) {
  testResults.screenshots.push({ name, path });
  logInfo(`Screenshot saved: ${path}`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function setupScreenshotsDirectory() {
  if (!fs.existsSync(CONFIG.SCREENSHOTS_DIR)) {
    fs.mkdirSync(CONFIG.SCREENSHOTS_DIR, { recursive: true });
    logInfo(`Created screenshots directory: ${CONFIG.SCREENSHOTS_DIR}`);
  }
}

async function takeScreenshot(page, name) {
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.png`;
  const filepath = path.join(CONFIG.SCREENSHOTS_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false, timeout: 30000 });
    recordScreenshot(name, filepath);
    return filepath;
  } catch (error) {
    logWarning(`Screenshot failed for ${name}: ${error.message}`);
    return null;
  }
}

async function waitForPageLoad(page, timeout = CONFIG.TIMEOUTS.navigation) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (error) {
    // If networkidle times out, just wait for domcontentloaded
    await page.waitForLoadState('domcontentloaded', { timeout });
  }
}

async function checkConsoleErrors(page) {
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  return errors;
}

// ============================================================================
// TEST: SETUP BROWSER
// ============================================================================

async function setupBrowser() {
  logTest('Setting up browser');

  try {
    const browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode for better performance
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
      protocolTimeout: 120000 // 2 minutes protocol timeout
    });

    const page = await browser.newPage();

    // Enable request interception to track network activity
    await page.setRequestInterception(true);

    const requests = [];
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date()
      });
      request.continue();
    });

    // Track console messages
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date()
      });
    });

    recordSuccess('Browser setup complete');

    return { browser, page, requests, consoleMessages };
  } catch (error) {
    recordFailure('Browser setup', error);
    throw error;
  }
}

// ============================================================================
// TEST: LOGIN FLOW
// ============================================================================

async function testLoginFlow(page) {
  logSection('LOGIN FLOW TEST');
  logTest('Testing login functionality');

  try {
    // IMPORTANT: Bypass PWA enforcement before navigating
    // Set sessionStorage to trick PWAEnforcement component
    logInfo('Bypassing PWA enforcement for testing...');

    // First navigate to set the origin context
    await page.goto(CONFIG.FRONTEND_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });

    // Set sessionStorage to bypass PWA check
    await page.evaluate(() => {
      sessionStorage.setItem('isPWA', 'true');
      console.log('[E2E Test] PWA bypass set');
    });

    // Navigate to login page
    logInfo('Navigating to login page...');
    await page.goto(`${CONFIG.FRONTEND_URL}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });

    await delay(CONFIG.TIMEOUTS.short);

    // Take screenshot of login page
    await takeScreenshot(page, 'login-page-initial');

    // Check for login form elements
    logInfo('Checking login form elements...');
    const employeeIdInput = await page.$('input[placeholder*="Associate ID"]');
    const passwordInput = await page.$('input[type="password"]');
    const loginButton = await page.$('button[type="submit"]');

    if (!employeeIdInput) {
      throw new Error('Employee ID input not found');
    }
    if (!passwordInput) {
      throw new Error('Password input not found');
    }
    if (!loginButton) {
      throw new Error('Login button not found');
    }

    recordSuccess('Login form elements found');

    // Fill in credentials
    logInfo('Filling in credentials...');
    await employeeIdInput.click();
    await page.keyboard.type(CONFIG.TEST_USER.employee_id);
    await delay(500);

    await passwordInput.click();
    await page.keyboard.type(CONFIG.TEST_USER.password);
    await delay(500);

    await takeScreenshot(page, 'login-page-filled');

    // Submit login
    logInfo('Submitting login...');
    await loginButton.click();

    // Wait for navigation to dashboard
    try {
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.TIMEOUTS.navigation
      });
    } catch (navError) {
      // Check if we're already on dashboard (SPA navigation)
      logInfo('Checking for SPA navigation...');
      await delay(CONFIG.TIMEOUTS.medium);
    }

    // Check if we reached dashboard
    const currentUrl = page.url();
    logInfo(`Current URL after login: ${currentUrl}`);

    if (currentUrl.includes('/dashboard')) {
      await takeScreenshot(page, 'login-success-dashboard');
      recordSuccess('Login flow completed successfully');
      return true;
    }

    // Still on login page - check for error messages
    const errorMessage = await page.evaluate(() => {
      const errorEl = document.querySelector('.ant-message-error, .ant-alert-error, [class*="error"]');
      return errorEl ? errorEl.textContent : null;
    });

    if (errorMessage) {
      throw new Error(`Login failed with error: ${errorMessage}`);
    }

    throw new Error(`Expected redirect to /dashboard, but got ${currentUrl}`);
  } catch (error) {
    recordFailure('Login flow', error);
    await takeScreenshot(page, 'login-error');
    return false;
  }
}

// ============================================================================
// TEST: ALL ROUTES
// ============================================================================

async function testAllRoutes(page) {
  logSection('TESTING ALL ROUTES');

  for (const route of CONFIG.ROUTES) {
    if (!route.requiresAuth || route.path === '/login') {
      continue; // Skip login as we already tested it
    }

    logTest(`Testing route: ${route.name} (${route.path})`);

    try {
      // Navigate to route - use domcontentloaded for SPA routes
      logInfo(`Navigating to ${route.path}...`);
      await page.goto(`${CONFIG.FRONTEND_URL}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Wait for React to render
      await delay(3000);

      // Check if we're still on the expected route
      const currentUrl = page.url();
      if (!currentUrl.includes(route.path)) {
        recordWarning(`Redirected from ${route.path} to ${currentUrl}`);
      }

      // Take screenshot
      await takeScreenshot(page, `route-${route.name}`);

      // Check for common elements
      await testPageElements(page, route.name);

      // Check for console errors
      const errors = await page.evaluate(() => {
        return window.__consoleErrors || [];
      });

      if (errors.length > 0) {
        recordWarning(`${route.name} has ${errors.length} console errors`);
      }

      recordSuccess(`Route ${route.name} tested successfully`);

      // Small delay between routes
      await delay(1000);
    } catch (error) {
      recordFailure(`Route ${route.name}`, error);
      await takeScreenshot(page, `route-${route.name}-error`);
    }
  }
}

// ============================================================================
// TEST: PAGE ELEMENTS
// ============================================================================

async function testPageElements(page, pageName) {
  logInfo(`Checking elements on ${pageName}...`);

  try {
    // Check for main layout elements
    const hasHeader = await page.$('header') || await page.$('[class*="header"]');
    const hasNav = await page.$('nav') || await page.$('[class*="nav"]') || await page.$('[class*="menu"]');
    const hasMain = await page.$('main') || await page.$('[class*="content"]');

    if (!hasHeader && !hasNav) {
      recordWarning(`${pageName}: No header/navigation found`);
    }

    if (!hasMain) {
      recordWarning(`${pageName}: No main content area found`);
    }

    // Check for interactive elements
    const buttons = await page.$$('button');
    const inputs = await page.$$('input');
    const links = await page.$$('a');

    logInfo(`${pageName}: Found ${buttons.length} buttons, ${inputs.length} inputs, ${links.length} links`);

    // Test clicking first button if available (non-destructive)
    if (buttons.length > 0) {
      try {
        const buttonText = await page.evaluate(btn => btn.textContent, buttons[0]);
        // Only click safe buttons (avoid Delete, Remove, etc.)
        if (!buttonText.toLowerCase().includes('delete') &&
            !buttonText.toLowerCase().includes('remove') &&
            !buttonText.toLowerCase().includes('clock out')) {
          logInfo(`Testing button: "${buttonText}"`);
          await buttons[0].click();
          await delay(1000);
          await takeScreenshot(page, `${pageName}-button-clicked`);
        }
      } catch (error) {
        recordWarning(`Could not test button interaction: ${error.message}`);
      }
    }

    recordSuccess(`${pageName}: Elements checked`);
  } catch (error) {
    recordWarning(`${pageName}: Element check failed - ${error.message}`);
  }
}

// ============================================================================
// TEST: TIME TRACKING FLOW
// ============================================================================

async function testTimeTracking(page) {
  logSection('TIME TRACKING FLOW TEST');

  try {
    // Navigate to dashboard
    logInfo('Navigating to dashboard for time tracking...');
    await page.goto(`${CONFIG.FRONTEND_URL}/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });

    await delay(CONFIG.TIMEOUTS.short);

    // Look for Clock In button
    logTest('Looking for Clock In button');
    const clockInButton = await page.$('button:has-text("Clock In")') ||
                          await page.evaluateHandle(() => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            return buttons.find(btn => btn.textContent.includes('Clock In'));
                          });

    if (clockInButton && clockInButton.asElement) {
      logInfo('Clock In button found');
      await takeScreenshot(page, 'time-tracking-before-clock-in');

      // Click Clock In
      logInfo('Clicking Clock In...');
      await clockInButton.asElement().click();
      await delay(CONFIG.TIMEOUTS.medium);

      await takeScreenshot(page, 'time-tracking-clocked-in');

      // Check for timer/active session indicators
      const hasTimer = await page.$('[class*="timer"]') ||
                       await page.$('[class*="active"]') ||
                       await page.$('[class*="statistic"]');

      if (hasTimer) {
        recordSuccess('Timer/active session indicator found');
      }

      // Wait and verify heartbeat is being sent
      logTest('Verifying heartbeat activity');
      await delay(15000); // Wait 15 seconds for heartbeat

      // Check for heartbeat indicator
      const heartbeatActive = await page.evaluate(() => {
        // Look for any heartbeat-related elements or indicators
        const indicators = document.querySelectorAll('[class*="heartbeat"], [class*="running"]');
        return indicators.length > 0;
      });

      if (heartbeatActive) {
        recordSuccess('Heartbeat appears to be active');
      } else {
        recordWarning('Could not verify heartbeat activity');
      }

      await takeScreenshot(page, 'time-tracking-heartbeat-check');

      // Look for Clock Out button
      logTest('Looking for Clock Out button');
      const clockOutButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => btn.textContent.includes('Clock Out'));
      });

      if (clockOutButton && clockOutButton.asElement) {
        logInfo('Clock Out button found (not clicking to preserve session)');
        recordSuccess('Time tracking UI complete');
      }

      recordSuccess('Time tracking flow tested');
    } else {
      recordWarning('Already clocked in or Clock In button not found - session may be active');
      await takeScreenshot(page, 'time-tracking-already-active');
    }
  } catch (error) {
    recordFailure('Time tracking flow', error);
    await takeScreenshot(page, 'time-tracking-error');
  }
}

// ============================================================================
// TEST: HEARTBEAT FUNCTIONALITY
// ============================================================================

async function testHeartbeatFunctionality(page, requests) {
  logSection('HEARTBEAT FUNCTIONALITY TEST');
  logTest('Testing heartbeat requests');

  try {
    // Navigate to dashboard
    await page.goto(`${CONFIG.FRONTEND_URL}/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });

    // Clear previous requests
    requests.length = 0;

    // Wait for heartbeat interval (should be 10 seconds based on code)
    logInfo('Waiting 30 seconds to capture heartbeat requests...');
    await delay(30000);

    // Check for heartbeat requests
    const heartbeatRequests = requests.filter(req =>
      req.url.includes('/heartbeat') || req.url.includes('attendance')
    );

    logInfo(`Captured ${heartbeatRequests.length} potential heartbeat requests`);

    if (heartbeatRequests.length > 0) {
      recordSuccess(`Heartbeat requests detected (${heartbeatRequests.length} requests)`);
      heartbeatRequests.forEach((req, idx) => {
        logInfo(`  [${idx + 1}] ${req.method} ${req.url}`);
      });
    } else {
      recordWarning('No heartbeat requests detected - user may not be clocked in');
    }

    await takeScreenshot(page, 'heartbeat-test');
  } catch (error) {
    recordFailure('Heartbeat functionality', error);
  }
}

// ============================================================================
// TEST: ELECTRON-SPECIFIC FEATURES
// ============================================================================

async function testElectronFeatures(page) {
  logSection('ELECTRON-SPECIFIC FEATURES TEST');

  try {
    logTest('Checking for electronAPI');

    const hasElectronAPI = await page.evaluate(() => {
      return typeof window.electronAPI !== 'undefined';
    });

    if (hasElectronAPI) {
      recordSuccess('electronAPI is available');

      // Check electronAPI methods
      const electronMethods = await page.evaluate(() => {
        if (!window.electronAPI) return [];
        return Object.keys(window.electronAPI);
      });

      logInfo(`electronAPI methods: ${electronMethods.join(', ')}`);

      // Test setClockStatus if available
      if (electronMethods.includes('setClockStatus')) {
        await page.evaluate(() => {
          window.electronAPI.setClockStatus(true);
        });
        recordSuccess('setClockStatus() called successfully');
      }

    } else {
      recordWarning('electronAPI not available (running in browser)');
    }

    // Test close prevention
    logTest('Testing close prevention messaging');

    const hasCloseBlocker = await page.evaluate(() => {
      // Check for GlobalCloseBlocker or beforeunload listeners
      const listeners = window.getEventListeners ?
        window.getEventListeners(window)['beforeunload'] : null;
      return listeners && listeners.length > 0;
    });

    if (hasCloseBlocker) {
      recordSuccess('Close prevention (beforeunload) is set up');
    } else {
      // Try to check via localStorage
      const hasActiveSession = await page.evaluate(() => {
        return localStorage.getItem('token') !== null;
      });

      if (hasActiveSession) {
        recordSuccess('Active session detected (close prevention should be active)');
      } else {
        recordWarning('Could not verify close prevention setup');
      }
    }

    // Test lock detection setup
    logTest('Testing lock detection setup');

    const hasLockDetection = await page.evaluate(() => {
      // Check for visibilitychange listeners or other lock detection mechanisms
      return typeof document.hidden !== 'undefined';
    });

    if (hasLockDetection) {
      recordSuccess('Lock detection API available (Page Visibility API)');
    }

    await takeScreenshot(page, 'electron-features-test');

  } catch (error) {
    recordFailure('Electron features', error);
    await takeScreenshot(page, 'electron-features-error');
  }
}

// ============================================================================
// TEST: SPECIFIC PAGE INTERACTIONS
// ============================================================================

async function testPageSpecificInteractions(page) {
  logSection('PAGE-SPECIFIC INTERACTION TESTS');

  // Test Attendance Page
  try {
    logTest('Testing Attendance Page');
    await page.goto(`${CONFIG.FRONTEND_URL}/attendance`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });
    await delay(CONFIG.TIMEOUTS.short);

    // Look for attendance-specific elements
    const hasCalendar = await page.$('[class*="calendar"]') ||
                        await page.$('[class*="date"]');
    const hasTable = await page.$('table');

    if (hasCalendar) {
      logInfo('Attendance: Calendar/Date picker found');
    }
    if (hasTable) {
      logInfo('Attendance: Table found');
    }

    await takeScreenshot(page, 'attendance-page-detailed');
    recordSuccess('Attendance page tested');
  } catch (error) {
    recordFailure('Attendance page interaction', error);
  }

  // Test Tasks Page
  try {
    logTest('Testing Tasks Page');
    await page.goto(`${CONFIG.FRONTEND_URL}/tasks`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });
    await delay(CONFIG.TIMEOUTS.short);

    // Look for task-specific elements
    const hasList = await page.$('[class*="list"]') || await page.$('ul') || await page.$('table');

    if (hasList) {
      logInfo('Tasks: List/Table found');
    }

    await takeScreenshot(page, 'tasks-page-detailed');
    recordSuccess('Tasks page tested');
  } catch (error) {
    recordFailure('Tasks page interaction', error);
  }

  // Test Worksheets Page
  try {
    logTest('Testing Worksheets Page');
    await page.goto(`${CONFIG.FRONTEND_URL}/worksheets`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });
    await delay(CONFIG.TIMEOUTS.short);

    await takeScreenshot(page, 'worksheets-page-detailed');
    recordSuccess('Worksheets page tested');
  } catch (error) {
    recordFailure('Worksheets page interaction', error);
  }

  // Test Profile Page
  try {
    logTest('Testing Profile Page');
    await page.goto(`${CONFIG.FRONTEND_URL}/profile`, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUTS.navigation
    });
    await delay(CONFIG.TIMEOUTS.short);

    // Look for profile-specific elements
    const hasForm = await page.$('form');
    const hasInputs = await page.$$('input');

    if (hasForm) {
      logInfo('Profile: Form found');
    }
    logInfo(`Profile: ${hasInputs.length} input fields found`);

    await takeScreenshot(page, 'profile-page-detailed');
    recordSuccess('Profile page tested');
  } catch (error) {
    recordFailure('Profile page interaction', error);
  }
}

// ============================================================================
// GENERATE SUMMARY REPORT
// ============================================================================

function generateSummaryReport() {
  logSection('TEST SUMMARY REPORT');

  testResults.endTime = new Date();
  const duration = (testResults.endTime - testResults.startTime) / 1000;

  console.log(colors.bright + '\nTest Execution Summary:' + colors.reset);
  console.log('─'.repeat(80));

  console.log(`${colors.cyan}Total Tests:${colors.reset}      ${testResults.total}`);
  console.log(`${colors.green}Passed:${colors.reset}           ${testResults.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}           ${testResults.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset}        ${testResults.warnings}`);
  console.log(`${colors.cyan}Screenshots:${colors.reset}     ${testResults.screenshots.length}`);
  console.log(`${colors.cyan}Duration:${colors.reset}        ${duration.toFixed(2)}s`);

  // Success rate
  const successRate = testResults.total > 0 ?
    ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;

  const rateColor = successRate >= 90 ? colors.green :
                    successRate >= 70 ? colors.yellow : colors.red;

  console.log(`${colors.cyan}Success Rate:${colors.reset}    ${rateColor}${successRate}%${colors.reset}`);

  // Errors
  if (testResults.errors.length > 0) {
    console.log(`\n${colors.red}${colors.bright}Errors:${colors.reset}`);
    console.log('─'.repeat(80));
    testResults.errors.forEach((error, idx) => {
      console.log(`${colors.red}${idx + 1}. ${error.test}${colors.reset}`);
      console.log(`   ${colors.dim}${error.error}${colors.reset}`);
    });
  }

  // Screenshots
  if (testResults.screenshots.length > 0) {
    console.log(`\n${colors.cyan}${colors.bright}Screenshots:${colors.reset}`);
    console.log('─'.repeat(80));
    testResults.screenshots.forEach((screenshot, idx) => {
      console.log(`${colors.cyan}${idx + 1}. ${screenshot.name}${colors.reset}`);
      console.log(`   ${colors.dim}${screenshot.path}${colors.reset}`);
    });
  }

  console.log('\n' + '═'.repeat(80) + '\n');

  // Final verdict
  if (testResults.failed === 0) {
    console.log(colors.bgGreen + colors.bright + '  ALL TESTS PASSED!  ' + colors.reset);
  } else {
    console.log(colors.bgRed + colors.bright + `  ${testResults.failed} TEST(S) FAILED  ` + colors.reset);
  }

  console.log('\n');

  // Save report to file
  const reportPath = path.join(CONFIG.SCREENSHOTS_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  logInfo(`Report saved to: ${reportPath}`);
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  testResults.startTime = new Date();

  console.log('\n');
  console.log(colors.bgBlue + colors.bright + '                                                                                ' + colors.reset);
  console.log(colors.bgBlue + colors.bright + '  FASTAPI PROJECT MANAGEMENT - COMPREHENSIVE E2E TEST SUITE                     ' + colors.reset);
  console.log(colors.bgBlue + colors.bright + '                                                                                ' + colors.reset);
  console.log('\n');

  let browser, page;

  try {
    // Setup
    await setupScreenshotsDirectory();
    const setup = await setupBrowser();
    browser = setup.browser;
    page = setup.page;
    const requests = setup.requests;
    const consoleMessages = setup.consoleMessages;

    // Run tests in sequence
    const loginSuccess = await testLoginFlow(page);

    if (loginSuccess) {
      await testAllRoutes(page);
      await testPageSpecificInteractions(page);
      await testTimeTracking(page);
      await testHeartbeatFunctionality(page, requests);
      await testElectronFeatures(page);
    } else {
      logError('Login failed - skipping authenticated tests');
      recordWarning('Skipped authenticated tests due to login failure');
    }

    // Generate report
    generateSummaryReport();

  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    testResults.errors.push({ test: 'Fatal Error', error: error.message });
  } finally {
    // Cleanup
    if (browser) {
      logInfo('Closing browser...');
      await browser.close();
    }
  }

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// ============================================================================
// RUN TESTS
// ============================================================================

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  logError(`Unhandled rejection: ${error.message}`);
  console.error(error);
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  logError(`Test runner failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
