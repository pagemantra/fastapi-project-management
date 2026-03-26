# E2E Test Suite for FastAPI Project Management Frontend

## Overview

This comprehensive End-to-End (E2E) test suite uses Puppeteer to test all frontend routes, user flows, and Electron-specific features of the FastAPI Project Management application.

## Test File

**Location:** `D:\Development\fastapi-project-management\frontend\tests\e2e-test.cjs`

## Features Tested

### 1. All Frontend Routes with Screenshots

The test suite covers all 12 routes:

- `/login` - Login page
- `/dashboard` - Dashboard
- `/attendance` - Attendance page
- `/tasks` - Tasks page
- `/worksheets` - Worksheets page
- `/forms` - Forms page
- `/teams` - Teams page
- `/users` - Users/Master Data page
- `/reports` - Reports page
- `/notifications` - Notifications page
- `/profile` - Profile page
- `/my-team` - My Team page

For each route, the test:
- Navigates to the route
- Waits for page to load completely
- Takes a full-page screenshot
- Checks for console errors
- Verifies key elements are present
- Tests interactive elements (buttons, inputs, links)

### 2. Login Flow

Tests the complete login process:
- Navigate to `/login`
- Verify form elements (Employee ID input, Password input, Submit button)
- Fill in credentials
- Submit the form
- Verify redirect to `/dashboard`
- Confirm successful authentication

### 3. Time Tracking Flow

Tests the time tracking functionality:
- Clock In button detection and interaction
- Timer/active session verification
- Heartbeat monitoring
- Clock Out button detection (without clicking to preserve session)

### 4. Heartbeat Functionality

Tests that heartbeat requests are being sent:
- Monitors network requests for 30 seconds
- Captures all heartbeat/attendance API calls
- Verifies heartbeat interval (should be ~10 seconds based on code)
- Reports number of successful heartbeat requests

### 5. Electron-Specific Features

Tests Electron integration:
- **electronAPI availability** - Checks if `window.electronAPI` exists
- **electronAPI methods** - Lists all available Electron bridge methods
- **setClockStatus** - Tests calling Electron methods from the browser
- **Close prevention** - Verifies beforeunload handlers are set up
- **Lock detection** - Confirms Page Visibility API setup for screen lock detection

### 6. Interactive Elements

For each page, the test:
- Counts buttons, inputs, and links
- Tests clicking safe buttons (avoids destructive actions like Delete, Clock Out)
- Takes screenshots of interactions
- Verifies UI responds to user actions

## Configuration

### Update Test Credentials

Before running the test, update the credentials in the test file:

```javascript
TEST_USER: {
  employee_id: 'JSAN252', // Change to your test user ID
  password: 'your_password' // Change to your test password
}
```

### Frontend URL

The default frontend URL is `http://localhost:5174`. If your dev server runs on a different port, update:

```javascript
FRONTEND_URL: 'http://localhost:5174'
```

## Running the Tests

### Prerequisites

1. Make sure Puppeteer is installed:
```bash
npm install puppeteer
```

2. Start the frontend dev server:
```bash
npm run dev
```

3. Ensure the backend API is running and accessible

### Execute Tests

From the project root:

```bash
node frontend/tests/e2e-test.cjs
```

Or from the tests directory:

```bash
cd frontend/tests
node e2e-test.cjs
```

## Test Output

### Console Output

The test suite provides colorful, detailed console output:

- **Blue headers** - Section titles
- **Green ✓** - Successful tests
- **Red ✗** - Failed tests
- **Yellow ⚠** - Warnings
- **Cyan ℹ** - Informational messages

### Screenshots

All screenshots are saved to:
```
D:\Development\fastapi-project-management\frontend\tests\screenshots\
```

Screenshot naming convention:
- `login-page-initial-{timestamp}.png`
- `login-page-filled-{timestamp}.png`
- `login-success-dashboard-{timestamp}.png`
- `route-{page-name}-{timestamp}.png`
- `time-tracking-before-clock-in-{timestamp}.png`
- And more...

### JSON Report

A detailed JSON report is saved to:
```
D:\Development\fastapi-project-management\frontend\tests\screenshots\test-report.json
```

The report includes:
- Total tests run
- Passed/Failed counts
- Warnings
- Error details
- Screenshot paths
- Execution time
- Success rate percentage

## Test Results Interpretation

### Success Criteria

- **90%+ success rate** - Excellent (Green)
- **70-89% success rate** - Good (Yellow)
- **Below 70%** - Needs attention (Red)

### Common Warnings

- **"Redirected from X to Y"** - The route redirected, possibly due to permissions
- **"No header/navigation found"** - Layout elements missing
- **"Could not verify heartbeat"** - User may not be clocked in
- **"electronAPI not available"** - Running in browser instead of Electron

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Headless Mode

For CI/CD or automated testing, change the browser launch config:

```javascript
const browser = await puppeteer.launch({
  headless: true, // Change to true
  // ... other options
});
```

## Troubleshooting

### Test hangs on login

- Verify credentials are correct
- Check if backend API is running
- Ensure network connectivity

### Screenshots not saving

- Check directory permissions
- Verify screenshots directory exists
- Look for filesystem errors in console

### Heartbeat not detected

- User may not be clocked in yet
- Backend may not be receiving requests
- Check network tab in browser DevTools

### Electron features not working

- Tests are running in browser, not Electron
- ElectronAPI won't be available in browser mode
- Expected behavior - warnings will show

## Customization

### Add New Routes

Add to the `ROUTES` array:

```javascript
{ path: '/new-page', name: 'New Page', requiresAuth: true }
```

### Adjust Timeouts

Modify `CONFIG.TIMEOUTS`:

```javascript
TIMEOUTS: {
  navigation: 30000,  // Page navigation timeout
  action: 10000,      // Action timeout (clicks, etc.)
  short: 2000,        // Short delays
  medium: 5000        // Medium delays
}
```

### Add Custom Tests

Create a new test function:

```javascript
async function testMyFeature(page) {
  logSection('MY FEATURE TEST');
  logTest('Testing my feature');

  try {
    // Your test code here
    recordSuccess('My feature works!');
  } catch (error) {
    recordFailure('My feature', error);
  }
}
```

Then call it in `runAllTests()`:

```javascript
await testMyFeature(page);
```

## Best Practices

1. **Don't test destructive actions** - Avoid clicking Delete, Remove, Clock Out buttons
2. **Use appropriate delays** - Allow time for UI updates and animations
3. **Take screenshots liberally** - Visual evidence helps debugging
4. **Check console errors** - Frontend errors indicate issues
5. **Test incrementally** - Run tests after each feature addition

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run dev &
      - run: sleep 10
      - run: node frontend/tests/e2e-test.cjs
      - uses: actions/upload-artifact@v2
        if: always()
        with:
          name: screenshots
          path: frontend/tests/screenshots/
```

## Support

For issues or questions:
1. Check console output for detailed error messages
2. Review screenshots to see what the test encountered
3. Check the JSON report for complete test details
4. Verify all prerequisites are met (dev server running, credentials correct, etc.)

## License

Same as the main project.
