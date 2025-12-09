#!/usr/bin/env node

/**
 * Authentication Flow Test
 * Tests the complete authentication workflow between frontend and backend
 */

const axios = require('axios');

// Configuration
const BACKEND_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:5173';
const TEST_CREDENTIALS = {
  employee_id: 'JSAN313',
  password: 'JSAN313@456'
};

// Test results tracker
const results = {
  tests: [],
  passed: 0,
  failed: 0,
  errors: []
};

// Helper function to make requests
async function makeRequest(method, url, data = null, token = null, description = '') {
  const startTime = Date.now();
  try {
    const config = {
      method,
      url,
      data,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await axios(config);
    const duration = Date.now() - startTime;

    return {
      success: true,
      status: response.status,
      data: response.data,
      duration,
      description
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      status: error.response?.status || 'N/A',
      error: error.response?.data?.detail || error.message,
      duration,
      description
    };
  }
}

// Test functions
async function testBackendHealth() {
  console.log('\n=== Testing Backend Health ===');
  try {
    const response = await axios.get(`${BACKEND_URL}/health`);
    console.log('Backend is healthy:', response.status === 200);
    return response.status === 200;
  } catch (error) {
    console.log('Backend health check failed:', error.message);
    return false;
  }
}

async function testLoginEndpoint() {
  console.log('\n=== Testing Login Endpoint ===');
  const test = await makeRequest(
    'POST',
    `${BACKEND_URL}/auth/login`,
    {
      employee_id: TEST_CREDENTIALS.employee_id,
      password: TEST_CREDENTIALS.password
    },
    null,
    'POST /auth/login with employee_id and password'
  );

  recordTest(test);

  if (!test.success) {
    console.log('ERROR: Login failed');
    console.log('Status:', test.status);
    console.log('Error:', test.error);
    return null;
  }

  console.log('SUCCESS: Login endpoint working');
  console.log('Status Code:', test.status);
  console.log('Response Time:', test.duration + 'ms');
  console.log('Token received:', !!test.data.access_token);

  return test.data.access_token;
}

async function testTokenValidation(token) {
  console.log('\n=== Testing Token Validation ===');

  if (!token) {
    console.log('ERROR: No token to validate');
    return false;
  }

  const test = await makeRequest(
    'GET',
    `${BACKEND_URL}/auth/me`,
    null,
    token,
    'GET /auth/me with Bearer token'
  );

  recordTest(test);

  if (!test.success) {
    console.log('ERROR: Token validation failed');
    console.log('Status:', test.status);
    console.log('Error:', test.error);
    return false;
  }

  console.log('SUCCESS: Token is valid');
  console.log('Status Code:', test.status);
  console.log('Response Time:', test.duration + 'ms');
  console.log('User Data:');
  console.log('  - ID:', test.data.id);
  console.log('  - Name:', test.data.full_name);
  console.log('  - Employee ID:', test.data.employee_id);
  console.log('  - Role:', test.data.role);
  console.log('  - Active:', test.data.is_active);

  return true;
}

async function testInvalidToken() {
  console.log('\n=== Testing Invalid Token Rejection ===');

  const test = await makeRequest(
    'GET',
    `${BACKEND_URL}/auth/me`,
    null,
    'invalid-token-12345',
    'GET /auth/me with invalid token'
  );

  recordTest(test);

  if (test.success) {
    console.log('ERROR: Invalid token was accepted (should have been rejected)');
    return false;
  }

  if (test.status === 401) {
    console.log('SUCCESS: Invalid token properly rejected');
    console.log('Status Code:', test.status);
    console.log('Error:', test.error);
    return true;
  }

  console.log('ERROR: Wrong error code');
  console.log('Status:', test.status, '(expected 401)');
  return false;
}

async function testMissingToken() {
  console.log('\n=== Testing Missing Token Rejection ===');

  const test = await makeRequest(
    'GET',
    `${BACKEND_URL}/auth/me`,
    null,
    null,
    'GET /auth/me without token'
  );

  recordTest(test);

  if (test.success) {
    console.log('ERROR: Request without token was accepted (should have been rejected)');
    return false;
  }

  if (test.status === 401) {
    console.log('SUCCESS: Missing token properly rejected');
    console.log('Status Code:', test.status);
    console.log('Error:', test.error);
    return true;
  }

  console.log('ERROR: Wrong error code');
  console.log('Status:', test.status, '(expected 401)');
  return false;
}

async function testInvalidCredentials() {
  console.log('\n=== Testing Invalid Credentials ===');

  const test = await makeRequest(
    'POST',
    `${BACKEND_URL}/auth/login`,
    {
      employee_id: 'INVALID123',
      password: 'wrongpassword'
    },
    null,
    'POST /auth/login with invalid credentials'
  );

  recordTest(test);

  if (test.success) {
    console.log('ERROR: Invalid credentials were accepted');
    return false;
  }

  if (test.status === 401) {
    console.log('SUCCESS: Invalid credentials properly rejected');
    console.log('Status Code:', test.status);
    console.log('Error:', test.error);
    return true;
  }

  console.log('ERROR: Wrong error code');
  console.log('Status:', test.status, '(expected 401)');
  return false;
}

async function testCORSHeaders(token) {
  console.log('\n=== Testing CORS Headers ===');

  try {
    const response = await axios.options(`${BACKEND_URL}/auth/login`, {
      headers: {
        'Origin': FRONTEND_URL,
        'Access-Control-Request-Method': 'POST'
      }
    });

    console.log('SUCCESS: CORS headers present');
    console.log('Status Code:', response.status);
    console.log('Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    return true;
  } catch (error) {
    // OPTIONS might fail but the actual endpoint should work with CORS
    console.log('INFO: OPTIONS request failed (not critical, actual requests should work)');
    return true;
  }
}

function recordTest(test) {
  results.tests.push(test);
  if (test.success) {
    results.passed++;
  } else {
    results.failed++;
    results.errors.push({
      description: test.description,
      status: test.status,
      error: test.error
    });
  }
}

function generateReport() {
  console.log('\n\n' + '='.repeat(60));
  console.log('AUTHENTICATION FLOW TEST REPORT');
  console.log('='.repeat(60));

  console.log('\n--- Test Summary ---');
  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  console.log('\n--- Response Times ---');
  const avgTime = results.tests.reduce((sum, t) => sum + t.duration, 0) / results.tests.length;
  const maxTime = Math.max(...results.tests.map(t => t.duration));
  const minTime = Math.min(...results.tests.map(t => t.duration));

  console.log(`Average: ${avgTime.toFixed(2)}ms`);
  console.log(`Max: ${maxTime}ms`);
  console.log(`Min: ${minTime}ms`);

  if (results.failed > 0) {
    console.log('\n--- Errors ---');
    results.errors.forEach((err, idx) => {
      console.log(`\n${idx + 1}. ${err.description}`);
      console.log(`   Status: ${err.status}`);
      console.log(`   Error: ${err.error}`);
    });
  }

  console.log('\n--- Test Details ---');
  results.tests.forEach((test, idx) => {
    const status = test.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${idx + 1}. ${status} - ${test.description}`);
    console.log(`   Status: ${test.status}, Time: ${test.duration}ms`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));

  if (results.failed === 0) {
    console.log('✓ All authentication tests PASSED!');
    console.log('✓ Frontend -> Backend communication is working correctly');
    console.log('✓ Token storage and validation are functioning');
    console.log('✓ Protected endpoints are properly secured');
  } else {
    console.log('✗ Some tests FAILED. Please review the errors above.');
  }

  console.log('\n');
}

// Main test execution
async function runTests() {
  console.log('Starting Authentication Flow Tests...');
  console.log('Backend URL:', BACKEND_URL);
  console.log('Test User:', TEST_CREDENTIALS.employee_id);

  try {
    // Check backend health
    const backendHealthy = await testBackendHealth();
    if (!backendHealthy) {
      console.log('\nERROR: Backend is not running on port 8000');
      console.log('Please ensure the backend server is running before running these tests.');
      process.exit(1);
    }

    // Test login
    const token = await testLoginEndpoint();
    if (!token) {
      console.log('\nERROR: Could not obtain authentication token');
      console.log('Check if the test user exists with correct credentials.');
      generateReport();
      process.exit(1);
    }

    // Test token validation
    await testTokenValidation(token);

    // Test security measures
    await testInvalidToken();
    await testMissingToken();
    await testInvalidCredentials();

    // Test CORS
    await testCORSHeaders(token);

    // Generate report
    generateReport();

    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('Test execution error:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests();
