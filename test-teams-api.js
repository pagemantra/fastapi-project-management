/**
 * Test Teams API to debug the team lead display issue
 */

const https = require('https');

const BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Use a manager credential
const CREDENTIALS = { employee_id: 'JSAN267', password: 'JSAN267@456' };

let token = null;

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('Testing Teams API...\n');

  // Login
  console.log('1. Logging in...');
  const loginRes = await makeRequest('POST', '/auth/login', CREDENTIALS);
  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes);
    return;
  }
  token = loginRes.data.access_token;
  console.log('   ✓ Logged in as', CREDENTIALS.employee_id);
  console.log('   User role:', loginRes.data.user.role);

  // Get teams
  console.log('\n2. Fetching teams...');
  const teamsRes = await makeRequest('GET', '/teams/');
  console.log('   Found', teamsRes.data?.length || 0, 'teams');

  if (teamsRes.data && teamsRes.data.length > 0) {
    console.log('\n   Teams data:');
    teamsRes.data.forEach((team, i) => {
      console.log(`\n   [${i + 1}] ${team.name}`);
      console.log(`       id: ${team.id}`);
      console.log(`       team_lead_id: ${team.team_lead_id}`);
      console.log(`       team_lead_name: ${team.team_lead_name}`);
      console.log(`       manager_id: ${team.manager_id}`);
      console.log(`       manager_name: ${team.manager_name}`);
    });
  }

  // Get team leads
  console.log('\n3. Fetching team leads...');
  const teamLeadsRes = await makeRequest('GET', '/users/team-leads');
  console.log('   Found', teamLeadsRes.data?.length || 0, 'team leads');

  if (teamLeadsRes.data && teamLeadsRes.data.length > 0) {
    console.log('\n   Team leads data:');
    teamLeadsRes.data.forEach((tl, i) => {
      console.log(`\n   [${i + 1}] ${tl.full_name}`);
      console.log(`       id: ${tl.id}`);
      console.log(`       employee_id: ${tl.employee_id}`);
      console.log(`       role: ${tl.role}`);
    });
  }

  // Compare IDs
  console.log('\n4. ID Matching Analysis:');
  if (teamsRes.data && teamLeadsRes.data) {
    teamsRes.data.forEach(team => {
      const teamLeadId = team.team_lead_id;
      const matchingTL = teamLeadsRes.data.find(tl => tl.id === teamLeadId);

      console.log(`\n   Team: ${team.name}`);
      console.log(`   team_lead_id from team: "${teamLeadId}" (type: ${typeof teamLeadId})`);

      if (matchingTL) {
        console.log(`   ✓ MATCH FOUND: ${matchingTL.full_name}`);
      } else {
        console.log(`   ✗ NO MATCH in team leads list!`);

        // Try to find by other fields
        const byEmployeeId = teamLeadsRes.data.find(tl => tl.employee_id === teamLeadId);
        if (byEmployeeId) {
          console.log(`   ! Found by employee_id instead: ${byEmployeeId.full_name}`);
        }

        // Show all TL IDs for comparison
        console.log(`   Available TL IDs:`);
        teamLeadsRes.data.forEach(tl => {
          console.log(`     - "${tl.id}" (${tl.full_name})`);
        });
      }
    });
  }

  console.log('\n✨ Done!');
}

main().catch(console.error);
