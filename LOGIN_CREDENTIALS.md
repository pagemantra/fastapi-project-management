# 🔐 Login Credentials

## 🌐 Login URL
**http://localhost:5177/login**

---

## 👥 Test Accounts

All accounts are active and ready to use. You can login with either **Email** or **Employee ID**.

### 🔴 ADMIN Account
```
Email:       admin@example.com
Employee ID: ADMIN001
Password:    admin123
```

**Admin Permissions:**
- ✅ Full system access
- ✅ User management (create, edit, delete)
- ✅ Team management
- ✅ Form builder
- ✅ View all worksheets
- ✅ Approve worksheets
- ✅ Access all reports
- ✅ Break settings configuration

---

### 🔵 MANAGER Account
```
Email:       manager@example.com
Employee ID: MGR001
Password:    manager123
```

**Manager Permissions:**
- ✅ User management (limited)
- ✅ Team management
- ✅ Form builder
- ✅ View all worksheets
- ✅ Approve verified worksheets
- ✅ Access all reports
- ✅ Break settings configuration

---

### 🟢 TEAM LEAD Account
```
Email:       teamlead@example.com
Employee ID: TL001
Password:    teamlead123
```

**Team Lead Permissions:**
- ✅ View my team
- ✅ Verify team member worksheets
- ✅ Create and assign tasks
- ✅ View team attendance
- ✅ Limited reports access

---

### 🟡 EMPLOYEE Account
```
Email:       employee@example.com
Employee ID: EMP001
Password:    employee123
```

**Employee Permissions:**
- ✅ Clock in/out
- ✅ Take breaks
- ✅ Create and submit worksheets
- ✅ View my tasks
- ✅ Update task status
- ✅ View my worksheets
- ✅ View attendance history

---

## 🔄 How to Login

1. Open http://localhost:5177/login
2. Enter **Email** or **Employee ID** in the username field
3. Enter the password
4. Click "Login"

**Examples:**
- Username: `admin@example.com` → Password: `admin123`
- Username: `ADMIN001` → Password: `admin123`
- Username: `manager@example.com` → Password: `manager123`
- Username: `MGR001` → Password: `manager123`

---

## 🛠️ How to Create More Users

### Option 1: Using Admin Panel (Recommended)
1. Login as Admin
2. Go to "Users" page
3. Click "Add User"
4. Fill in the details
5. Assign role and save

### Option 2: Using Seed Script
```bash
cd express
node seedAllUsers.js
```

This will create/update all test accounts.

---

## 🔐 Password Security

⚠️ **IMPORTANT:** These are test credentials!

**For Production:**
1. Change all default passwords immediately
2. Use strong passwords (min 8 chars, mix of letters, numbers, symbols)
3. Update JWT_SECRET in `.env` file
4. Enable password complexity requirements
5. Implement password expiry policies

---

## 📝 Account Hierarchy

```
Admin (System Administrator)
  └─ Manager (John Manager)
      ├─ Team Lead (Sarah Team Lead)
      │   └─ Employee (Mike Employee)
      └─ Other employees can be added
```

---

## 🧪 Testing Different Roles

### Test as Admin:
- Login with admin credentials
- Create users, teams, forms
- View all reports and analytics
- Manage the entire system

### Test as Manager:
- Login with manager credentials
- Approve worksheets
- View team performance
- Generate reports

### Test as Team Lead:
- Login with team lead credentials
- Verify employee worksheets
- Manage team tasks
- Monitor team attendance

### Test as Employee:
- Login with employee credentials
- Clock in/out
- Create daily worksheets
- Complete assigned tasks
- View personal attendance

---

## 🆘 Troubleshooting

**Can't Login?**
1. Check if backend is running: http://localhost:8000/health
2. Check if frontend is running: http://localhost:5177
3. Clear browser cache and localStorage
4. Make sure MongoDB is running
5. Re-run seed script: `node seedAllUsers.js`

**Forgot Password?**
Since this is development, you can:
1. Re-run the seed script to reset passwords
2. Or manually update password in MongoDB

**Need to Reset Everything?**
```bash
# Drop all users and recreate
cd express
node seedAllUsers.js
```

---

## 🔑 API Authentication

**For API Testing (Postman/Insomnia):**

1. **Login to get token:**
```http
POST http://localhost:8000/auth/login
Content-Type: application/json

{
  "username": "admin@example.com",
  "password": "admin123"
}
```

2. **Use the token in subsequent requests:**
```http
GET http://localhost:8000/users
Authorization: Bearer <your-token-here>
```

---

## 📞 Support

If you encounter any issues:
1. Check server logs in terminal
2. Check browser console for errors
3. Verify MongoDB connection
4. Check API endpoints at http://localhost:8000/health

---

**Last Updated:** 2025-11-28
**Backend:** Express.js + MongoDB
**Frontend:** React + Vite
