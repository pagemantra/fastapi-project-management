# E2E Test Suite - Quick Start Guide

## 🚀 Quick Start (3 Steps)

### Step 1: Update Credentials

Open `tests/e2e-test.cjs` and update these lines (around line 33):

```javascript
TEST_USER: {
  employee_id: 'JSAN252',      // ← Change this to your test user ID
  password: 'your_password'    // ← Change this to your test password
}
```

### Step 2: Start Dev Server

Make sure your dev server is running:

```bash
npm run dev
```

The default URL is `http://localhost:5174`. If yours is different, update `FRONTEND_URL` in the test config.

### Step 3: Run Tests

```bash
npm run test:e2e
```

That's it! 🎉

---

## 📊 What the Test Does

The E2E test will automatically:

1. ✅ Open a browser window
2. ✅ Navigate to login page
3. ✅ Login with your credentials
4. ✅ Test all 12 routes:
   - Dashboard
   - Attendance
   - Tasks
   - Worksheets
   - Forms
   - Teams
   - Users
   - Reports
   - Notifications
   - Profile
   - My Team
5. ✅ Take screenshots of each page
6. ✅ Test time tracking (Clock In)
7. ✅ Monitor heartbeat requests
8. ✅ Test Electron features
9. ✅ Generate a summary report

---

## 📸 Where Are Screenshots Saved?

All screenshots are saved to:

```
frontend/tests/screenshots/
```

Each screenshot is timestamped and named after what it's testing:
- `login-page-initial-{timestamp}.png`
- `route-dashboard-{timestamp}.png`
- `time-tracking-clocked-in-{timestamp}.png`
- etc.

---

## 📋 Test Report

After tests complete, you'll get:

1. **Colorful console output** showing pass/fail for each test
2. **JSON report** saved to `screenshots/test-report.json`
3. **Summary statistics**:
   - Total tests run
   - Pass/Fail counts
   - Success rate %
   - Execution time
   - All screenshot paths

---

## 🎨 Console Output Colors

- 🟢 **Green ✓** = Test passed
- 🔴 **Red ✗** = Test failed
- 🟡 **Yellow ⚠** = Warning (not critical)
- 🔵 **Cyan ℹ** = Information

---

## ⚙️ Configuration Options

### Run in Headless Mode (No Browser Window)

In `e2e-test.cjs`, change line ~155:

```javascript
headless: true,  // Change false to true
```

### Change Timeouts

In the `CONFIG` object (around line 28):

```javascript
TIMEOUTS: {
  navigation: 30000,  // Page load timeout
  action: 10000,      // Button click timeout
  short: 2000,        // Short delay
  medium: 5000        // Medium delay
}
```

### Test Different Frontend URL

If your dev server runs on a different port:

```javascript
FRONTEND_URL: 'http://localhost:YOUR_PORT',
```

---

## 🐛 Troubleshooting

### "Login failed"
- Check that credentials are correct
- Verify backend API is running
- Check network connectivity

### "Browser launch failed"
- Install Puppeteer: `npm install puppeteer`
- On Linux, you may need to install Chrome dependencies

### "Cannot find screenshots directory"
- The test auto-creates this directory
- Check file permissions if it fails

### "Heartbeat not detected"
- Normal if you're not clocked in yet
- Test will show a warning but won't fail

### "electronAPI not available"
- Normal when running in browser (not Electron)
- Expected behavior - test will show warning

---

## 📦 What Gets Tested

### ✅ Login Flow
- Form elements present
- Can enter credentials
- Login redirects to dashboard
- Authentication successful

### ✅ All Routes
- Each route loads without errors
- No 404 pages
- Navigation works
- Key elements present

### ✅ Time Tracking
- Clock In button works
- Timer starts
- Session becomes active
- Heartbeat sends requests

### ✅ UI Elements
- Buttons are clickable
- Forms have inputs
- Links navigate correctly
- No broken images

### ✅ Electron Features
- electronAPI availability
- Close prevention setup
- Lock detection ready
- Electron bridge methods

---

## 📈 Success Criteria

| Success Rate | Verdict |
|--------------|---------|
| 90% - 100%   | ✅ Excellent |
| 70% - 89%    | ⚠️ Good |
| Below 70%    | ❌ Needs Attention |

---

## 🔄 Running Tests Again

You can run tests as many times as you want:

```bash
npm run test:e2e
```

Each run creates new timestamped screenshots. Old screenshots are NOT deleted automatically.

---

## 🧹 Clean Up Old Screenshots

To manually clean up:

```bash
# Windows PowerShell
Remove-Item frontend\tests\screenshots\* -Force

# Linux/Mac
rm -rf frontend/tests/screenshots/*
```

Or just delete the screenshots folder manually.

---

## 💡 Tips

1. **Keep browser window visible** - It's fun to watch the test run!
2. **Don't interfere** - Let the test control the browser
3. **Check screenshots** - They show exactly what the test saw
4. **Read warnings** - They indicate potential issues
5. **Run regularly** - Catch bugs early

---

## 🤝 Need Help?

1. Check console output for detailed errors
2. Look at screenshots to see what happened
3. Read the full `E2E-TEST-README.md` for details
4. Check the JSON report for complete test data

---

## ⏱️ How Long Does It Take?

Typical test run: **2-3 minutes**

- Login: ~10 seconds
- All routes: ~30-60 seconds
- Time tracking: ~30 seconds
- Heartbeat test: 30 seconds
- Electron tests: ~10 seconds
- Screenshots: Throughout

---

## 🎯 Next Steps

After running the test:

1. ✅ Check console for pass/fail summary
2. ✅ Review screenshots for visual issues
3. ✅ Read JSON report for detailed metrics
4. ✅ Fix any failed tests
5. ✅ Run tests again to verify fixes

Happy Testing! 🚀
