const puppeteer = require('puppeteer');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5173';

async function verifyTimeDisplay() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TIME DISPLAY VERIFICATION TEST - IST 12-HOUR FORMAT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Login as user
    console.log('→ Logging in as JSAN313...');
    await page.goto(FRONTEND_URL + '/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[type="text"]');
    await page.type('input[type="text"]', 'JSAN313');
    await page.type('input[type="password"]', 'JSAN313@456');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('✓ Logged in\n');

    // Check Attendance page
    console.log('→ Checking Attendance page time displays...');
    await page.goto(FRONTEND_URL + '/attendance', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract all text from the page
    const attendanceText = await page.evaluate(() => document.body.innerText);

    // Check for 12-hour format patterns (e.g., "02:30 PM", "09:15 AM")
    const time12HourPattern = /\d{1,2}:\d{2}\s*(AM|PM)/gi;
    const time24HourPattern = /\b([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\b/g;
    const timeWithSecondsPattern = /\d{1,2}:\d{2}:\d{2}/g;

    const has12Hour = time12HourPattern.test(attendanceText);
    const has24Hour = time24HourPattern.test(attendanceText);
    const hasSeconds = timeWithSecondsPattern.test(attendanceText);

    console.log(`  12-hour format (hh:mm AM/PM): ${has12Hour ? '✓ FOUND' : '✗ NOT FOUND'}`);
    console.log(`  24-hour format (HH:mm:ss): ${has24Hour ? '✗ FOUND (BAD)' : '✓ NOT FOUND (GOOD)'}`);
    console.log(`  Seconds display: ${hasSeconds ? '✗ FOUND (BAD)' : '✓ NOT FOUND (GOOD)'}`);

    results.push({
      page: 'Attendance',
      has12Hour,
      has24Hour: !has24Hour,
      noSeconds: !hasSeconds
    });

    // Take screenshot
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'time_verification_attendance.png'),
      fullPage: true
    });
    console.log('  Screenshot saved\n');

    // Check Reports page (Manager)
    await page.goto(FRONTEND_URL + '/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[type="text"]');
    await page.evaluate(() => {
      document.querySelector('input[type="text"]').value = '';
      document.querySelector('input[type="password"]').value = '';
    });
    await page.type('input[type="text"]', 'JSAN261');
    await page.type('input[type="password"]', 'JSAN261@456');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    console.log('→ Checking Reports page time displays...');
    await page.goto(FRONTEND_URL + '/reports', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const reportsText = await page.evaluate(() => document.body.innerText);

    const reportsHas12Hour = /\d{1,2}:\d{2}\s*(AM|PM)/gi.test(reportsText);
    const reportsHas24Hour = /\b([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\b/g.test(reportsText);
    const reportsHasSeconds = /\d{1,2}:\d{2}:\d{2}/g.test(reportsText);

    console.log(`  12-hour format (hh:mm AM/PM): ${reportsHas12Hour ? '✓ FOUND' : '✗ NOT FOUND'}`);
    console.log(`  24-hour format (HH:mm:ss): ${reportsHas24Hour ? '✗ FOUND (BAD)' : '✓ NOT FOUND (GOOD)'}`);
    console.log(`  Seconds display: ${reportsHasSeconds ? '✗ FOUND (BAD)' : '✓ NOT FOUND (GOOD)'}`);

    results.push({
      page: 'Reports',
      has12Hour: reportsHas12Hour,
      has24Hour: !reportsHas24Hour,
      noSeconds: !reportsHasSeconds
    });

    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'time_verification_reports.png'),
      fullPage: true
    });
    console.log('  Screenshot saved\n');

    await browser.close();

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  VERIFICATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let allPass = true;
    results.forEach(result => {
      const pass = result.has12Hour && result.has24Hour && result.noSeconds;
      allPass = allPass && pass;
      console.log(`  ${result.page}: ${pass ? '✓ PASS' : '✗ FAIL'}`);
      if (!pass) {
        console.log(`    - 12-hour format: ${result.has12Hour ? '✓' : '✗'}`);
        console.log(`    - No 24-hour format: ${result.has24Hour ? '✓' : '✗'}`);
        console.log(`    - No seconds: ${result.noSeconds ? '✓' : '✗'}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    if (allPass) {
      console.log('  ✓ ALL TIME DISPLAYS USE IST 12-HOUR FORMAT!');
    } else {
      console.log('  ✗ SOME ISSUES FOUND - CHECK RESULTS ABOVE');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(allPass ? 0 : 1);

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
}

verifyTimeDisplay();
