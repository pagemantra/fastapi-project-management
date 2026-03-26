# E2E Test Flow Diagram

## Test Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    START E2E TEST SUITE                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  SETUP PHASE                                                    │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Create screenshots directory                                │
│  ✓ Launch Puppeteer browser                                    │
│  ✓ Create new page/tab                                         │
│  ✓ Enable request interception                                 │
│  ✓ Setup console/error listeners                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 1: LOGIN FLOW                                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Navigate to /login                                          │
│     └─→ Screenshot: login-page-initial                          │
│  2. Check form elements (employee_id, password, submit)         │
│  3. Fill employee ID field                                      │
│  4. Fill password field                                         │
│     └─→ Screenshot: login-page-filled                           │
│  5. Click submit button                                         │
│  6. Wait for navigation                                         │
│  7. Verify URL is /dashboard                                    │
│     └─→ Screenshot: login-success-dashboard                     │
│                                                                 │
│  ✅ Result: PASS or FAIL                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                      ┌──────┴──────┐
                      │  Login OK?  │
                      └──────┬──────┘
                             │
                   ┌─────────┴─────────┐
                   │ YES               │ NO
                   ▼                   ▼
      ┌────────────────────────┐  ┌──────────────────────┐
      │  Continue Tests        │  │  Skip Auth Tests     │
      └────────┬───────────────┘  │  Show Warning        │
               │                  │  Jump to Report      │
               │                  └──────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 2: ALL ROUTES (12 routes)                                 │
├─────────────────────────────────────────────────────────────────┤
│  For each route:                                                │
│                                                                 │
│  Route 1: /dashboard                                            │
│  ├─→ Navigate to route                                          │
│  ├─→ Wait for load                                              │
│  ├─→ Screenshot: route-dashboard                                │
│  ├─→ Check page elements                                        │
│  └─→ Test interactions                                          │
│                                                                 │
│  Route 2: /attendance                                           │
│  ├─→ Navigate to route                                          │
│  ├─→ Wait for load                                              │
│  ├─→ Screenshot: route-attendance                               │
│  ├─→ Check page elements                                        │
│  └─→ Test interactions                                          │
│                                                                 │
│  ... (Repeat for all 10 remaining routes)                       │
│                                                                 │
│  ✅ Result: 11/11 routes tested                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 3: PAGE-SPECIFIC INTERACTIONS                             │
├─────────────────────────────────────────────────────────────────┤
│  Attendance Page:                                               │
│  ├─→ Navigate to /attendance                                    │
│  ├─→ Look for calendar/date picker                              │
│  ├─→ Look for table                                             │
│  └─→ Screenshot: attendance-page-detailed                       │
│                                                                 │
│  Tasks Page:                                                    │
│  ├─→ Navigate to /tasks                                         │
│  ├─→ Look for list/table                                        │
│  └─→ Screenshot: tasks-page-detailed                            │
│                                                                 │
│  Worksheets Page:                                               │
│  ├─→ Navigate to /worksheets                                    │
│  └─→ Screenshot: worksheets-page-detailed                       │
│                                                                 │
│  Profile Page:                                                  │
│  ├─→ Navigate to /profile                                       │
│  ├─→ Look for form elements                                     │
│  ├─→ Count input fields                                         │
│  └─→ Screenshot: profile-page-detailed                          │
│                                                                 │
│  ✅ Result: 4/4 pages tested                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 4: TIME TRACKING FLOW                                     │
├─────────────────────────────────────────────────────────────────┤
│  1. Navigate to /dashboard                                      │
│  2. Look for Clock In button                                    │
│     └─→ Screenshot: time-tracking-before-clock-in               │
│  3. Click Clock In button                                       │
│  4. Wait 5 seconds for state update                             │
│     └─→ Screenshot: time-tracking-clocked-in                    │
│  5. Check for timer/active indicators                           │
│  6. Wait 15 seconds for heartbeat                               │
│  7. Verify heartbeat activity                                   │
│     └─→ Screenshot: time-tracking-heartbeat-check               │
│  8. Look for Clock Out button (don't click)                     │
│                                                                 │
│  ✅ Result: PASS or WARNING                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 5: HEARTBEAT FUNCTIONALITY                                │
├─────────────────────────────────────────────────────────────────┤
│  1. Navigate to /dashboard                                      │
│  2. Clear request log                                           │
│  3. Wait 30 seconds                                             │
│     ├─→ Monitor all network requests                            │
│     └─→ Filter for /heartbeat or /attendance                    │
│  4. Count heartbeat requests                                    │
│  5. Log request details                                         │
│     └─→ Screenshot: heartbeat-test                              │
│                                                                 │
│  Expected: 3+ requests in 30 seconds                            │
│  ✅ Result: PASS or WARNING                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST 6: ELECTRON-SPECIFIC FEATURES                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Check window.electronAPI exists                             │
│     ├─→ If YES: List all methods                                │
│     └─→ If NO: Show warning (browser mode)                      │
│                                                                 │
│  2. Test setClockStatus() if available                          │
│     └─→ Call with true parameter                                │
│                                                                 │
│  3. Check close prevention setup                                │
│     └─→ Look for beforeunload listeners                         │
│                                                                 │
│  4. Check lock detection setup                                  │
│     └─→ Verify Page Visibility API                              │
│     └─→ Screenshot: electron-features-test                      │
│                                                                 │
│  ✅ Result: PASS or WARNING (if in browser)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  REPORT GENERATION                                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Calculate statistics                                        │
│     ├─→ Total tests run                                         │
│     ├─→ Passed count                                            │
│     ├─→ Failed count                                            │
│     ├─→ Warning count                                           │
│     ├─→ Success rate %                                          │
│     └─→ Execution time                                          │
│                                                                 │
│  2. Generate console summary                                    │
│     ├─→ Colorful output                                         │
│     ├─→ Error list                                              │
│     └─→ Screenshot list                                         │
│                                                                 │
│  3. Save JSON report                                            │
│     └─→ screenshots/test-report.json                            │
│                                                                 │
│  4. Display final verdict                                       │
│     ├─→ Green: ALL TESTS PASSED                                 │
│     └─→ Red: X TEST(S) FAILED                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLEANUP                                                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Close browser                                               │
│  2. Exit with code (0 = success, 1 = failure)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page Element Testing Flow

```
For each page:

┌─────────────────────────────────────────────────────────────────┐
│  Navigate to Route                                              │
│  http://localhost:5174/route-path                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Wait for Page Load                                             │
│  ├─→ networkidle0 (preferred)                                   │
│  └─→ domcontentloaded (fallback)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Take Initial Screenshot                                        │
│  └─→ screenshots/route-{name}-{timestamp}.png                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Check Layout Elements                                          │
│  ├─→ Header present?                                            │
│  ├─→ Navigation present?                                        │
│  └─→ Main content area present?                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Count Interactive Elements                                     │
│  ├─→ Buttons: document.querySelectorAll('button')               │
│  ├─→ Inputs: document.querySelectorAll('input')                 │
│  └─→ Links: document.querySelectorAll('a')                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Test Button Interaction (if safe)                              │
│  ├─→ Get first button                                           │
│  ├─→ Check if safe to click                                     │
│  │   (Avoid: Delete, Remove, Clock Out)                         │
│  ├─→ Click button                                               │
│  ├─→ Wait 1 second                                              │
│  └─→ Screenshot: {page}-button-clicked                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Check Console Errors                                           │
│  └─→ Report any errors found                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Record Test Result                                             │
│  ├─→ PASS: All checks successful                                │
│  ├─→ WARNING: Minor issues found                                │
│  └─→ FAIL: Critical error occurred                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Login Flow Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  START LOGIN TEST                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────────┐
                   │  Navigate to /login │
                   │  Wait for load      │
                   └─────────┬───────────┘
                             │
                             ▼
                   ┌─────────────────────┐
                   │  Screenshot #1      │
                   │  login-page-initial │
                   └─────────┬───────────┘
                             │
                             ▼
      ┌──────────────────────────────────────────────┐
      │  Find Form Elements                          │
      │  ├─→ input[placeholder*="Associate ID"]      │
      │  ├─→ input[type="password"]                  │
      │  └─→ button[type="submit"]                   │
      └────────────────────┬─────────────────────────┘
                           │
                           ▼
                  ┌────────┴────────┐
                  │  All elements   │
                  │  found?         │
                  └────────┬────────┘
                           │
                ┌──────────┴──────────┐
                │ YES                 │ NO
                ▼                     ▼
    ┌───────────────────┐   ┌──────────────────┐
    │  Click employee   │   │  FAIL: Missing   │
    │  ID field         │   │  form element    │
    │  Type: JSAN252    │   └──────────────────┘
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Click password   │
    │  field            │
    │  Type: ******     │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Screenshot #2    │
    │  login-page-      │
    │  filled           │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Click submit     │
    │  button           │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Wait for         │
    │  navigation       │
    │  (max 30s)        │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Check current    │
    │  URL              │
    └─────────┬─────────┘
              │
              ▼
       ┌──────┴──────┐
       │  URL is      │
       │  /dashboard? │
       └──────┬──────┘
              │
    ┌─────────┴─────────┐
    │ YES               │ NO
    ▼                   ▼
┌─────────────┐   ┌──────────────┐
│ Screenshot  │   │ FAIL: Wrong  │
│ #3          │   │ redirect     │
│ login-      │   └──────────────┘
│ success-    │
│ dashboard   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ PASS        │
│ Continue    │
│ tests       │
└─────────────┘
```

---

## Screenshot Capture Strategy

```
                    ┌─────────────────────┐
                    │  Screenshot Needed  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Generate filename  │
                    │  {name}-{timestamp} │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Set options:       │
                    │  ├─→ fullPage: true │
                    │  └─→ path: filepath │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  page.screenshot()  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Record in report   │
                    │  { name, path }     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Log to console     │
                    │  "Screenshot saved" │
                    └─────────────────────┘

Screenshot Types:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. State Capture
   ├─→ Before action (initial state)
   ├─→ After action (result state)
   └─→ Error state (if failed)

2. Page Capture
   ├─→ Full page on route visit
   └─→ Detailed view after interaction

3. Flow Capture
   ├─→ Login process steps
   ├─→ Time tracking stages
   └─→ Feature verification

4. Error Capture
   └─→ Automatic on test failure
```

---

## Test Result Aggregation

```
Each Test Returns:
┌─────────────────────────────────────────┐
│  Test Result Object                     │
│  {                                      │
│    name: "Test Name",                   │
│    status: "PASS" | "FAIL" | "WARNING", │
│    duration: 1234ms,                    │
│    error: null | Error object,          │
│    screenshots: [...],                  │
│    metadata: { ... }                    │
│  }                                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  Aggregate Results   │
      │  ├─→ Count totals    │
      │  ├─→ Calc success %  │
      │  ├─→ Group errors    │
      │  └─→ List warnings   │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  Generate Report     │
      │  ├─→ Console output  │
      │  └─→ JSON file       │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  Exit Code           │
      │  ├─→ 0 if all pass   │
      │  └─→ 1 if any fail   │
      └──────────────────────┘
```

---

## Error Handling Flow

```
                ┌─────────────────┐
                │  Test Executes  │
                └────────┬────────┘
                         │
                         ▼
                  ┌──────┴──────┐
                  │  Error?     │
                  └──────┬──────┘
                         │
              ┌──────────┴──────────┐
              │ NO                  │ YES
              ▼                     ▼
    ┌──────────────────┐  ┌──────────────────┐
    │  Record Success  │  │  Catch Error     │
    │  Continue        │  │  ├─→ Log details │
    └──────────────────┘  │  ├─→ Screenshot  │
                          │  ├─→ Save error  │
                          │  └─→ Continue    │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  Critical?       │
                          └────────┬─────────┘
                                   │
                        ┌──────────┴──────────┐
                        │ NO                  │ YES
                        ▼                     ▼
              ┌──────────────────┐  ┌──────────────────┐
              │  Mark as WARNING │  │  Mark as FAILED  │
              │  Continue tests  │  │  Skip dependent  │
              └──────────────────┘  │  tests           │
                                    └──────────────────┘

Critical Errors:
- Login failure
- Browser crash
- Network unavailable

Non-Critical Errors:
- Element not found
- Timeout on optional check
- Missing electronAPI (in browser)
```

This diagram provides a complete visual overview of how the E2E test suite flows from start to finish!
