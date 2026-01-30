const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement';
const DATABASE_NAME = 'employee_tracking';

async function fixWorksheetForms() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DATABASE_NAME);

    // Step 1: Find all worksheets with form_id: null
    const worksheetsWithoutForm = await db.collection('worksheets').find({
      $or: [
        { form_id: null },
        { form_id: { $exists: false } }
      ]
    }).toArray();

    console.log(`Found ${worksheetsWithoutForm.length} worksheets without form_id`);

    if (worksheetsWithoutForm.length === 0) {
      console.log('No worksheets to fix!');
      return;
    }

    // Step 2: Get all teams with their members and assigned forms
    const teams = await db.collection('teams').find({ is_active: true }).toArray();
    console.log(`Found ${teams.length} active teams`);

    // Step 3: Get all forms with their assigned teams
    const forms = await db.collection('forms').find({ is_active: true }).toArray();
    console.log(`Found ${forms.length} active forms`);

    // Create a map: team_id -> form_id
    const teamFormMap = {};
    forms.forEach(form => {
      if (form.assigned_teams && form.assigned_teams.length > 0) {
        form.assigned_teams.forEach(teamId => {
          const teamIdStr = teamId.toString ? teamId.toString() : String(teamId);
          teamFormMap[teamIdStr] = form._id.toString();
        });
      }
    });
    console.log('Team to Form mapping:', teamFormMap);

    // Create a map: employee_id -> team_id (from team members)
    const employeeTeamMap = {};
    teams.forEach(team => {
      if (team.members && team.members.length > 0) {
        team.members.forEach(memberId => {
          const memberIdStr = memberId.toString ? memberId.toString() : String(memberId);
          employeeTeamMap[memberIdStr] = team._id.toString();
        });
      }
    });
    console.log('Employee to Team mapping:', employeeTeamMap);

    // Step 4: Update each worksheet
    let updatedCount = 0;
    let skippedCount = 0;

    for (const worksheet of worksheetsWithoutForm) {
      const employeeId = worksheet.employee_id;
      const employeeIdStr = employeeId?.toString ? employeeId.toString() : String(employeeId);

      // Find team for this employee
      const teamId = employeeTeamMap[employeeIdStr];

      if (!teamId) {
        console.log(`Skipping worksheet ${worksheet._id}: Employee ${employeeIdStr} not found in any team`);
        skippedCount++;
        continue;
      }

      // Find form for this team
      const formId = teamFormMap[teamId];

      if (!formId) {
        console.log(`Skipping worksheet ${worksheet._id}: Team ${teamId} has no assigned form`);
        skippedCount++;
        continue;
      }

      // Update worksheet with form_id
      await db.collection('worksheets').updateOne(
        { _id: worksheet._id },
        { $set: { form_id: formId } }
      );

      console.log(`Updated worksheet ${worksheet._id}: Set form_id to ${formId}`);
      updatedCount++;
    }

    console.log(`\nSummary:`);
    console.log(`- Total worksheets without form_id: ${worksheetsWithoutForm.length}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Skipped: ${skippedCount}`);

    // Verify the fix
    console.log('\nVerifying fix...');
    const stillMissing = await db.collection('worksheets').countDocuments({
      $or: [
        { form_id: null },
        { form_id: { $exists: false } }
      ]
    });
    console.log(`Worksheets still without form_id: ${stillMissing}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

fixWorksheetForms();
