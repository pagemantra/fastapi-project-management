# Pre-Test Checklist

Before running the E2E test suite, make sure you've completed all items on this checklist.

## ✅ Prerequisites

### 1. Dependencies Installed

- [ ] **Node.js** installed (v16 or higher recommended)
  ```bash
  node --version
  ```

- [ ] **npm** installed
  ```bash
  npm --version
  ```

- [ ] **Puppeteer** installed
  ```bash
  npm list puppeteer
  ```
  If not installed:
  ```bash
  npm install puppeteer
  ```

### 2. Backend API

- [ ] Backend API is **running** and accessible
  - Default: `https://fastapi-project-management-production-22e0.up.railway.app`
  - Check: Open URL in browser - should see API docs or response

- [ ] Backend API is **responding** to requests
  ```bash
  curl https://fastapi-project-management-production-22e0.up.railway.app/
  ```

### 3. Frontend Dev Server

- [ ] Frontend dev server is **running**
  ```bash
  npm run dev
  ```

- [ ] Dev server is accessible at correct URL
  - Default: `http://localhost:5174`
  - Check: Open in browser - should see login page

- [ ] Port is correct in test config (if not using 5174)
  - Edit `tests/e2e-test.cjs`
  - Update `FRONTEND_URL` on line ~27

### 4. Test Configuration

- [ ] **Test credentials** updated in `tests/e2e-test.cjs`
  ```javascript
  TEST_USER: {
    employee_id: 'JSAN252',      // ← Your test user ID
    password: 'your_password'    // ← Your test password
  }
  ```

- [ ] Test user has **valid account** in the system
  - Can log in manually via browser
  - Has proper permissions

- [ ] Screenshots directory exists (auto-created if not)
  ```
  frontend/tests/screenshots/
  ```

### 5. System Requirements

- [ ] **Disk space** available for screenshots
  - Expect ~50-100 MB per test run
  - Check: `df -h` (Linux/Mac) or File Explorer (Windows)

- [ ] **Chrome/Chromium** installed
  - Puppeteer will download if missing
  - Check: Chrome version should be recent

- [ ] **Network connection** active
  - API calls need internet
  - Screenshots save locally

### 6. Environment

- [ ] No other tests running simultaneously
  - Could interfere with browser automation

- [ ] Screen resolution adequate
  - Test uses 1920x1080 viewport
  - Smaller screens may have issues

- [ ] Sufficient RAM available
  - Browser automation can be memory-intensive
  - Recommended: 4GB+ free RAM

---

## 🔧 Configuration Verification

### Check Test Configuration

Open `tests/e2e-test.cjs` and verify:

```javascript
const CONFIG = {
  FRONTEND_URL: 'http://localhost:5174',  // ← Correct port?
  SCREENSHOTS_DIR: path.join(__dirname, 'screenshots'), // ← OK

  TEST_USER: {
    employee_id: 'JSAN252',      // ← Your user ID?
    password: 'your_password'    // ← Your password?
  },

  TIMEOUTS: {
    navigation: 30000,  // ← Increase if slow network
    action: 10000,
    short: 2000,
    medium: 5000
  }
};
```

### Verify Routes List

Make sure all routes in `CONFIG.ROUTES` match your app:

```javascript
ROUTES: [
  { path: '/login', name: 'Login', requiresAuth: false },
  { path: '/dashboard', name: 'Dashboard', requiresAuth: true },
  { path: '/attendance', name: 'Attendance', requiresAuth: true },
  // ... etc
]
```

---

## 🧪 Pre-Flight Test

Before running the full test suite, do a quick manual check:

### 1. Manual Login Test

- [ ] Open `http://localhost:5174/login` in browser
- [ ] Enter test credentials
- [ ] Click login
- [ ] Should redirect to dashboard
- [ ] Should see time tracker and other elements

### 2. Manual Route Test

- [ ] Click through main navigation
- [ ] Visit each route manually
- [ ] Verify all pages load without errors
- [ ] Check browser console for errors (F12)

### 3. Manual Time Tracking Test

- [ ] On dashboard, click "Clock In"
- [ ] Wait a few seconds
- [ ] Timer should start
- [ ] Check browser Network tab for heartbeat requests
- [ ] Should see requests every ~10 seconds

---

## 🚨 Common Issues - Pre-Check

### Issue: "Cannot find module 'puppeteer'"
**Solution:**
```bash
npm install puppeteer
```

### Issue: "Dev server not running"
**Solution:**
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests (wait for dev server to start)
npm run test:e2e
```

### Issue: "Login failed"
**Fix before running:**
- Verify credentials in test config
- Test login manually in browser
- Check backend API is accessible

### Issue: "ECONNREFUSED"
**Fix before running:**
- Backend API not running
- Check API URL is correct
- Verify network connectivity

### Issue: "Screenshots directory error"
**Fix before running:**
```bash
# Windows PowerShell
New-Item -ItemType Directory -Force -Path frontend\tests\screenshots

# Linux/Mac
mkdir -p frontend/tests/screenshots
```

### Issue: "Port already in use"
**Fix before running:**
- Another dev server running on 5174?
- Kill the other process or use different port
- Update `FRONTEND_URL` in test config

---

## 📋 Final Checklist

Before running `npm run test:e2e`:

- [ ] All items in Prerequisites section checked
- [ ] Test configuration verified and updated
- [ ] Manual pre-flight test completed successfully
- [ ] No error messages in console
- [ ] Both terminals ready (dev server + test runner)

---

## 🚀 Ready to Run!

If all checkboxes are checked, you're ready to run:

```bash
npm run test:e2e
```

Or:

```bash
node frontend/tests/e2e-test.cjs
```

---

## 📊 Expected Test Duration

| Phase | Duration | Notes |
|-------|----------|-------|
| Setup | ~5s | Browser launch, page creation |
| Login | ~10s | Navigate, fill form, submit |
| All Routes | ~30-60s | 11 routes × ~5s each |
| Page Interactions | ~10-20s | 4 detailed page tests |
| Time Tracking | ~30s | Clock in, wait, verify |
| Heartbeat Test | ~30s | Wait for 3+ heartbeats |
| Electron Tests | ~5s | Check features, screenshot |
| Report | ~2s | Generate summary, save JSON |

**Total:** ~2-3 minutes for complete test run

---

## 📝 Post-Test Actions

After test completes:

- [ ] Check console output for summary
- [ ] Review failed tests (if any)
- [ ] Open screenshots folder
- [ ] Examine `test-report.json`
- [ ] Investigate any warnings or errors
- [ ] Fix issues if found
- [ ] Re-run tests to verify fixes

---

## 🔄 Clean Slate (Optional)

To start fresh before running tests:

```bash
# Clear old screenshots
rm -rf frontend/tests/screenshots/*

# Clear browser cache (optional)
# Puppeteer uses fresh profile each run

# Restart dev server
# Ctrl+C to stop, then npm run dev again
```

---

## 💡 Tips for Best Results

1. **Close unnecessary apps** - Free up system resources
2. **Disable screen savers** - Prevent interruptions
3. **Use stable network** - Avoid wifi drops
4. **Don't interact with test browser** - Let automation run
5. **Keep terminal visible** - Watch progress in real-time
6. **Review screenshots after** - Visual verification is valuable

---

## 🆘 If Something Goes Wrong

1. **Don't panic** - Tests can be re-run
2. **Read error messages** - They usually explain the issue
3. **Check screenshots** - See what the test saw
4. **Review JSON report** - Complete test details
5. **Fix one issue at a time** - Start with login
6. **Re-run incrementally** - Verify each fix

---

## 📞 Need Help?

Refer to these documents:

1. **QUICK-START.md** - Basic usage
2. **E2E-TEST-README.md** - Complete documentation
3. **EXAMPLE-OUTPUT.md** - See expected results
4. **TEST-FLOW-DIAGRAM.md** - Understand test flow

---

**Remember:** The test suite is designed to be forgiving. Warnings won't fail the test, only critical errors will. Even if some tests fail, you'll get screenshots and detailed error reports to help debug.

Good luck! 🎉
