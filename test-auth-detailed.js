#!/usr/bin/env node

/**
 * Detailed Authentication Flow Test
 * Tests with detailed error logging
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:8000';
const TEST_CREDENTIALS = {
  employee_id: 'JSAN313',
  password: 'JSAN313@456'
};

async function test() {
  try {
    console.log('Step 1: Testing login...');
    const loginResponse = await axios.post(`${BACKEND_URL}/auth/login`, {
      employee_id: TEST_CREDENTIALS.employee_id,
      password: TEST_CREDENTIALS.password
    });

    console.log('Login successful!');
    console.log('Response:', JSON.stringify(loginResponse.data, null, 2));
    const token = loginResponse.data.access_token;

    console.log('\nStep 2: Testing /auth/me endpoint with token...');
    console.log('Token:', token.substring(0, 20) + '...');

    try {
      const meResponse = await axios.get(`${BACKEND_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Success!');
      console.log('Response:', JSON.stringify(meResponse.data, null, 2));
    } catch (meError) {
      console.log('Error details:');
      console.log('Status:', meError.response?.status);
      console.log('Error data:', JSON.stringify(meError.response?.data, null, 2));
      console.log('Message:', meError.message);

      if (meError.response?.data) {
        console.log('\nFull error response:');
        console.log(JSON.stringify(meError.response.data, null, 2));
      }
    }

    console.log('\nStep 3: Testing without token (should fail with 401)...');
    try {
      await axios.get(`${BACKEND_URL}/auth/me`);
    } catch (error) {
      console.log('Expected error - Status:', error.response?.status);
      console.log('Message:', error.response?.data?.detail);
    }

  } catch (error) {
    console.log('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();
