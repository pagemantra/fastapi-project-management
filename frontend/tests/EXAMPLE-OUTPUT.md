# Example Test Output

## Console Output Example

```
================================================================================
  FASTAPI PROJECT MANAGEMENT - COMPREHENSIVE E2E TEST SUITE
================================================================================

[14:23:45] ℹ Created screenshots directory: D:\Development\fastapi-project-management\frontend\tests\screenshots

▶ Setting up browser
[14:23:47] ✓ Browser setup complete

================================================================================
  LOGIN FLOW TEST
================================================================================

▶ Testing login functionality
[14:23:47] ℹ Navigating to login page...
[14:23:49] ℹ Screenshot saved: screenshots/login-page-initial-1710598429123.png
[14:23:49] ℹ Checking login form elements...
[14:23:49] ✓ Login form elements found
[14:23:49] ℹ Filling in credentials...
[14:23:51] ℹ Screenshot saved: screenshots/login-page-filled-1710598431456.png
[14:23:51] ℹ Submitting login...
[14:23:55] ℹ Screenshot saved: screenshots/login-success-dashboard-1710598435789.png
[14:23:55] ✓ Login flow completed successfully

================================================================================
  TESTING ALL ROUTES
================================================================================

▶ Testing route: Dashboard (/dashboard)
[14:23:55] ℹ Navigating to /dashboard...
[14:23:57] ℹ Screenshot saved: screenshots/route-dashboard-1710598437012.png
[14:23:57] ℹ Checking elements on Dashboard...
[14:23:57] ℹ Dashboard: Found 8 buttons, 3 inputs, 12 links
[14:23:58] ℹ Screenshot saved: screenshots/dashboard-button-clicked-1710598438345.png
[14:23:58] ✓ Dashboard: Elements checked
[14:23:58] ✓ Route Dashboard tested successfully

▶ Testing route: Attendance (/attendance)
[14:23:59] ℹ Navigating to /attendance...
[14:24:01] ℹ Screenshot saved: screenshots/route-attendance-1710598441678.png
[14:24:01] ℹ Checking elements on Attendance...
[14:24:01] ℹ Attendance: Found 5 buttons, 2 inputs, 8 links
[14:24:01] ✓ Attendance: Elements checked
[14:24:01] ✓ Route Attendance tested successfully

▶ Testing route: Tasks (/tasks)
[14:24:02] ℹ Navigating to /tasks...
[14:24:04] ℹ Screenshot saved: screenshots/route-tasks-1710598444901.png
[14:24:04] ℹ Checking elements on Tasks...
[14:24:04] ℹ Tasks: Found 6 buttons, 4 inputs, 15 links
[14:24:04] ✓ Tasks: Elements checked
[14:24:04] ✓ Route Tasks tested successfully

▶ Testing route: Worksheets (/worksheets)
[14:24:05] ℹ Navigating to /worksheets...
[14:24:07] ℹ Screenshot saved: screenshots/route-worksheets-1710598447234.png
[14:24:07] ℹ Checking elements on Worksheets...
[14:24:07] ℹ Worksheets: Found 4 buttons, 6 inputs, 10 links
[14:24:07] ✓ Worksheets: Elements checked
[14:24:07] ✓ Route Worksheets tested successfully

▶ Testing route: Forms (/forms)
[14:24:08] ℹ Navigating to /forms...
[14:24:10] ℹ Screenshot saved: screenshots/route-forms-1710598450567.png
[14:24:10] ℹ Checking elements on Forms...
[14:24:10] ℹ Forms: Found 7 buttons, 3 inputs, 9 links
[14:24:10] ✓ Forms: Elements checked
[14:24:10] ✓ Route Forms tested successfully

▶ Testing route: Teams (/teams)
[14:24:11] ℹ Navigating to /teams...
[14:24:13] ℹ Screenshot saved: screenshots/route-teams-1710598453890.png
[14:24:13] ℹ Checking elements on Teams...
[14:24:13] ℹ Teams: Found 5 buttons, 2 inputs, 11 links
[14:24:13] ✓ Teams: Elements checked
[14:24:13] ✓ Route Teams tested successfully

▶ Testing route: Users (/users)
[14:24:14] ℹ Navigating to /users...
[14:24:16] ℹ Screenshot saved: screenshots/route-users-1710598456123.png
[14:24:16] ℹ Checking elements on Users...
[14:24:16] ℹ Users: Found 8 buttons, 5 inputs, 14 links
[14:24:16] ✓ Users: Elements checked
[14:24:16] ✓ Route Users tested successfully

▶ Testing route: Reports (/reports)
[14:24:17] ℹ Navigating to /reports...
[14:24:19] ℹ Screenshot saved: screenshots/route-reports-1710598459456.png
[14:24:19] ℹ Checking elements on Reports...
[14:24:19] ℹ Reports: Found 4 buttons, 3 inputs, 7 links
[14:24:19] ✓ Reports: Elements checked
[14:24:19] ✓ Route Reports tested successfully

▶ Testing route: Notifications (/notifications)
[14:24:20] ℹ Navigating to /notifications...
[14:24:22] ℹ Screenshot saved: screenshots/route-notifications-1710598462789.png
[14:24:22] ℹ Checking elements on Notifications...
[14:24:22] ℹ Notifications: Found 3 buttons, 1 inputs, 6 links
[14:24:22] ✓ Notifications: Elements checked
[14:24:22] ✓ Route Notifications tested successfully

▶ Testing route: Profile (/profile)
[14:24:23] ℹ Navigating to /profile...
[14:24:25] ℹ Screenshot saved: screenshots/route-profile-1710598465012.png
[14:24:25] ℹ Checking elements on Profile...
[14:24:25] ℹ Profile: Found 2 buttons, 8 inputs, 5 links
[14:24:25] ✓ Profile: Elements checked
[14:24:25] ✓ Route Profile tested successfully

▶ Testing route: My Team (/my-team)
[14:24:26] ℹ Navigating to /my-team...
[14:24:28] ℹ Screenshot saved: screenshots/route-my-team-1710598468345.png
[14:24:28] ℹ Checking elements on My Team...
[14:24:28] ℹ My Team: Found 6 buttons, 2 inputs, 13 links
[14:24:28] ✓ My Team: Elements checked
[14:24:28] ✓ Route My Team tested successfully

================================================================================
  PAGE-SPECIFIC INTERACTION TESTS
================================================================================

▶ Testing Attendance Page
[14:24:29] ℹ Attendance: Calendar/Date picker found
[14:24:29] ℹ Attendance: Table found
[14:24:29] ℹ Screenshot saved: screenshots/attendance-page-detailed-1710598469678.png
[14:24:29] ✓ Attendance page tested

▶ Testing Tasks Page
[14:24:30] ℹ Tasks: List/Table found
[14:24:30] ℹ Screenshot saved: screenshots/tasks-page-detailed-1710598470901.png
[14:24:30] ✓ Tasks page tested

▶ Testing Worksheets Page
[14:24:31] ℹ Screenshot saved: screenshots/worksheets-page-detailed-1710598471234.png
[14:24:31] ✓ Worksheets page tested

▶ Testing Profile Page
[14:24:32] ℹ Profile: Form found
[14:24:32] ℹ Profile: 8 input fields found
[14:24:32] ℹ Screenshot saved: screenshots/profile-page-detailed-1710598472567.png
[14:24:32] ✓ Profile page tested

================================================================================
  TIME TRACKING FLOW TEST
================================================================================

▶ Testing time tracking functionality
[14:24:33] ℹ Navigating to dashboard for time tracking...
[14:24:35] ✓ Clock In button found
[14:24:35] ℹ Screenshot saved: screenshots/time-tracking-before-clock-in-1710598475890.png
[14:24:35] ℹ Clicking Clock In...
[14:24:40] ℹ Screenshot saved: screenshots/time-tracking-clocked-in-1710598480123.png
[14:24:40] ✓ Timer/active session indicator found

▶ Verifying heartbeat activity
[14:24:55] ✓ Heartbeat appears to be active
[14:24:55] ℹ Screenshot saved: screenshots/time-tracking-heartbeat-check-1710598495456.png

▶ Looking for Clock Out button
[14:24:55] ℹ Clock Out button found (not clicking to preserve session)
[14:24:55] ✓ Time tracking UI complete
[14:24:55] ✓ Time tracking flow tested

================================================================================
  HEARTBEAT FUNCTIONALITY TEST
================================================================================

▶ Testing heartbeat requests
[14:24:56] ℹ Waiting 30 seconds to capture heartbeat requests...
[14:25:26] ℹ Captured 3 potential heartbeat requests
[14:25:26] ✓ Heartbeat requests detected (3 requests)
[14:25:26] ℹ   [1] POST https://fastapi-project-management-production-22e0.up.railway.app/attendance/heartbeat
[14:25:26] ℹ   [2] POST https://fastapi-project-management-production-22e0.up.railway.app/attendance/heartbeat
[14:25:26] ℹ   [3] POST https://fastapi-project-management-production-22e0.up.railway.app/attendance/heartbeat
[14:25:26] ℹ Screenshot saved: screenshots/heartbeat-test-1710598526789.png

================================================================================
  ELECTRON-SPECIFIC FEATURES TEST
================================================================================

▶ Checking for electronAPI
[14:25:27] ⚠ electronAPI not available (running in browser)

▶ Testing close prevention messaging
[14:25:27] ✓ Active session detected (close prevention should be active)

▶ Testing lock detection setup
[14:25:27] ✓ Lock detection API available (Page Visibility API)
[14:25:27] ℹ Screenshot saved: screenshots/electron-features-test-1710598527012.png

================================================================================
  TEST SUMMARY REPORT
================================================================================

Test Execution Summary:
────────────────────────────────────────────────────────────────────────────────
Total Tests:      28
Passed:           27
Failed:           0
Warnings:         1
Screenshots:      32
Duration:         102.45s
Success Rate:     96.4%

Screenshots:
────────────────────────────────────────────────────────────────────────────────
1. Login page initial
   screenshots/login-page-initial-1710598429123.png
2. Login page filled
   screenshots/login-page-filled-1710598431456.png
3. Login success dashboard
   screenshots/login-success-dashboard-1710598435789.png
4. Route Dashboard
   screenshots/route-dashboard-1710598437012.png
5. Dashboard button clicked
   screenshots/dashboard-button-clicked-1710598438345.png
... (27 more screenshots)

================================================================================

  ALL TESTS PASSED!

[14:25:27] ℹ Report saved to: screenshots/test-report.json
```

---

## JSON Report Example

**File:** `screenshots/test-report.json`

```json
{
  "total": 28,
  "passed": 27,
  "failed": 0,
  "warnings": 1,
  "errors": [],
  "screenshots": [
    {
      "name": "Login page initial",
      "path": "D:\\Development\\fastapi-project-management\\frontend\\tests\\screenshots\\login-page-initial-1710598429123.png"
    },
    {
      "name": "Login page filled",
      "path": "D:\\Development\\fastapi-project-management\\frontend\\tests\\screenshots\\login-page-filled-1710598431456.png"
    },
    {
      "name": "Login success dashboard",
      "path": "D:\\Development\\fastapi-project-management\\frontend\\tests\\screenshots\\login-success-dashboard-1710598435789.png"
    },
    {
      "name": "Route Dashboard",
      "path": "D:\\Development\\fastapi-project-management\\frontend\\tests\\screenshots\\route-dashboard-1710598437012.png"
    }
  ],
  "startTime": "2026-03-16T14:23:45.000Z",
  "endTime": "2026-03-16T14:25:27.000Z"
}
```

---

## Example with Failures

```
================================================================================
  TEST SUMMARY REPORT
================================================================================

Test Execution Summary:
────────────────────────────────────────────────────────────────────────────────
Total Tests:      28
Passed:           25
Failed:           3
Warnings:         2
Screenshots:      30
Duration:         98.23s
Success Rate:     89.3%

Errors:
────────────────────────────────────────────────────────────────────────────────
1. Route Teams
   Timeout waiting for navigation after 30000ms
2. Time tracking flow
   Clock In button not found
3. Heartbeat functionality
   No heartbeat requests detected - user may not be clocked in

Screenshots:
────────────────────────────────────────────────────────────────────────────────
1. Login page initial
   screenshots/login-page-initial-1710598429123.png
... (29 more screenshots)

================================================================================

  3 TEST(S) FAILED

[14:25:27] ℹ Report saved to: screenshots/test-report.json
```

---

## Color Legend

When you run the test, you'll see these colors in the console:

- **Bright Blue** - Section headers
- **Green ✓** - Successful tests
- **Red ✗** - Failed tests
- **Yellow ⚠** - Warnings (non-critical issues)
- **Cyan ℹ** - Information messages
- **Dim Gray** - Timestamps and secondary info

---

## Screenshots Generated

Here's what screenshots you can expect:

### Login Flow (3 screenshots)
1. `login-page-initial-{timestamp}.png` - Initial login page
2. `login-page-filled-{timestamp}.png` - Form filled with credentials
3. `login-success-dashboard-{timestamp}.png` - After successful login

### All Routes (12+ screenshots)
4. `route-dashboard-{timestamp}.png`
5. `route-attendance-{timestamp}.png`
6. `route-tasks-{timestamp}.png`
7. `route-worksheets-{timestamp}.png`
8. `route-forms-{timestamp}.png`
9. `route-teams-{timestamp}.png`
10. `route-users-{timestamp}.png`
11. `route-reports-{timestamp}.png`
12. `route-notifications-{timestamp}.png`
13. `route-profile-{timestamp}.png`
14. `route-my-team-{timestamp}.png`

### Page Interactions (4+ screenshots)
15. `attendance-page-detailed-{timestamp}.png`
16. `tasks-page-detailed-{timestamp}.png`
17. `worksheets-page-detailed-{timestamp}.png`
18. `profile-page-detailed-{timestamp}.png`

### Time Tracking (3 screenshots)
19. `time-tracking-before-clock-in-{timestamp}.png`
20. `time-tracking-clocked-in-{timestamp}.png`
21. `time-tracking-heartbeat-check-{timestamp}.png`

### Other Tests (2 screenshots)
22. `heartbeat-test-{timestamp}.png`
23. `electron-features-test-{timestamp}.png`

### Errors (if any)
24. `login-error-{timestamp}.png`
25. `route-{page}-error-{timestamp}.png`
26. `time-tracking-error-{timestamp}.png`

**Total:** 20-30+ screenshots depending on interactions and errors

---

## Exit Codes

- **Exit 0** - All tests passed (Green success message)
- **Exit 1** - One or more tests failed (Red failure message)

You can use this in CI/CD to automatically fail builds when tests fail.
