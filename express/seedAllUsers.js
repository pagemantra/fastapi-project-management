require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    const users = [
      {
        email: 'admin@example.com',
        employee_id: 'ADMIN001',
        password: 'admin123',
        full_name: 'System Administrator',
        role: 'admin',
        phone: '1234567890',
        department: 'IT'
      },
      {
        email: 'manager@example.com',
        employee_id: 'MGR001',
        password: 'manager123',
        full_name: 'John Manager',
        role: 'manager',
        phone: '1234567891',
        department: 'Operations'
      },
      {
        email: 'teamlead@example.com',
        employee_id: 'TL001',
        password: 'teamlead123',
        full_name: 'Sarah Team Lead',
        role: 'team_lead',
        phone: '1234567892',
        department: 'Development'
      },
      {
        email: 'employee@example.com',
        employee_id: 'EMP001',
        password: 'employee123',
        full_name: 'Mike Employee',
        role: 'employee',
        phone: '1234567893',
        department: 'Development'
      }
    ];

    console.log('🔄 Creating users...\n');

    for (const userData of users) {
      const existing = await User.findOne({ email: userData.email });
      if (!existing) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created: ${userData.role.toUpperCase()} - ${userData.email}`);
      } else {
        console.log(`⏭️  Skipped: ${userData.role.toUpperCase()} - ${userData.email} (already exists)`);
      }
    }

    // Set up relationships after users are created
    const manager = await User.findOne({ email: 'manager@example.com' });
    const teamLead = await User.findOne({ email: 'teamlead@example.com' });
    const employee = await User.findOne({ email: 'employee@example.com' });

    if (manager && teamLead && !teamLead.manager_id) {
      teamLead.manager_id = manager._id;
      await teamLead.save();
      console.log('\n✅ Assigned manager to team lead');
    }

    if (manager && employee && !employee.manager_id) {
      employee.manager_id = manager._id;
      await employee.save();
      console.log('✅ Assigned manager to employee');
    }

    if (teamLead && employee && !employee.team_lead_id) {
      employee.team_lead_id = teamLead._id;
      await employee.save();
      console.log('✅ Assigned team lead to employee');
    }

    // Display all users
    const allUsers = await User.find().select('email employee_id role full_name is_active');

    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                     LOGIN CREDENTIALS                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    allUsers.forEach(user => {
      const password = user.role === 'admin' ? 'admin123' :
                      user.role === 'manager' ? 'manager123' :
                      user.role === 'team_lead' ? 'teamlead123' : 'employee123';

      console.log(`┌─────────────────────────────────────────────────────────────────┐`);
      console.log(`│ ${user.role.toUpperCase().padEnd(15)} │ ${user.full_name.padEnd(25)} ${user.is_active ? '✅' : '❌'}      │`);
      console.log(`├─────────────────────────────────────────────────────────────────┤`);
      console.log(`│ Email:       ${user.email.padEnd(48)} │`);
      console.log(`│ Employee ID: ${user.employee_id.padEnd(48)} │`);
      console.log(`│ Password:    ${password.padEnd(48)} │`);
      console.log(`└─────────────────────────────────────────────────────────────────┘\n`);
    });

    console.log('🌐 Login at: http://localhost:5177/login\n');
    console.log('⚠️  Please change passwords after first login!\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

seedUsers();
