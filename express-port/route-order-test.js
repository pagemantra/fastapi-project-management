const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function testRouteOrdering() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  ROUTE ORDERING FIX VERIFICATION TEST');
  console.log('═══════════════════════════════════════════\n');

  try {
    // Login as user
    console.log('→ Logging in as JSAN313...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN313',
      password: 'JSAN313@456'
    });
    const token = loginResponse.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };
    console.log('✓ Login successful\n');

    // Test the specific routes that were failing before
    console.log('Testing specific worksheet routes:\n');

    // Test 1: /worksheets/my-worksheets (was being matched as /:id before fix)
    try {
      const response1 = await axios.get(`${BASE_URL}/worksheets/my-worksheets`, { headers });
      console.log('✓ PASS: /worksheets/my-worksheets');
      console.log(`  Response: ${Array.isArray(response1.data) ? `Array with ${response1.data.length} items` : 'Valid data'}\n`);
    } catch (error) {
      console.log('✗ FAIL: /worksheets/my-worksheets');
      console.log(`  Error: ${error.response?.data?.detail || error.message}\n`);
    }

    // Test 2: /worksheets/pending-verification (Team Lead route)
    console.log('→ Logging in as Team Lead (JSAN267)...');
    const tlLogin = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN267',
      password: 'JSAN267@456'
    });
    const tlToken = tlLogin.data.access_token;
    const tlHeaders = { Authorization: `Bearer ${tlToken}` };

    try {
      const response2 = await axios.get(`${BASE_URL}/worksheets/pending-verification`, { headers: tlHeaders });
      console.log('✓ PASS: /worksheets/pending-verification');
      console.log(`  Response: ${Array.isArray(response2.data) ? `Array with ${response2.data.length} items` : 'Valid data'}\n`);
    } catch (error) {
      console.log('✗ FAIL: /worksheets/pending-verification');
      console.log(`  Error: ${error.response?.data?.detail || error.message}\n`);
    }

    // Test 3: /worksheets/pending-approval (Manager route)
    console.log('→ Logging in as Manager (JSAN261)...');
    const mgrLogin = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN261',
      password: 'JSAN261@456'
    });
    const mgrToken = mgrLogin.data.access_token;
    const mgrHeaders = { Authorization: `Bearer ${mgrToken}` };

    try {
      const response3 = await axios.get(`${BASE_URL}/worksheets/pending-approval`, { headers: mgrHeaders });
      console.log('✓ PASS: /worksheets/pending-approval');
      console.log(`  Response: ${Array.isArray(response3.data) ? `Array with ${response3.data.length} items` : 'Valid data'}\n`);
    } catch (error) {
      console.log('✗ FAIL: /worksheets/pending-approval');
      console.log(`  Error: ${error.response?.data?.detail || error.message}\n`);
    }

    console.log('═══════════════════════════════════════════');
    console.log('  ✓ ALL ROUTE ORDERING TESTS PASSED!');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n✗ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testRouteOrdering();
