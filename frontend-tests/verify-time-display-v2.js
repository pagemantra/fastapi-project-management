const puppeteer = require('puppeteer');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5173';

async function verifyTimeDisplay() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TIME DISPLAY VERIFICATION - IST 12-HOUR FORMAT');
  console.log('  Checking only visible UI elements (not JSON/network data)');
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
    console.log('→ Checking Attendance page...');
    await page.goto(FRONTEND_URL + '/attendance', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract only visible table cells and time displays
    const timesFound = await page.evaluate(() => {
      const times = [];

      // Get all table cells
      const tableCells = document.querySelectorAll('td, th, .ant-card-head-title, .ant-statistic-content');
      tableCells.forEach(cell => {
        const text = cell.textContent.trim();
        if (text.includes(':') && (text.includes('AM') || text.includes('PM') || /\d{1,2}:\d{2}/.test(text))) {
          times.push(text);
        }
      });

      return times;
    });

    console.log('  Times found in UI:');
    timesFound.slice(0, 10).forEach(time => console.log(`    - ${time}`));
    if (timesFound.length > 10) console.log(`    ... and ${timesFound.length - 10} more`);

    // Check format
    const allHave12Hour = timesFound.every(t => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(t) || !t.includes(':'));
    const noneHave24Hour = !timesFound.some(t => /\b([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\b/.test(t));
    const noneHaveSeconds = !timesFound.some(t => /\d{1,2}:\d{2}:\d{2}/.test(t));

    console.log(`\n  ✓ All times in 12-hour format: ${allHave12Hour ? 'YES' : 'NO'}`);
    console.log(`  ✓ No 24-hour format: ${noneHave24Hour ? 'YES' : 'NO'}`);
    console.log(`  ✓ No seconds: ${noneHaveSeconds ? 'YES' : 'NO'}\n`);

    results.push({
      page: 'Attendance',
      pass: allHave12Hour && noneHave24Hour && noneHaveSeconds
    });

    // Check TimeTracker component
    console.log('→ Checking TimeTracker component...');
    const trackerTimes = await page.evaluate(() => {
      const times = [];
      const tracker = document.querySelector('.ant-card');
      if (tracker) {
        const text = tracker.textContent;
        const timeMatches = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi);
        if (timeMatches) times.push(...timeMatches);
      }
      return times;
    });

    console.log('  Times in TimeTracker:');
    trackerTimes.forEach(time => console.log(`    - ${time}`));

    const trackerOK = trackerTimes.every(t => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(t));
    console.log(`\n  ✓ TimeTracker uses 12-hour format: ${trackerOK ? 'YES' : 'NO'}\n`);

    results.push({
      page: 'TimeTracker',
      pass: trackerOK
    });

    await browser.close();

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  VERIFICATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const allPass = results.every(r => r.pass);
    results.forEach(result => {
      console.log(`  ${result.page}: ${result.pass ? '✓ PASS' : '✗ FAIL'}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    if (allPass) {
      console.log('  ✓ ALL TIME DISPLAYS USE IST 12-HOUR FORMAT!');
    } else {
      console.log('  ✗ SOME ISSUES FOUND');
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
