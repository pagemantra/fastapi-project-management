const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8000';

// Test users
const TEST_USERS = [
  { role: 'Associate', username: 'JSAN313', password: 'JSAN313@456', name: 'Nayak Naveen Babu' },
  { role: 'Team Lead', username: 'JSAN267', password: 'JSAN267@456', name: 'Shaik Abdul Resheed' },
  { role: 'Manager', username: 'JSAN261', password: 'JSAN261@456', name: 'Hari Priya' },
  { role: 'Admin', username: 'JSAN252', password: 'JSAN252@456', name: 'Venkata Nancharaiah' }
];

// Pages to test for each role
const PAGES = {
  'Associate': [
    { name: 'Dashboard', path: '/', waitFor: '.ant-layout-content' },
    { name: 'Profile', path: '/profile', waitFor: '.ant-descriptions' },
    { name: 'Tasks', path: '/tasks', waitFor: '.ant-table' },
    { name: 'Attendance', path: '/attendance', waitFor: '.ant-card' },
    { name: 'Worksheets', path: '/worksheets', waitFor: '.ant-card' }
  ],
  'Team Lead': [
    { name: 'Dashboard', path: '/', waitFor: '.ant-layout-content' },
    { name: 'Profile', path: '/profile', waitFor: '.ant-descriptions' },
    { name: 'Tasks', path: '/tasks', waitFor: '.ant-table' },
    { name: 'Attendance', path: '/attendance', waitFor: '.ant-card' },
    { name: 'Worksheets', path: '/worksheets', waitFor: '.ant-card' },
    { name: 'My Team', path: '/my-team', waitFor: '.ant-card' }
  ],
  'Manager': [
    { name: 'Dashboard', path: '/', waitFor: '.ant-layout-content' },
    { name: 'Profile', path: '/profile', waitFor: '.ant-descriptions' },
    { name: 'Tasks', path: '/tasks', waitFor: '.ant-table' },
    { name: 'Attendance', path: '/attendance', waitFor: '.ant-card' },
    { name: 'Worksheets', path: '/worksheets', waitFor: '.ant-card' },
    { name: 'Teams', path: '/teams', waitFor: '.ant-card' },
    { name: 'Reports', path: '/reports', waitFor: '.ant-card' },
    { name: 'Forms', path: '/forms', waitFor: '.ant-card' }
  ],
  'Admin': [
    { name: 'Dashboard', path: '/', waitFor: '.ant-layout-content' },
    { name: 'Profile', path: '/profile', waitFor: '.ant-descriptions' },
    { name: 'Tasks', path: '/tasks', waitFor: '.ant-table' },
    { name: 'Attendance', path: '/attendance', waitFor: '.ant-card' },
    { name: 'Worksheets', path: '/worksheets', waitFor: '.ant-card' },
    { name: 'Teams', path: '/teams', waitFor: '.ant-card' },
    { name: 'Reports', path: '/reports', waitFor: '.ant-card' },
    { name: 'Users', path: '/users', waitFor: '.ant-table' },
    { name: 'Forms', path: '/forms', waitFor: '.ant-card' }
  ]
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  issues: []
};

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Create reports directory
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'pass' ? '✓' : type === 'fail' ? '✗' : type === 'warn' ? '⚠' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function checkServers() {
  log('Checking if servers are running...');

  try {
    const http = require('http');

    // Check backend
    await new Promise((resolve, reject) => {
      const req = http.get(BACKEND_URL + '/health', (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Backend returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Backend timeout')));
    });
    log('Backend is running', 'pass');

    // Check frontend
    await new Promise((resolve, reject) => {
      const req = http.get(FRONTEND_URL, (res) => {
        resolve();
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Frontend timeout')));
    });
    log('Frontend is running', 'pass');

    return true;
  } catch (error) {
    log(`Server check failed: ${error.message}`, 'fail');
    return false;
  }
}

async function login(page, username, password) {
  try {
    log(`Logging in as ${username}...`);

    // Wait for login page to load
    await page.goto(FRONTEND_URL + '/login', { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for login form
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });

    // Enter credentials
    await page.type('input[type="text"]', username);
    await page.type('input[type="password"]', password);

    // Take screenshot before login
    await page.screenshot({
      path: path.join(screenshotsDir, `${username}_01_login_form.png`),
      fullPage: true
    });

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

    // Check if login successful (should redirect to dashboard)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }

    log(`Logged in as ${username}`, 'pass');
    return true;
  } catch (error) {
    log(`Login failed for ${username}: ${error.message}`, 'fail');
    await page.screenshot({
      path: path.join(screenshotsDir, `${username}_login_error.png`),
      fullPage: true
    });
    throw error;
  }
}

async function testPage(page, user, pageInfo) {
  testResults.total++;
  const consoleLogs = [];
  const errors = [];

  try {
    log(`Testing ${user.role}: ${pageInfo.name} page...`);

    // Monitor console logs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        log(`Console error on ${pageInfo.name}: ${text}`, 'warn');
      }
    });

    // Monitor page errors
    page.on('pageerror', error => {
      errors.push(error.message);
      log(`Page error on ${pageInfo.name}: ${error.message}`, 'fail');
    });

    // Navigate to page
    const response = await page.goto(FRONTEND_URL + pageInfo.path, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Check for 404
    if (response.status() === 404) {
      throw new Error('404 - Page not found');
    }

    if (response.status() >= 400) {
      throw new Error(`HTTP ${response.status()} error`);
    }

    // Wait for main content to load
    try {
      await page.waitForSelector(pageInfo.waitFor, { timeout: 10000 });
    } catch (err) {
      log(`Warning: Expected selector "${pageInfo.waitFor}" not found on ${pageInfo.name}`, 'warn');
    }

    // Wait a bit for any async data loading
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take screenshot
    const screenshotName = `${user.username}_${pageInfo.name.replace(/\s+/g, '_')}.png`;
    await page.screenshot({
      path: path.join(screenshotsDir, screenshotName),
      fullPage: true
    });

    // Check for error messages in the page
    const errorMessages = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.ant-alert-error, .ant-message-error, .ant-notification-error');
      return Array.from(errorElements).map(el => el.textContent);
    });

    if (errorMessages.length > 0) {
      log(`Found error messages on ${pageInfo.name}: ${errorMessages.join(', ')}`, 'warn');
      testResults.issues.push({
        user: user.role,
        page: pageInfo.name,
        type: 'Error Message',
        details: errorMessages.join(', ')
      });
    }

    // Check for 404 text in page
    const pageText = await page.evaluate(() => document.body.textContent);
    if (pageText.includes('404') || pageText.includes('Not Found')) {
      throw new Error('Page contains 404 or Not Found text');
    }

    // Check console errors
    const consoleErrors = consoleLogs.filter(log => log.type === 'error');
    if (consoleErrors.length > 0) {
      testResults.issues.push({
        user: user.role,
        page: pageInfo.name,
        type: 'Console Errors',
        details: consoleErrors.map(e => e.text).join('; ')
      });
    }

    if (errors.length > 0) {
      testResults.issues.push({
        user: user.role,
        page: pageInfo.name,
        type: 'Page Errors',
        details: errors.join('; ')
      });
    }

    testResults.passed++;
    log(`${user.role}: ${pageInfo.name} page - PASSED`, 'pass');
    return true;

  } catch (error) {
    testResults.failed++;
    testResults.issues.push({
      user: user.role,
      page: pageInfo.name,
      type: 'Test Failure',
      details: error.message
    });
    log(`${user.role}: ${pageInfo.name} page - FAILED: ${error.message}`, 'fail');

    // Take error screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `${user.username}_${pageInfo.name}_ERROR.png`),
      fullPage: true
    });

    return false;
  }
}

async function testUserRole(browser, user) {
  const page = await browser.newPage();

  try {
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Login
    await login(page, user.username, user.password);

    // Test each page for this role
    const pages = PAGES[user.role] || [];
    for (const pageInfo of pages) {
      await testPage(page, user, pageInfo);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between pages
    }

    // Logout
    try {
      await page.click('.ant-dropdown-trigger'); // Click user menu
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.click('text=Logout');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      log('Logout click failed (might be different UI)', 'warn');
    }

  } catch (error) {
    log(`Error testing ${user.role}: ${error.message}`, 'fail');
  } finally {
    await page.close();
  }
}

async function generateReport() {
  const reportPath = path.join(reportsDir, 'frontend-test-report.json');
  const htmlReportPath = path.join(reportsDir, 'frontend-test-report.html');

  // JSON report
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));

  // HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Frontend UI Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .header { background: #1890ff; color: white; padding: 20px; border-radius: 8px; }
    .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stat { display: inline-block; margin: 10px 20px; }
    .stat-value { font-size: 36px; font-weight: bold; }
    .stat-label { color: #666; }
    .pass { color: #52c41a; }
    .fail { color: #f5222d; }
    .issues { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .issue { border-left: 4px solid #f5222d; padding: 10px; margin: 10px 0; background: #fff1f0; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #fafafa; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Frontend UI Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>

  <div class="summary">
    <h2>Test Summary</h2>
    <div class="stat">
      <div class="stat-value">${testResults.total}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat">
      <div class="stat-value pass">${testResults.passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value fail">${testResults.failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value">${((testResults.passed / testResults.total) * 100).toFixed(1)}%</div>
      <div class="stat-label">Success Rate</div>
    </div>
  </div>

  ${testResults.issues.length > 0 ? `
  <div class="issues">
    <h2>Issues Found (${testResults.issues.length})</h2>
    <table>
      <tr>
        <th>User Role</th>
        <th>Page</th>
        <th>Issue Type</th>
        <th>Details</th>
      </tr>
      ${testResults.issues.map(issue => `
      <tr>
        <td>${issue.user}</td>
        <td>${issue.page}</td>
        <td>${issue.type}</td>
        <td>${issue.details}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  ` : '<div class="summary"><h2 style="color: #52c41a;">✓ No Issues Found!</h2></div>'}

  <div class="summary">
    <h2>Screenshots</h2>
    <p>Screenshots saved to: ${screenshotsDir}</p>
  </div>
</body>
</html>
  `;

  fs.writeFileSync(htmlReportPath, html);
  log(`Reports generated: ${reportPath}`, 'pass');
  log(`HTML report: ${htmlReportPath}`, 'pass');
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE FRONTEND UI TEST WITH PUPPETEER');
  console.log('  Testing all pages, checking for errors, taking screenshots');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check servers
  const serversRunning = await checkServers();
  if (!serversRunning) {
    console.log('\n✗ Servers are not running. Please start backend and frontend first.');
    process.exit(1);
  }

  let browser;
  try {
    log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    log('Browser launched', 'pass');

    // Test each user role
    for (const user of TEST_USERS) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  TESTING AS: ${user.role.toUpperCase()} (${user.username})`);
      console.log('═'.repeat(60));
      await testUserRole(browser, user);
    }

    await browser.close();

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'fail');
    if (browser) await browser.close();
    process.exit(1);
  }

  // Generate report
  await generateReport();

  // Print summary
  console.log('\n\n');
  console.log('═'.repeat(70));
  console.log('  FRONTEND UI TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`\n  Total Tests:    ${testResults.total}`);
  console.log(`  ✓ Passed:       ${testResults.passed}`);
  console.log(`  ✗ Failed:       ${testResults.failed}`);
  console.log(`  Success Rate:   ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  console.log(`  Issues Found:   ${testResults.issues.length}`);
  console.log(`\n  Screenshots:    ${screenshotsDir}`);
  console.log(`  Report:         ${path.join(reportsDir, 'frontend-test-report.html')}`);
  console.log('\n' + '═'.repeat(70));

  if (testResults.failed === 0 && testResults.issues.length === 0) {
    console.log('\n✓ ALL FRONTEND TESTS PASSED WITH ZERO ISSUES!\n');
    process.exit(0);
  } else {
    console.log('\n⚠ SOME ISSUES FOUND - CHECK REPORT FOR DETAILS\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n\nFATAL ERROR:', error);
  process.exit(1);
});
