/**
 * Simplified E2E Test Suite - Screenshot All Routes
 *
 * This test navigates using the sidebar menu (SPA-friendly)
 * instead of page.goto which causes timeout issues due to heartbeat.
 *
 * Usage: node tests/simple-e2e-test.cjs
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  FRONTEND_URL: 'http://localhost:5174',
  SCREENSHOTS_DIR: path.join(__dirname, 'screenshots'),
  TEST_USER: {
    employee_id: 'JSAN277',
    password: 'JSAN277@456'
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.SCREENSHOTS_DIR)) {
  fs.mkdirSync(CONFIG.SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshot(page, name) {
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.png`;
  const filepath = path.join(CONFIG.SCREENSHOTS_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`  ✓ Screenshot: ${filename}`);
    return filepath;
  } catch (err) {
    console.log(`  ✗ Screenshot failed: ${err.message}`);
    return null;
  }
}

async function runTest() {
  console.log('\n=== SIMPLE E2E TEST - SCREENSHOT ALL ROUTES ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Disable request waiting to avoid heartbeat timeout
  await page.setRequestInterception(true);
  page.on('request', request => request.continue());

  const results = {
    screenshots: [],
    errors: []
  };

  try {
    // ========== STEP 1: LOGIN ==========
    console.log('1. LOGGING IN...');

    await page.goto(CONFIG.FRONTEND_URL, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => sessionStorage.setItem('isPWA', 'true'));
    await page.goto(`${CONFIG.FRONTEND_URL}/login`, { waitUntil: 'load', timeout: 30000 });
    await delay(2000);

    await takeScreenshot(page, '01-login-page');

    const employeeInput = await page.$('input[placeholder*="Associate ID"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!employeeInput || !passwordInput) {
      throw new Error('Login form not found');
    }

    await employeeInput.type(CONFIG.TEST_USER.employee_id, { delay: 30 });
    await passwordInput.type(CONFIG.TEST_USER.password, { delay: 30 });
    await takeScreenshot(page, '02-login-filled');

    const loginButton = await page.$('button[type="submit"]');
    await loginButton.click();

    console.log('   Waiting for dashboard...');

    // Wait for URL to change to dashboard
    for (let i = 0; i < 30; i++) {
      await delay(500);
      if (page.url().includes('/dashboard')) {
        await delay(3000); // Wait for content
        break;
      }
    }

    if (!page.url().includes('/dashboard')) {
      throw new Error('Login timeout');
    }

    await takeScreenshot(page, '03-dashboard');
    console.log('   ✓ Login successful!\n');

    // ========== STEP 2: NAVIGATE VIA SIDEBAR ==========
    console.log('2. CAPTURING ROUTE SCREENSHOTS VIA SIDEBAR NAVIGATION...\n');

    // Define sidebar menu items to click
    const menuItems = [
      { selector: 'a[href="/my-team"], [class*="menu"] span:has-text("My Team")', name: 'My Team' },
      { selector: 'a[href="/tasks"], [class*="menu"] span:has-text("Tasks")', name: 'Tasks' },
      { selector: 'a[href="/worksheets"], [class*="menu"] span:has-text("Worksheets")', name: 'Worksheets' },
      { selector: 'a[href="/attendance"], [class*="menu"] span:has-text("Attendance")', name: 'Attendance' },
      { selector: 'a[href="/notifications"], [class*="menu"] span:has-text("Notifications")', name: 'Notifications' },
    ];

    // Try clicking sidebar items by searching for links
    const sidebarLinks = await page.$$('aside a, nav a, [class*="menu"] a, [class*="sidebar"] a');
    console.log(`   Found ${sidebarLinks.length} sidebar links\n`);

    // Get all visible text from sidebar
    const linkTexts = await page.evaluate(() => {
      const links = document.querySelectorAll('aside a, nav a, [class*="sider"] a, [class*="menu"] a');
      return Array.from(links).map(a => ({
        text: a.textContent.trim(),
        href: a.getAttribute('href')
      }));
    });

    console.log('   Available sidebar links:');
    linkTexts.forEach(l => console.log(`     - ${l.text} (${l.href})`));
    console.log('');

    // Click each link and take screenshot
    const routesToVisit = ['My Team', 'Tasks', 'Worksheets', 'Attendance', 'Notifications'];
    let routeNumber = 4;

    for (const routeName of routesToVisit) {
      console.log(`   [${routeNumber - 3}/5] Navigating to ${routeName}...`);

      try {
        // Find and click the link
        const clicked = await page.evaluate((name) => {
          const links = document.querySelectorAll('aside a, nav a, [class*="sider"] a, [class*="menu"] a');
          for (const link of links) {
            if (link.textContent.trim().toLowerCase().includes(name.toLowerCase())) {
              link.click();
              return true;
            }
          }
          return false;
        }, routeName);

        if (clicked) {
          await delay(3000); // Wait for page to render
          const path = await takeScreenshot(page, `${String(routeNumber).padStart(2, '0')}-${routeName}`);
          if (path) results.screenshots.push({ route: routeName, path });
        } else {
          console.log(`     ✗ Link not found for ${routeName}`);
          results.errors.push({ route: routeName, error: 'Link not found' });
        }
      } catch (err) {
        console.log(`     ✗ Error: ${err.message}`);
        results.errors.push({ route: routeName, error: err.message });
      }

      routeNumber++;
    }

    // ========== STEP 3: VERIFY TIME TRACKING UI ==========
    console.log('\n3. VERIFYING TIME TRACKING UI ON DASHBOARD...');

    // Go back to dashboard
    await page.evaluate(() => {
      const dashLink = document.querySelector('a[href="/dashboard"]');
      if (dashLink) dashLink.click();
    });
    await delay(3000);

    const pageContent = await page.content();

    const features = {
      'Clock Out button': pageContent.includes('Clock Out'),
      'Screen Active Time': pageContent.includes('Screen Active') || pageContent.includes('Active Time'),
      'Lock/Sleep Time': pageContent.includes('Lock') || pageContent.includes('Sleep'),
      'Timer Running': pageContent.includes('RUNNING') || pageContent.includes('running'),
      'Time Tracker': pageContent.includes('Time Tracker'),
      'Break functionality': pageContent.includes('Break')
    };

    console.log('   Feature detection:');
    Object.entries(features).forEach(([name, found]) => {
      console.log(`     ${found ? '✓' : '✗'} ${name}`);
    });

    await takeScreenshot(page, '99-final-dashboard');

  } catch (error) {
    console.error(`\n✗ FATAL ERROR: ${error.message}`);
    await takeScreenshot(page, 'error-state');
    results.errors.push({ route: 'FATAL', error: error.message });
  } finally {
    await browser.close();
  }

  // ========== SUMMARY ==========
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Screenshots captured: ${results.screenshots.length + 3}`); // +3 for login screens
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  - ${e.route}: ${e.error}`));
  }

  console.log('\nScreenshots saved to:', CONFIG.SCREENSHOTS_DIR);

  const reportPath = path.join(CONFIG.SCREENSHOTS_DIR, 'simple-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  process.exit(results.errors.length > 0 ? 1 : 0);
}

runTest().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
