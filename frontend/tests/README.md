# API Testing Guide

## Overview

This directory contains comprehensive tests for all REST API endpoints in the FastAPI Project Management system.

## Files

- **api-test.cjs**: Main test suite that tests all API endpoints
- **API_ENDPOINTS_SUMMARY.md**: Complete documentation of all available endpoints

## Prerequisites

- Node.js (v14 or higher)
- Active internet connection to reach the API server
- Valid admin credentials (default: username: `admin`, password: `admin123`)

## Running the Tests

### Run All Tests

```bash
node api-test.cjs
```

Or from the project root:

```bash
node frontend/tests/api-test.cjs
```

## Test Coverage

The test suite covers the following endpoint categories:

### 1. Authentication (3 tests)
- POST /auth/login
- GET /auth/me
- POST /auth/register-admin

### 2. User Management (8 tests)
- GET /users/
- GET /users/{id}
- POST /users/
- PUT /users/{id}
- GET /users/managers
- GET /users/team-leads
- GET /users/employees
- GET /users/all-for-dashboard

### 3. Team Management (6 tests)
- GET /teams/
- GET /teams/{id}
- POST /teams/
- PUT /teams/{id}
- POST /teams/{teamId}/members
- DELETE /teams/{teamId}/members/{employeeId}

### 4. Task Management (8 tests)
- GET /tasks/
- GET /tasks/{id}
- POST /tasks/
- PUT /tasks/{id}
- GET /tasks/my-tasks
- GET /tasks/assigned-by-me
- POST /tasks/{taskId}/work-log
- GET /tasks/summary

### 5. Attendance (12 tests)
- GET /attendance/current
- POST /attendance/clock-in
- POST /attendance/clock-out
- POST /attendance/heartbeat
- POST /attendance/screen-active-time
- POST /attendance/inactive-time
- GET /attendance/history
- GET /attendance/today-all
- POST /attendance/break/start
- POST /attendance/break/end
- GET /attendance/break-settings/{teamId}
- POST /attendance/break-settings
- PUT /attendance/break-settings/{teamId}

### 6. Form Management (7 tests)
- GET /forms/
- GET /forms/{id}
- POST /forms/
- PUT /forms/{id}
- GET /forms/team/{teamId}
- POST /forms/{formId}/assign
- DELETE /forms/{formId}/unassign/{teamId}

### 7. Worksheet Management (16 tests)
- GET /worksheets/
- GET /worksheets/{id}
- POST /worksheets/
- PUT /worksheets/{id}
- POST /worksheets/{id}/submit
- POST /worksheets/{id}/verify
- POST /worksheets/{id}/approve
- POST /worksheets/{id}/dm-approve
- POST /worksheets/{id}/reject
- POST /worksheets/bulk-approve
- POST /worksheets/bulk-dm-approve
- GET /worksheets/my-worksheets
- GET /worksheets/pending-verification
- GET /worksheets/pending-approval
- GET /worksheets/pending-dm-approval
- GET /worksheets/summary

### 8. Notifications (4 tests)
- GET /notifications/
- GET /notifications/unread
- GET /notifications/count
- PUT /notifications/read-all

### 9. Reports (10 tests)
- GET /reports/productivity
- GET /reports/attendance
- GET /reports/overtime
- GET /reports/team-performance
- GET /reports/worksheet-analytics
- GET /reports/projects
- GET /reports/manager-members
- GET /reports/export/productivity
- GET /reports/export/attendance
- GET /reports/export/overtime

**Total: 74+ test cases across 9 categories**

## Test Output

The test suite provides colored console output:

- **GREEN [PASS]**: Test passed successfully
- **RED [FAIL]**: Test failed
- **YELLOW [WARN]**: Warning or conditional pass
- **BLUE [INFO]**: Informational message
- **CYAN**: Section headers

### Sample Output

```
╔════════════════════════════════════════════════════════════════╗
║         FastAPI Project Management - API Test Suite           ║
║                                                                ║
║  API Base URL: https://fastapi-project-management-...         ║
╚════════════════════════════════════════════════════════════════╝

=== Authentication Endpoints ===

[INFO] POST /auth/login - Status: 200
[PASS] POST /auth/login - Admin login
[INFO] GET /auth/me - Status: 200
[PASS] GET /auth/me - Get current user

...

=== Test Summary ===

Results by Test Suite:
────────────────────────────────────────────────────────────
PASS Authentication                3/3 (100.0%)
PASS User Management               8/8 (100.0%)
PASS Team Management               6/6 (100.0%)
...

Overall Results:
  Total Passed:  72
  Total Failed:  2
  Success Rate:  97.3%
```

## Test Features

### Automatic Cleanup
The test suite automatically cleans up all test data after completion:
- Deletes created users
- Deletes created teams
- Deletes created tasks
- Deletes created forms
- Deletes created worksheets
- Clocks out if still clocked in

### Error Handling
- Network error detection
- HTTP status code validation
- Proper error messages for failures
- Graceful handling of permission errors

### Test Data Management
- Creates unique test data using timestamps
- Tracks all created resources
- Sequential test execution to maintain dependencies
- Proper test isolation

## Configuration

To test against a different API server, modify the `API_BASE_URL` constant in `api-test.cjs`:

```javascript
const API_BASE_URL = 'http://localhost:8000'; // or your API URL
```

## Authentication

The test suite requires valid admin credentials. Default credentials:
- Username: `admin`
- Password: `admin123`

To use different credentials, modify the login test in the `testAuthentication()` function.

## Troubleshooting

### All Tests Fail
- Check if the API server is running and accessible
- Verify the API_BASE_URL is correct
- Check your internet connection

### Authentication Tests Fail
- Verify admin credentials are correct
- Check if the admin account exists in the system

### Permission Errors (403)
- Some tests require specific roles
- Ensure the test user has admin privileges

### Timeout Errors
- The default timeout is 30 seconds
- Slow network connections may need increased timeout
- Modify the `timeout` in the config object

### Tests Create Duplicate Data
- The cleanup function should run automatically
- If tests are interrupted, manually delete test data
- Test data is identifiable by timestamp in names

## Development

### Running Individual Test Suites

The test file exports individual test functions that can be imported and run separately:

```javascript
const { testAuthentication, testUserManagement } = require('./api-test.cjs');

// Run only authentication tests
testAuthentication().then(results => {
  console.log(results);
});
```

### Adding New Tests

1. Create a new test function following the pattern
2. Add it to the `testSuites` array in `runAllTests()`
3. Implement cleanup for any created resources
4. Update this README with new test coverage

### Test Function Pattern

```javascript
async function testNewFeature() {
  log.section('New Feature Endpoints');
  let passed = 0;
  let failed = 0;

  // Test 1: Description
  try {
    const response = await request('GET', '/endpoint');
    assert(response.ok, 'Test description') ? passed++ : failed++;
  } catch (error) {
    log.error('Test failed: ' + error.message);
    failed++;
  }

  return { passed, failed };
}
```

## CI/CD Integration

The test suite can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run API Tests
  run: node frontend/tests/api-test.cjs
  env:
    API_BASE_URL: ${{ secrets.API_BASE_URL }}
```

## Contributing

When adding new endpoints to the API:
1. Add corresponding tests in `api-test.cjs`
2. Update `API_ENDPOINTS_SUMMARY.md` with endpoint documentation
3. Update this README with new test coverage
4. Ensure cleanup functions handle new resources

## License

This test suite is part of the FastAPI Project Management system.
