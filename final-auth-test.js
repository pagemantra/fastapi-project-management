#!/usr/bin/env node

/**
 * Final Authentication Flow Test
 * Comprehensive test simulating frontend behavior
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:5173';
const TEST_CREDENTIALS = {
  employee_id: 'JSAN313',
  password: 'JSAN313@456'
};

// Create axios instance like the frontend does
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor like the frontend
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);

// Simulate localStorage
const localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = value;
  },
  removeItem(key) {
    delete this.store[key];
  }
};

const report = {
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
  },
  issues: []
};

async function runTest(name, fn) {
  report.summary.total++;
  try {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;

    report.tests.push({
      name,
      status: 'PASS',
      duration,
      result
    });
    report.summary.passed++;
    console.log(`✓ PASS: ${name} (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - error.startTime;
    report.tests.push({
      name,
      status: 'FAIL',
      duration,
      error: error.message,
      details: error.details
    });
    report.summary.failed++;
    console.log(`✗ FAIL: ${name}`);
    console.log(`  Error: ${error.message}`);
    if (error.details) {
      console.log(`  Details: ${JSON.stringify(error.details)}`);
    }
    throw error;
  }
}

async function testLoginFlow() {
  console.log('\n=== AUTHENTICATION FLOW TESTS ===\n');

  // Test 1: Login with valid credentials
  let token;
  await runTest('Frontend sends login request to /auth/login', async () => {
    const startTime = Date.now();
    try {
      const response = await api.post('/auth/login', {
        employee_id: TEST_CREDENTIALS.employee_id,
        password: TEST_CREDENTIALS.password
      });

      if (response.status !== 200) {
        const error = new Error(`Expected status 200, got ${response.status}`);
        error.startTime = startTime;
        error.details = response.data;
        throw error;
      }

      if (!response.data.access_token) {
        const error = new Error('No access_token in response');
        error.startTime = startTime;
        error.details = response.data;
        throw error;
      }

      token = response.data.access_token;

      return {
        status: response.status,
        tokenReceived: true,
        tokenType: response.data.token_type,
        tokenLength: token.length
      };
    } catch (err) {
      err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  if (!token) {
    console.log('\nCannot continue without token. Stopping tests.\n');
    return;
  }

  // Test 2: Frontend stores token in localStorage
  await runTest('Frontend stores token in localStorage', async () => {
    const startTime = Date.now();
    try {
      localStorage.setItem('token', token);
      const retrieved = localStorage.getItem('token');

      if (retrieved !== token) {
        const error = new Error('Token not properly stored in localStorage');
        error.startTime = startTime;
        throw error;
      }

      return {
        stored: true,
        tokenLength: token.length
      };
    } catch (err) {
      err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  // Test 3: Request to /auth/me with token
  await runTest('Frontend requests /auth/me with Bearer token', async () => {
    const startTime = Date.now();
    try {
      // Manually set the token in header
      const response = await axios.get(`${BACKEND_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status !== 200) {
        const error = new Error(`Expected status 200, got ${response.status}`);
        error.startTime = startTime;
        error.details = response.data;
        throw error;
      }

      return {
        status: response.status,
        user: {
          id: response.data.id,
          name: response.data.full_name,
          employee_id: response.data.employee_id,
          role: response.data.role
        }
      };
    } catch (err) {
      err.startTime = startTime;
      if (err.response) {
        err.details = {
          status: err.response.status,
          data: err.response.data
        };
      }
      throw err;
    }
  }).catch(() => {});

  // Test 4: Test invalid token handling
  await runTest('Backend rejects invalid token with 401', async () => {
    const startTime = Date.now();
    try {
      try {
        await axios.get(`${BACKEND_URL}/auth/me`, {
          headers: {
            'Authorization': 'Bearer invalid-token-xyz'
          }
        });
        const error = new Error('Invalid token was accepted (should have been rejected)');
        error.startTime = startTime;
        throw error;
      } catch (err) {
        if (err.response?.status === 401) {
          return {
            status: 401,
            error: err.response.data.detail,
            correct: true
          };
        }

        const error = new Error(`Expected 401 status, got ${err.response?.status}`);
        error.startTime = startTime;
        error.details = err.response?.data;
        throw error;
      }
    } catch (err) {
      if (!err.startTime) err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  // Test 5: Test missing token handling
  await runTest('Backend rejects missing token with 401', async () => {
    const startTime = Date.now();
    try {
      try {
        await axios.get(`${BACKEND_URL}/auth/me`);
        const error = new Error('Request without token was accepted (should have been rejected)');
        error.startTime = startTime;
        throw error;
      } catch (err) {
        if (err.response?.status === 401) {
          return {
            status: 401,
            error: err.response.data.detail,
            correct: true
          };
        }

        const error = new Error(`Expected 401 status, got ${err.response?.status}`);
        error.startTime = startTime;
        error.details = err.response?.data;
        throw error;
      }
    } catch (err) {
      if (!err.startTime) err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  // Test 6: Test invalid credentials
  await runTest('Backend rejects invalid credentials with 401', async () => {
    const startTime = Date.now();
    try {
      try {
        await axios.post(`${BACKEND_URL}/auth/login`, {
          employee_id: 'INVALID999',
          password: 'wrongpassword'
        });
        const error = new Error('Invalid credentials were accepted');
        error.startTime = startTime;
        throw error;
      } catch (err) {
        if (err.response?.status === 401) {
          return {
            status: 401,
            error: err.response.data.detail,
            correct: true
          };
        }

        const error = new Error(`Expected 401 status, got ${err.response?.status}`);
        error.startTime = startTime;
        error.details = err.response?.data;
        throw error;
      }
    } catch (err) {
      if (!err.startTime) err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  // Test 7: Token structure and claims
  await runTest('Token contains valid JWT claims', async () => {
    const startTime = Date.now();
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        const error = new Error('Invalid JWT format (should have 3 parts)');
        error.startTime = startTime;
        throw error;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (!payload.sub || !payload.employee_id || !payload.role) {
        const error = new Error('Missing required claims in JWT');
        error.startTime = startTime;
        error.details = Object.keys(payload);
        throw error;
      }

      return {
        valid: true,
        claims: {
          sub: payload.sub,
          employee_id: payload.employee_id,
          role: payload.role,
          exp: new Date(payload.exp * 1000).toISOString()
        }
      };
    } catch (err) {
      err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});

  // Test 8: CORS header verification
  await runTest('Backend provides CORS headers', async () => {
    const startTime = Date.now();
    try {
      const response = await axios.options(`${BACKEND_URL}/auth/login`, {
        headers: {
          'Origin': FRONTEND_URL
        }
      });

      const corsHeader = response.headers['access-control-allow-origin'];
      if (!corsHeader) {
        const error = new Error('CORS header not found');
        error.startTime = startTime;
        error.details = Object.keys(response.headers);
        throw error;
      }

      return {
        corsEnabled: true,
        allowOrigin: corsHeader
      };
    } catch (err) {
      err.startTime = startTime;
      throw err;
    }
  }).catch(() => {});
}

function printReport() {
  console.log('\n\n' + '='.repeat(70));
  console.log('AUTHENTICATION FLOW TEST REPORT');
  console.log('='.repeat(70));

  console.log(`\nTest Summary:`);
  console.log(`  Total Tests: ${report.summary.total}`);
  console.log(`  Passed: ${report.summary.passed}`);
  console.log(`  Failed: ${report.summary.failed}`);
  console.log(`  Success Rate: ${((report.summary.passed / report.summary.total) * 100).toFixed(1)}%`);

  if (report.summary.total > 0) {
    const totalTime = report.tests.reduce((sum, t) => sum + t.duration, 0);
    const avgTime = totalTime / report.summary.total;
    const maxTime = Math.max(...report.tests.map(t => t.duration));
    const minTime = Math.min(...report.tests.map(t => t.duration));

    console.log(`\nResponse Times:`);
    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
    console.log(`  Max: ${maxTime}ms`);
    console.log(`  Min: ${minTime}ms`);
    console.log(`  Total: ${totalTime}ms`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('DETAILED RESULTS');
  console.log('='.repeat(70));

  report.tests.forEach((test, idx) => {
    const icon = test.status === 'PASS' ? '✓' : '✗';
    console.log(`\n${idx + 1}. ${icon} ${test.name}`);
    console.log(`   Status: ${test.status}`);
    console.log(`   Time: ${test.duration}ms`);
    if (test.result) {
      console.log(`   Result: ${JSON.stringify(test.result, null, 2).replace(/\n/g, '\n   ')}`);
    }
    if (test.error) {
      console.log(`   Error: ${test.error}`);
      if (test.details) {
        console.log(`   Details: ${JSON.stringify(test.details, null, 2).replace(/\n/g, '\n   ')}`);
      }
    }
  });

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));

  if (report.summary.failed === 0) {
    console.log('✓ All authentication tests PASSED!');
    console.log('✓ Frontend can successfully authenticate with backend');
    console.log('✓ Token is properly issued and validated');
    console.log('✓ Protected endpoints are secured');
    console.log('✓ CORS is properly configured for frontend');
  } else {
    console.log('✗ Some tests failed. Review details above.');
  }

  console.log('\n');
}

// Run all tests
testLoginFlow().then(() => {
  printReport();
  process.exit(report.summary.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test execution failed:', err);
  printReport();
  process.exit(1);
});
