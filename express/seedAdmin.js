require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (existingAdmin) {
      console.log('\n✅ Admin user already exists:');
      console.log('Email:', existingAdmin.email);
      console.log('Employee ID:', existingAdmin.employee_id);
      console.log('\nYou can login with this admin account.');
      console.log('If you forgot the password, you can manually update it in MongoDB.\n');
    } else {
      // Create default admin user
      const admin = new User({
        email: 'admin@example.com',
        employee_id: 'ADMIN001',
        password: 'admin123', // Will be hashed automatically by the model
        full_name: 'System Administrator',
        role: 'admin',
        phone: '1234567890',
        department: 'IT',
        is_active: true
      });

      await admin.save();

      console.log('\n✅ Admin user created successfully!');
      console.log('\n📝 Login Credentials:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Email:       admin@example.com');
      console.log('Employee ID: ADMIN001');
      console.log('Password:    admin123');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n⚠️  Please change the password after first login!\n');
    }

    // List all users
    const allUsers = await User.find().select('email employee_id role full_name is_active');
    console.log('\n📋 All Users in Database:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    allUsers.forEach(user => {
      console.log(`${user.role.toUpperCase().padEnd(12)} | ${user.email.padEnd(25)} | ${user.employee_id.padEnd(12)} | ${user.full_name} ${user.is_active ? '✅' : '❌'}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdminUser();
