const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function debugIssues() {
  console.log('\n=== DEBUGGING ISSUES ===\n');

  // Issue 1: User profile verification
  console.log('1. Testing User Profile (JSAN313)...');
  try {
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN313',
      password: 'JSAN313@456'
    });
    const token = login.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const profile = await axios.get(`${BASE_URL}/auth/me`, { headers });
    console.log('   Profile data:', JSON.stringify(profile.data, null, 2));
    console.log('   Role:', profile.data.role);
    console.log('   Expected: associate');
    console.log('   Match:', profile.data.role === 'associate' ? 'YES ✓' : 'NO ✗');
  } catch (error) {
    console.log('   Error:', error.message);
  }

  // Issue 2: Attendance /today endpoint
  console.log('\n2. Testing /attendance/today endpoint...');
  try {
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN261',
      password: 'JSAN261@456'
    });
    const token = login.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const response = await axios.get(`${BASE_URL}/attendance/today`, { headers });
    console.log('   Response:', Array.isArray(response.data) ? `Array with ${response.data.length} items ✓` : response.data);
  } catch (error) {
    console.log('   Error:', error.response?.status, error.response?.data?.detail || error.message);
    console.log('   ENDPOINT MISSING - Need to add it! ✗');
  }

  // Issue 3: Reports productivity data
  console.log('\n3. Testing /reports/productivity endpoint...');
  try {
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      employee_id: 'JSAN261',
      password: 'JSAN261@456'
    });
    const token = login.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await axios.get(`${BASE_URL}/reports/productivity?start_date=${startDate}&end_date=${endDate}`, { headers });
    console.log('   Response structure:', Object.keys(response.data));
    console.log('   Has "overview"?', response.data.overview ? 'YES ✓' : 'NO ✗');
    if (!response.data.overview) {
      console.log('   Full response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.log('   Error:', error.response?.status, error.response?.data?.detail || error.message);
  }

  console.log('\n=== DEBUG COMPLETE ===\n');
}

debugIssues();
