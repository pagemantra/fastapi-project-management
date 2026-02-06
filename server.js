const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const moment = require('moment-timezone');

// ==================== CONFIGURATION ====================

const config = {
  APP_NAME: 'Associate Work Tracking System',
  MONGODB_URL: 'mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement',
  DATABASE_NAME: 'employee_tracking',
  SECRET_KEY: 'your-super-secret-key-change-in-production-2024',
  ALGORITHM: 'HS256',
  ACCESS_TOKEN_EXPIRE_MINUTES: 60 * 24,
  PORT: 8000
};

const UserRole = {
  ADMIN: 'admin',
  DELIVERY_MANAGER: 'delivery_manager',
  MANAGER: 'manager',
  TEAM_LEAD: 'team_lead',
  ASSOCIATE: 'employee'
};

const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed', 
  ON_HOLD: 'on_hold'
};

const TaskPriority = {
  LOW: 'low',  
  MEDIUM: 'medium', 
  HIGH: 'high',
  URGENT: 'urgent'
};

const SessionStatus = {
  ACTIVE: 'active',
  ON_BREAK: 'on_break',
  COMPLETED: 'completed'
};

const BreakType = {
  LUNCH: 'lunch',
  SHORT: 'short',
  OTHER: 'other'
};

const WorksheetStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  TL_VERIFIED: 'tl_verified',
  MANAGER_APPROVED: 'manager_approved',
  DM_APPROVED: 'dm_approved',
  REJECTED: 'rejected'
};

const STANDARD_WORK_HOURS = 8.0;
const IST = 'Asia/Kolkata';

// ==================== DATABASE ====================

let client;
let db;

async function connectToMongo() {
  try {
    client = new MongoClient(config.MONGODB_URL);
    await client.connect();
    db = client.db(config.DATABASE_NAME);

    // Create indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ employee_id: 1 }, { unique: true, sparse: true });

    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

function getDatabase() {
  return db;
}

// ==================== SECURITY UTILITIES ====================

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}

function createAccessToken(data) {
  const expiresIn = config.ACCESS_TOKEN_EXPIRE_MINUTES * 60;
  return jwt.sign(data, config.SECRET_KEY, { algorithm: config.ALGORITHM, expiresIn });
}

function decodeToken(token) {
  try {
    return jwt.verify(token, config.SECRET_KEY, { algorithms: [config.ALGORITHM] });
  } catch (error) {
    return null;
  }
}

// ==================== MIDDLEWARE ====================

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'No authentication token provided' });
    }

    const token = authHeader.substring(7);
    const payload = decodeToken(token);

    if (!payload) {
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }

    const userId = payload.sub;
    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(401).json({ detail: 'Invalid token payload' });
    }

    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ detail: 'Authentication failed' });
  }
}

function requireRoles(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ detail: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        detail: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

// ==================== UTILITIES ====================

function getNow() {
  return moment.utc().toDate();
}

function calculateWorkHours(loginTime, logoutTime, totalBreakMinutes) {
  const totalMinutes = moment(logoutTime).diff(moment(loginTime), 'minutes');
  const workMinutes = totalMinutes - totalBreakMinutes;
  const workHours = Math.max(0, workMinutes / 60);
  const overtimeHours = Math.max(0, workHours - STANDARD_WORK_HOURS);
  return {
    workHours: Math.round(workHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100
  };
}

function formatUserResponse(user) {
  return {
    id: user._id.toString(),
    email: user.email || null,
    full_name: user.full_name,
    employee_id: user.employee_id,
    role: user.role,
    phone: user.phone || null,
    department: user.department || null,
    is_active: user.is_active,
    manager_id: user.manager_id || null,
    team_lead_id: user.team_lead_id || null,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function formatSessionWithCalculatedHours(session) {
  let workHours = session.total_work_hours || 0;
  let overtimeHours = session.overtime_hours || 0;

  // Calculate total break minutes from breaks array (more accurate than stored value)
  const breaks = session.breaks || [];
  let totalBreakMinutes = breaks.reduce((sum, b) => {
    // Use duration_minutes if set, otherwise calculate from timestamps
    if (b.duration_minutes && b.duration_minutes > 0) {
      return sum + b.duration_minutes;
    } else if (b.start_time && b.end_time) {
      // Calculate duration from timestamps for older breaks without duration_minutes
      const duration = moment(b.end_time).diff(moment(b.start_time), 'minutes');
      return sum + Math.max(0, duration);
    }
    return sum;
  }, 0);

  // If stored value is higher (e.g. from clock-out), use that
  if ((session.total_break_minutes || 0) > totalBreakMinutes) {
    totalBreakMinutes = session.total_break_minutes;
  }

  // For active or on_break sessions, calculate work hours in real-time
  if (session.status === SessionStatus.ACTIVE || session.status === SessionStatus.ON_BREAK) {
    const now = getNow();
    const calculated = calculateWorkHours(session.login_time, now, totalBreakMinutes);
    workHours = calculated.workHours;
    overtimeHours = calculated.overtimeHours;
  }

  return {
    id: session._id.toString(),
    employee_id: session.employee_id,
    employee_name: session.employee_name || null,
    date: session.date,
    login_time: session.login_time,
    logout_time: session.logout_time,
    breaks: session.breaks || [],
    total_work_hours: workHours,
    total_break_minutes: totalBreakMinutes,
    overtime_hours: overtimeHours,
    status: session.status,
    worksheet_submitted: session.worksheet_submitted || false,
    current_break_id: session.current_break_id,
    screen_active_seconds: session.screen_active_seconds || 0,
    last_screen_active_update: session.last_screen_active_update,
    created_at: session.created_at,
    updated_at: session.updated_at
  };
}

async function createNotification(recipient_id, type, title, message, related_id = null) {
  const db = getDatabase();
  await db.collection('notifications').insertOne({
    recipient_id,
    type,
    title,
    message,
    related_id,
    is_read: false,
    created_at: getNow()
  });
}

// ==================== EXPRESS APP ====================

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err.name === 'MongoError' && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const detail = field === 'email' ? 'Email already registered' :
                   field === 'employee_id' ? 'Associate ID already exists' :
                   'Duplicate entry detected';
    return res.status(400).json({ detail });
  }

  res.status(500).json({ detail: 'An internal error occurred. Please try again later.' });
});

// ==================== ROUTES ====================

// ===== HEALTH CHECK =====

app.get('/', (req, res) => {
  res.json({
    message: 'Associate Work Tracking System API',
    version: '2.0.0',
    docs: '/docs'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ===== AUTHENTICATION ROUTES =====

// POST /auth/register-admin - Register first admin
app.post('/auth/register-admin', async (req, res) => {
  try {
    const { full_name, employee_id, email, password, phone, department } = req.body;
    const db = getDatabase();

    // Check if admin already exists
    const existingAdmin = await db.collection('users').findOne({ role: UserRole.ADMIN });
    if (existingAdmin) {
      return res.status(400).json({ detail: 'Admin already exists. Please contact existing admin.' });
    }

    // Check email uniqueness if provided
    if (email) {
      const existingEmail = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ detail: 'Email already registered' });
      }
    }

    // Check employee_id uniqueness
    const existingEmpId = await db.collection('users').findOne({ employee_id: employee_id.toUpperCase() });
    if (existingEmpId) {
      return res.status(400).json({ detail: 'Employee ID already exists' });
    }

    const now = getNow();
    const userDoc = {
      full_name,
      employee_id: employee_id.toUpperCase(),
      role: UserRole.ADMIN,
      phone: phone || null,
      department: department || null,
      is_active: true,
      hashed_password: hashPassword(password),
      manager_id: null,
      team_lead_id: null,
      created_at: now,
      updated_at: now,
      created_by: null
    };

    if (email) {
      userDoc.email = email.toLowerCase();
    }

    const result = await db.collection('users').insertOne(userDoc);
    userDoc._id = result.insertedId;

    res.json(formatUserResponse(userDoc));
  } catch (error) {
    console.error('Register admin error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /auth/login - Login with email or employee_id
app.post('/auth/login', async (req, res) => {
  try {
    const { email, employee_id, password } = req.body;
    const db = getDatabase();

    if (!email && !employee_id) {
      return res.status(400).json({ detail: 'Please provide email or employee ID' });
    }

    let user;
    if (employee_id) {
      user = await db.collection('users').findOne({ employee_id: employee_id.toUpperCase() });
    } else if (email) {
      user = await db.collection('users').findOne({ email: email.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    if (!verifyPassword(password, user.hashed_password)) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Account is deactivated' });
    }

    const token = createAccessToken({
      sub: user._id.toString(),
      email: user.email || null,
      employee_id: user.employee_id,
      role: user.role
    });

    res.json({
      access_token: token,
      token_type: 'bearer'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /auth/me - Get current user
app.get('/auth/me', authenticate, (req, res) => {
  res.json(formatUserResponse(req.user));
});

// ===== USER ROUTES =====

// POST /users - Create new user
app.post('/users', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { full_name, employee_id, email, password, role, phone, department, is_active, manager_id, team_lead_id } = req.body;
    const db = getDatabase();
    const creatorRole = req.user.role;
    const creatorId = req.user._id.toString();

    let finalManagerId = manager_id;
    let finalTeamLeadId = team_lead_id;

    // Role validation
    if (creatorRole === UserRole.ADMIN || creatorRole === UserRole.DELIVERY_MANAGER) {
      if (role === UserRole.ADMIN || role === UserRole.DELIVERY_MANAGER) {
        return res.status(403).json({ detail: 'Cannot create admin or delivery manager' });
      }
    } else if (creatorRole === UserRole.MANAGER) {
      if (![UserRole.TEAM_LEAD, UserRole.ASSOCIATE].includes(role)) {
        return res.status(403).json({ detail: 'Managers can only create team leads and associates' });
      }
      finalManagerId = creatorId;
    } else if (creatorRole === UserRole.TEAM_LEAD) {
      if (role !== UserRole.ASSOCIATE) {
        return res.status(403).json({ detail: 'Team leads can only create associates' });
      }
      finalTeamLeadId = creatorId;
      finalManagerId = req.user.manager_id;
    }

    // Check email uniqueness if provided
    if (email) {
      const existingEmail = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ detail: 'Email already registered' });
      }
    }

    // Check employee_id uniqueness
    const existingEmpId = await db.collection('users').findOne({ employee_id });
    if (existingEmpId) {
      return res.status(400).json({ detail: 'Associate ID already exists' });
    }

    // Validate manager_id if provided
    if (finalManagerId) {
      if (!ObjectId.isValid(finalManagerId)) {
        return res.status(400).json({ detail: 'Invalid manager ID format' });
      }
      const manager = await db.collection('users').findOne({
        _id: new ObjectId(finalManagerId),
        role: { $in: [UserRole.MANAGER, UserRole.DELIVERY_MANAGER] }
      });
      if (!manager) {
        return res.status(400).json({ detail: 'Invalid manager ID' });
      }
    }

    // Validate team_lead_id if provided
    if (finalTeamLeadId) {
      if (!ObjectId.isValid(finalTeamLeadId)) {
        return res.status(400).json({ detail: 'Invalid team lead ID format' });
      }
      const teamLead = await db.collection('users').findOne({
        _id: new ObjectId(finalTeamLeadId),
        role: UserRole.TEAM_LEAD
      });
      if (!teamLead) {
        return res.status(400).json({ detail: 'Invalid team lead ID' });
      }
    }

    const now = getNow();
    const userDoc = {
      full_name,
      employee_id,
      role,
      phone: phone || null,
      department: department || null,
      is_active: is_active !== undefined ? is_active : true,
      hashed_password: hashPassword(password),
      manager_id: finalManagerId || null,
      team_lead_id: finalTeamLeadId || null,
      created_at: now,
      updated_at: now,
      created_by: creatorId
    };

    if (email) {
      userDoc.email = email.toLowerCase();
    }

    const result = await db.collection('users').insertOne(userDoc);
    userDoc._id = result.insertedId;

    res.json(formatUserResponse(userDoc));
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users - Get users (role-based filtering)
app.get('/users', authenticate, async (req, res) => {
  try {
    const { role, is_active, skip = 0, limit = 100 } = req.query;
    const db = getDatabase();
    const query = {};
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) {
      // Admin and Delivery Manager see all
    } else if (userRole === UserRole.MANAGER) {
      query.manager_id = userId;
    } else if (userRole === UserRole.TEAM_LEAD) {
      query.team_lead_id = userId;
    } else {
      query._id = req.user._id;
    }

    if (role) query.role = role;
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const users = await db.collection('users')
      .find(query)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // Fetch all teams to get project assignments
    const teams = await db.collection('teams').find({ is_active: true }).toArray();

    // Map users with their project assignments
    const usersWithProjects = users.map(user => {
      const userIdStr = user._id.toString();
      // Find teams where user is a member, team lead, or manager
      const userTeams = teams.filter(team =>
        (team.members && team.members.includes(userIdStr)) ||
        team.team_lead_id === userIdStr ||
        team.manager_id === userIdStr
      );
      const projectNames = userTeams.map(t => t.name);

      return {
        ...formatUserResponse(user),
        projects: projectNames.length > 0 ? projectNames : ['Not Assigned']
      };
    });

    res.json(usersWithProjects);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users/all-for-dashboard
app.get('/users/all-for-dashboard', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = { role: { $nin: [UserRole.ADMIN, UserRole.DELIVERY_MANAGER] } };

    if (userRole === UserRole.TEAM_LEAD) {
      query.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      query.manager_id = userId;
    }

    const users = await db.collection('users').find(query).limit(1000).toArray();
    res.json(users.map(formatUserResponse));
  } catch (error) {
    console.error('Get dashboard users error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users/managers
app.get('/users/managers', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const db = getDatabase();
    const managers = await db.collection('users')
      .find({ role: { $in: [UserRole.MANAGER, UserRole.DELIVERY_MANAGER] }, is_active: true })
      .toArray();
    res.json(managers.map(formatUserResponse));
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users/team-leads
app.get('/users/team-leads', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const db = getDatabase();
    const query = { role: UserRole.TEAM_LEAD, is_active: true };

    if (req.user.role === UserRole.MANAGER) {
      query.manager_id = req.user._id.toString();
    }

    const teamLeads = await db.collection('users').find(query).toArray();
    res.json(teamLeads.map(formatUserResponse));
  } catch (error) {
    console.error('Get team leads error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users/employees
app.get('/users/employees', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;
    let query = { is_active: true };

    if (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) {
      // Admin and Delivery Manager can see all employees and managers
      query.role = { $in: [UserRole.ASSOCIATE, UserRole.MANAGER, UserRole.TEAM_LEAD] };
    } else if (userRole === UserRole.MANAGER) {
      // Managers can see their own team members
      query.manager_id = userId;
      query.role = UserRole.ASSOCIATE;
    } else if (userRole === UserRole.TEAM_LEAD) {
      // Team leads can see their own team members
      query.team_lead_id = userId;
      query.role = UserRole.ASSOCIATE;
    }

    const employees = await db.collection('users').find(query).toArray();
    res.json(employees.map(formatUserResponse));
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /users/:user_id
app.get('/users/:user_id', authenticate, async (req, res) => {
  try {
    const { user_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(user_id)) {
      return res.status(400).json({ detail: 'Invalid user ID format' });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(user_id) });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    // Check access permissions
    const userRole = req.user.role;
    const currentUserId = req.user._id.toString();

    if (userRole === UserRole.ASSOCIATE) {
      if (user._id.toString() !== currentUserId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    } else if (userRole === UserRole.TEAM_LEAD) {
      if (user.team_lead_id !== currentUserId && user._id.toString() !== currentUserId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    } else if (userRole === UserRole.MANAGER) {
      if (user.manager_id !== currentUserId && user._id.toString() !== currentUserId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    }

    res.json(formatUserResponse(user));
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /users/:user_id
app.put('/users/:user_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { user_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(user_id)) {
      return res.status(400).json({ detail: 'Invalid user ID format' });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(user_id) });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.MANAGER && user.manager_id !== userId) {
      return res.status(403).json({ detail: 'Can only update users under your management' });
    } else if (userRole === UserRole.TEAM_LEAD && user.team_lead_id !== userId) {
      return res.status(403).json({ detail: 'Can only update users in your team' });
    }

    const updateData = {};
    const allowedFields = ['full_name', 'phone', 'department', 'is_active', 'manager_id', 'team_lead_id'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Handle role update - only admins and delivery managers can change roles
    if (req.body.role !== undefined) {
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.DELIVERY_MANAGER) {
        return res.status(403).json({ detail: 'Only admins and delivery managers can change user roles' });
      }
      // Prevent changing to admin or delivery_manager role
      if (req.body.role === UserRole.ADMIN || req.body.role === UserRole.DELIVERY_MANAGER) {
        return res.status(403).json({ detail: 'Cannot assign admin or delivery manager role' });
      }
      // Prevent changing admin's or delivery_manager's role
      if (user.role === UserRole.ADMIN || user.role === UserRole.DELIVERY_MANAGER) {
        return res.status(403).json({ detail: 'Cannot change admin or delivery manager role' });
      }
      // Validate role value
      const validRoles = [UserRole.MANAGER, UserRole.TEAM_LEAD, UserRole.ASSOCIATE];
      if (!validRoles.includes(req.body.role)) {
        return res.status(400).json({ detail: 'Invalid role value' });
      }
      updateData.role = req.body.role;
    }

    updateData.updated_at = getNow();

    await db.collection('users').updateOne(
      { _id: new ObjectId(user_id) },
      { $set: updateData }
    );

    const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(user_id) });
    res.json(formatUserResponse(updatedUser));
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /users/:user_id (soft delete)
app.delete('/users/:user_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const { user_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(user_id)) {
      return res.status(400).json({ detail: 'Invalid user ID format' });
    }

    if (req.user._id.toString() === user_id) {
      return res.status(400).json({ detail: 'Cannot delete yourself' });
    }

    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(user_id) },
      { $set: { is_active: false, updated_at: getNow() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'User not found' });
    }

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// ===== TEAM ROUTES =====

// POST /teams - Create team
app.post('/teams', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { name, description, team_lead_id, manager_id } = req.body;
    const db = getDatabase();
    const userRole = req.user.role;
    let finalManagerId = manager_id;

    if (userRole === UserRole.MANAGER) {
      finalManagerId = req.user._id.toString();
    } else {
      if (!ObjectId.isValid(manager_id)) {
        return res.status(400).json({ detail: 'Invalid manager ID format' });
      }
      const manager = await db.collection('users').findOne({
        _id: new ObjectId(manager_id),
        role: { $in: [UserRole.MANAGER, UserRole.DELIVERY_MANAGER] }
      });
      if (!manager) {
        return res.status(400).json({ detail: 'Invalid manager ID' });
      }
    }

    // Validate team lead
    if (!ObjectId.isValid(team_lead_id)) {
      return res.status(400).json({ detail: 'Invalid team lead ID format' });
    }
    const teamLead = await db.collection('users').findOne({
      _id: new ObjectId(team_lead_id),
      role: UserRole.TEAM_LEAD
    });
    if (!teamLead) {
      return res.status(400).json({ detail: 'Invalid team lead ID' });
    }

    if (userRole === UserRole.MANAGER && teamLead.manager_id !== req.user._id.toString()) {
      return res.status(403).json({ detail: 'Team lead must be under your management' });
    }

    const now = getNow();
    const teamDoc = {
      name,
      description: description || null,
      team_lead_id,
      manager_id: finalManagerId,
      members: [],
      is_active: true,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection('teams').insertOne(teamDoc);
    teamDoc._id = result.insertedId;

    res.json({
      id: teamDoc._id.toString(),
      name: teamDoc.name,
      description: teamDoc.description,
      team_lead_id: teamDoc.team_lead_id,
      manager_id: teamDoc.manager_id,
      members: teamDoc.members,
      is_active: teamDoc.is_active,
      created_at: teamDoc.created_at,
      updated_at: teamDoc.updated_at
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /teams - Get teams (role-based)
app.get('/teams', authenticate, async (req, res) => {
  try {
    const { is_active, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const query = {};
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) {
      // Admin and Delivery Manager see all
    } else if (userRole === UserRole.MANAGER) {
      // Managers see teams they manage OR teams where they're members
      query.$or = [
        { manager_id: userId },
        { members: userId }
      ];
    } else if (userRole === UserRole.TEAM_LEAD) {
      // Team Leads see teams they lead OR teams where they're members
      query.$or = [
        { team_lead_id: userId },
        { members: userId }
      ];
    } else {
      query.members = userId;
    }

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    const teams = await db.collection('teams')
      .find(query)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // Fetch team lead and manager names
    const teamLeadIds = [...new Set(teams.map(t => t.team_lead_id).filter(Boolean))];
    const managerIds = [...new Set(teams.map(t => t.manager_id).filter(Boolean))];
    const allUserIds = [...new Set([...teamLeadIds, ...managerIds])];

    const userMap = {};
    if (allUserIds.length > 0) {
      const validUserIds = allUserIds.filter(id => ObjectId.isValid(id));
      if (validUserIds.length > 0) {
        const users = await db.collection('users').find({
          _id: { $in: validUserIds.map(id => new ObjectId(id)) }
        }).toArray();
        users.forEach(u => {
          userMap[u._id.toString()] = u.full_name;
        });
      }
    }

    res.json(teams.map(team => ({
      id: team._id.toString(),
      name: team.name,
      description: team.description,
      team_lead_id: team.team_lead_id,
      team_lead_name: userMap[team.team_lead_id] || null,
      manager_id: team.manager_id,
      manager_name: userMap[team.manager_id] || null,
      members: team.members || [],
      is_active: team.is_active,
      created_at: team.created_at,
      updated_at: team.updated_at
    })));
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /teams/:team_id
app.get('/teams/:team_id', authenticate, async (req, res) => {
  try {
    const { team_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(team_id)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    const team = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    // Check access
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.MANAGER && team.manager_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    } else if (userRole === UserRole.TEAM_LEAD && team.team_lead_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    } else if (userRole === UserRole.ASSOCIATE && !team.members.includes(userId)) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    res.json({
      id: team._id.toString(),
      name: team.name,
      description: team.description,
      team_lead_id: team.team_lead_id,
      manager_id: team.manager_id,
      members: team.members || [],
      is_active: team.is_active,
      created_at: team.created_at,
      updated_at: team.updated_at
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /teams/:team_id
app.put('/teams/:team_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { team_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(team_id)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    const team = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    if (req.user.role === UserRole.MANAGER && team.manager_id !== req.user._id.toString()) {
      return res.status(403).json({ detail: 'Can only update your own teams' });
    }

    const updateData = {};
    const allowedFields = ['name', 'description', 'is_active', 'team_lead_id'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Allow admin and delivery manager to update manager_id as well
    if (req.body.manager_id !== undefined && (req.user.role === UserRole.ADMIN || req.user.role === UserRole.DELIVERY_MANAGER)) {
      updateData.manager_id = req.body.manager_id;
    }

    updateData.updated_at = getNow();

    await db.collection('teams').updateOne(
      { _id: new ObjectId(team_id) },
      { $set: updateData }
    );

    const updatedTeam = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    res.json({
      id: updatedTeam._id.toString(),
      name: updatedTeam.name,
      description: updatedTeam.description,
      team_lead_id: updatedTeam.team_lead_id,
      manager_id: updatedTeam.manager_id,
      members: updatedTeam.members || [],
      is_active: updatedTeam.is_active,
      created_at: updatedTeam.created_at,
      updated_at: updatedTeam.updated_at
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /teams/:team_id/members - Add member
app.post('/teams/:team_id/members', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { team_id } = req.params;
    const { employee_id } = req.body;
    const db = getDatabase();

    if (!ObjectId.isValid(team_id)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    const team = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    // Check permissions
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.MANAGER && team.manager_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    } else if (userRole === UserRole.TEAM_LEAD && team.team_lead_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    if (!ObjectId.isValid(employee_id)) {
      return res.status(400).json({ detail: 'Invalid employee ID format' });
    }

    const employee = await db.collection('users').findOne({
      _id: new ObjectId(employee_id),
      role: { $in: [UserRole.ASSOCIATE, UserRole.MANAGER, UserRole.TEAM_LEAD] }
    });
    if (!employee) {
      return res.status(400).json({ detail: 'Invalid employee ID' });
    }

    if (team.members && team.members.includes(employee_id)) {
      return res.status(400).json({ detail: 'Member is already in the team' });
    }

    // Add member and update employee's team_lead_id
    await db.collection('teams').updateOne(
      { _id: new ObjectId(team_id) },
      {
        $push: { members: employee_id },
        $set: { updated_at: getNow() }
      }
    );

    await db.collection('users').updateOne(
      { _id: new ObjectId(employee_id) },
      {
        $set: {
          team_lead_id: team.team_lead_id,
          manager_id: team.manager_id,
          updated_at: getNow()
        }
      }
    );

    const updatedTeam = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    res.json({
      id: updatedTeam._id.toString(),
      name: updatedTeam.name,
      description: updatedTeam.description,
      team_lead_id: updatedTeam.team_lead_id,
      manager_id: updatedTeam.manager_id,
      members: updatedTeam.members || [],
      is_active: updatedTeam.is_active,
      created_at: updatedTeam.created_at,
      updated_at: updatedTeam.updated_at
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /teams/:team_id/members/:employee_id - Remove member
app.delete('/teams/:team_id/members/:employee_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { team_id, employee_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(team_id) || !ObjectId.isValid(employee_id)) {
      return res.status(400).json({ detail: 'Invalid ID format' });
    }

    const team = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    // Check permissions
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.MANAGER && team.manager_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    } else if (userRole === UserRole.TEAM_LEAD && team.team_lead_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    if (!team.members || !team.members.includes(employee_id)) {
      return res.status(400).json({ detail: 'Employee is not a team member' });
    }

    await db.collection('teams').updateOne(
      { _id: new ObjectId(team_id) },
      {
        $pull: { members: employee_id },
        $set: { updated_at: getNow() }
      }
    );

    await db.collection('users').updateOne(
      { _id: new ObjectId(employee_id) },
      {
        $set: {
          team_lead_id: null,
          updated_at: getNow()
        }
      }
    );

    const updatedTeam = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    res.json({
      id: updatedTeam._id.toString(),
      name: updatedTeam.name,
      description: updatedTeam.description,
      team_lead_id: updatedTeam.team_lead_id,
      manager_id: updatedTeam.manager_id,
      members: updatedTeam.members || [],
      is_active: updatedTeam.is_active,
      created_at: updatedTeam.created_at,
      updated_at: updatedTeam.updated_at
    });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /teams/:team_id
app.delete('/teams/:team_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const { team_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(team_id)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    const result = await db.collection('teams').updateOne(
      { _id: new ObjectId(team_id) },
      { $set: { is_active: false, updated_at: getNow() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    res.json({ message: 'Team deactivated successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// ===== TASK ROUTES =====

// POST /tasks - Create task
app.post('/tasks', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { title, description, priority, status, due_date, estimated_hours, assigned_to, team_id } = req.body;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(assigned_to)) {
      return res.status(400).json({ detail: 'Invalid employee ID format' });
    }

    const employee = await db.collection('users').findOne({
      _id: new ObjectId(assigned_to),
      role: UserRole.ASSOCIATE
    });
    if (!employee) {
      return res.status(400).json({ detail: 'Invalid employee ID or user is not an employee' });
    }

    // Check assignment permissions
    if (userRole === UserRole.MANAGER && employee.manager_id !== userId) {
      return res.status(403).json({ detail: 'Can only assign tasks to employees under your management' });
    } else if (userRole === UserRole.TEAM_LEAD && employee.team_lead_id !== userId) {
      return res.status(403).json({ detail: 'Can only assign tasks to employees in your team' });
    }

    const now = getNow();
    const taskDoc = {
      title,
      description: description || null,
      priority: priority || TaskPriority.MEDIUM,
      status: status || TaskStatus.TODO,
      due_date: due_date ? new Date(due_date) : null,
      estimated_hours: estimated_hours || null,
      actual_hours: 0,
      assigned_to,
      assigned_by: userId,
      team_id: team_id || null,
      work_logs: [],
      created_at: now,
      updated_at: now,
      completed_at: null
    };

    const result = await db.collection('tasks').insertOne(taskDoc);
    taskDoc._id = result.insertedId;

    res.json({
      id: taskDoc._id.toString(),
      title: taskDoc.title,
      description: taskDoc.description,
      priority: taskDoc.priority,
      status: taskDoc.status,
      due_date: taskDoc.due_date,
      estimated_hours: taskDoc.estimated_hours,
      actual_hours: taskDoc.actual_hours,
      assigned_to: taskDoc.assigned_to,
      assigned_by: taskDoc.assigned_by,
      team_id: taskDoc.team_id,
      work_logs: taskDoc.work_logs,
      created_at: taskDoc.created_at,
      updated_at: taskDoc.updated_at,
      completed_at: taskDoc.completed_at
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /tasks - Get tasks (role-based)
app.get('/tasks', authenticate, async (req, res) => {
  try {
    const { status, priority, assigned_to, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const query = {};
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) {
      if (assigned_to) query.assigned_to = assigned_to;
    } else if (userRole === UserRole.MANAGER) {
      const employees = await db.collection('users').find({
        manager_id: userId,
        role: UserRole.ASSOCIATE
      }).toArray();
      query.assigned_to = { $in: employees.map(e => e._id.toString()) };
    } else if (userRole === UserRole.TEAM_LEAD) {
      const employees = await db.collection('users').find({
        team_lead_id: userId,
        role: UserRole.ASSOCIATE
      }).toArray();
      query.assigned_to = { $in: employees.map(e => e._id.toString()) };
    } else {
      query.assigned_to = userId;
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;

    const tasks = await db.collection('tasks')
      .find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours || 0,
      assigned_to: task.assigned_to,
      assigned_by: task.assigned_by,
      team_id: task.team_id,
      work_logs: task.work_logs || [],
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at
    })));
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /tasks/my-tasks
app.get('/tasks/my-tasks', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const db = getDatabase();
    const query = { assigned_to: req.user._id.toString() };

    if (status) query.status = status;

    const tasks = await db.collection('tasks')
      .find(query)
      .sort({ created_at: -1 })
      .toArray();

    res.json(tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours || 0,
      assigned_to: task.assigned_to,
      assigned_by: task.assigned_by,
      team_id: task.team_id,
      work_logs: task.work_logs || [],
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at
    })));
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /tasks/summary
app.get('/tasks/summary', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const now = new Date();

    // Get all tasks assigned to current user
    const tasks = await db.collection('tasks')
      .find({ assigned_to: userId })
      .toArray();

    // Calculate summary statistics
    let total = tasks.length;
    let pending = 0;
    let in_progress = 0;
    let completed = 0;
    let overdue = 0;

    tasks.forEach(task => {
      // Count by status
      if (task.status === 'PENDING') {
        pending++;
      } else if (task.status === 'IN_PROGRESS') {
        in_progress++;
      } else if (task.status === 'COMPLETED') {
        completed++;
      }

      // Count overdue tasks (past due_date and not completed)
      if (task.due_date && task.status !== 'COMPLETED') {
        const dueDate = new Date(task.due_date);
        if (dueDate < now) {
          overdue++;
        }
      }
    });

    res.json({
      total,
      pending,
      in_progress,
      completed,
      overdue
    });
  } catch (error) {
    console.error('Get tasks summary error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /tasks/assigned-by-me
app.get('/tasks/assigned-by-me', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { status } = req.query;
    const db = getDatabase();
    const query = { assigned_by: req.user._id.toString() };

    if (status) query.status = status;

    const tasks = await db.collection('tasks')
      .find(query)
      .sort({ created_at: -1 })
      .toArray();

    res.json(tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours || 0,
      assigned_to: task.assigned_to,
      assigned_by: task.assigned_by,
      team_id: task.team_id,
      work_logs: task.work_logs || [],
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at
    })));
  } catch (error) {
    console.error('Get assigned-by-me tasks error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /tasks/:task_id
app.get('/tasks/:task_id', authenticate, async (req, res) => {
  try {
    const { task_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(task_id)) {
      return res.status(400).json({ detail: 'Invalid task ID format' });
    }

    const task = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    // Check access
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole === UserRole.ASSOCIATE && task.assigned_to !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    } else if (userRole === UserRole.TEAM_LEAD) {
      const employee = await db.collection('users').findOne({ _id: new ObjectId(task.assigned_to) });
      if (employee && employee.team_lead_id !== userId && task.assigned_by !== userId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    } else if (userRole === UserRole.MANAGER) {
      const employee = await db.collection('users').findOne({ _id: new ObjectId(task.assigned_to) });
      if (employee && employee.manager_id !== userId && task.assigned_by !== userId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    }

    res.json({
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours || 0,
      assigned_to: task.assigned_to,
      assigned_by: task.assigned_by,
      team_id: task.team_id,
      work_logs: task.work_logs || [],
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /tasks/:task_id
app.put('/tasks/:task_id', authenticate, async (req, res) => {
  try {
    const { task_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(task_id)) {
      return res.status(400).json({ detail: 'Invalid task ID format' });
    }

    const task = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id.toString();

    let updateData = {};

    // Permission checks
    if (userRole === UserRole.ASSOCIATE) {
      if (task.assigned_to !== userId) {
        return res.status(403).json({ detail: 'Access denied' });
      }
      // Employees can only update status
      if (req.body.status !== undefined) {
        updateData.status = req.body.status;
      }
    } else {
      const allowedFields = ['title', 'description', 'priority', 'status', 'due_date', 'estimated_hours', 'actual_hours', 'assigned_to'];
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
    }

    // Handle completion
    if (updateData.status === TaskStatus.COMPLETED) {
      updateData.completed_at = getNow();
    }

    updateData.updated_at = getNow();

    await db.collection('tasks').updateOne(
      { _id: new ObjectId(task_id) },
      { $set: updateData }
    );

    const updatedTask = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    res.json({
      id: updatedTask._id.toString(),
      title: updatedTask.title,
      description: updatedTask.description,
      priority: updatedTask.priority,
      status: updatedTask.status,
      due_date: updatedTask.due_date,
      estimated_hours: updatedTask.estimated_hours,
      actual_hours: updatedTask.actual_hours || 0,
      assigned_to: updatedTask.assigned_to,
      assigned_by: updatedTask.assigned_by,
      team_id: updatedTask.team_id,
      work_logs: updatedTask.work_logs || [],
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at,
      completed_at: updatedTask.completed_at
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /tasks/:task_id/work-log
app.post('/tasks/:task_id/work-log', authenticate, async (req, res) => {
  try {
    const { task_id } = req.params;
    const { hours_worked, work_date, notes } = req.body;
    const db = getDatabase();

    if (!ObjectId.isValid(task_id)) {
      return res.status(400).json({ detail: 'Invalid task ID format' });
    }

    const task = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    const userId = req.user._id.toString();

    if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.DELIVERY_MANAGER && task.assigned_to !== userId) {
      return res.status(403).json({ detail: 'Only assigned employee can log work hours' });
    }

    const logEntry = {
      logged_by: userId,
      hours_worked,
      work_date,
      notes: notes || null,
      logged_at: moment.tz(IST).format()
    };

    await db.collection('tasks').updateOne(
      { _id: new ObjectId(task_id) },
      {
        $push: { work_logs: logEntry },
        $inc: { actual_hours: hours_worked },
        $set: { updated_at: getNow() }
      }
    );

    const updatedTask = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    res.json({
      id: updatedTask._id.toString(),
      title: updatedTask.title,
      description: updatedTask.description,
      priority: updatedTask.priority,
      status: updatedTask.status,
      due_date: updatedTask.due_date,
      estimated_hours: updatedTask.estimated_hours,
      actual_hours: updatedTask.actual_hours || 0,
      assigned_to: updatedTask.assigned_to,
      assigned_by: updatedTask.assigned_by,
      team_id: updatedTask.team_id,
      work_logs: updatedTask.work_logs || [],
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at,
      completed_at: updatedTask.completed_at
    });
  } catch (error) {
    console.error('Add work log error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /tasks/:task_id
app.delete('/tasks/:task_id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { task_id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(task_id)) {
      return res.status(400).json({ detail: 'Invalid task ID format' });
    }

    const task = await db.collection('tasks').findOne({ _id: new ObjectId(task_id) });
    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id.toString();

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.DELIVERY_MANAGER && task.assigned_by !== userId) {
      return res.status(403).json({ detail: 'Can only delete tasks you assigned' });
    }

    await db.collection('tasks').deleteOne({ _id: new ObjectId(task_id) });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// ===== ATTENDANCE ROUTES =====

// POST /attendance/clock-in
app.post('/attendance/clock-in', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    // Check if already clocked in
    const existing = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: { $in: [SessionStatus.ACTIVE, SessionStatus.ON_BREAK] }
    });

    if (existing) {
      return res.status(400).json({ detail: 'Already clocked in for today' });
    }

    const now = getNow();
    const sessionDoc = {
      employee_id: userId,
      date: today,
      login_time: now,
      logout_time: null,
      breaks: [],
      total_work_hours: 0,
      total_break_minutes: 0,
      overtime_hours: 0,
      status: SessionStatus.ACTIVE,
      worksheet_submitted: false,
      current_break_id: null,
      screen_active_seconds: 0,
      last_screen_active_update: now,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection('time_sessions').insertOne(sessionDoc);
    sessionDoc._id = result.insertedId;

    res.json({
      id: sessionDoc._id.toString(),
      employee_id: sessionDoc.employee_id,
      employee_name: null,
      date: sessionDoc.date,
      login_time: sessionDoc.login_time,
      logout_time: sessionDoc.logout_time,
      breaks: sessionDoc.breaks,
      total_work_hours: sessionDoc.total_work_hours,
      total_break_minutes: sessionDoc.total_break_minutes,
      overtime_hours: sessionDoc.overtime_hours,
      status: sessionDoc.status,
      worksheet_submitted: sessionDoc.worksheet_submitted,
      current_break_id: sessionDoc.current_break_id,
      screen_active_seconds: sessionDoc.screen_active_seconds,
      last_screen_active_update: sessionDoc.last_screen_active_update,
      created_at: sessionDoc.created_at,
      updated_at: sessionDoc.updated_at
    });
  } catch (error) {
    console.error('Clock in error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /attendance/clock-out
app.post('/attendance/clock-out', authenticate, async (req, res) => {
  try {
    const { force } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    const session = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: { $in: [SessionStatus.ACTIVE, SessionStatus.ON_BREAK] }
    });

    if (!session) {
      return res.status(400).json({ detail: 'No active session found for today' });
    }

    // End break if on break
    if (session.status === SessionStatus.ON_BREAK) {
      await endCurrentBreak(db, session);
      // Reload session
      const updatedSession = await db.collection('time_sessions').findOne({ _id: session._id });
      Object.assign(session, updatedSession);
    }

    // Check worksheet submission
    if (!session.worksheet_submitted && !force) {
      return res.status(400).json({ detail: 'Please submit your daily worksheet before clocking out' });
    }

    if (force && req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.DELIVERY_MANAGER) {
      return res.status(403).json({ detail: 'Only admin or delivery manager can force clock out without worksheet' });
    }

    const now = getNow();
    const totalBreakMinutes = session.breaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
    const { workHours, overtimeHours } = calculateWorkHours(session.login_time, now, totalBreakMinutes);

    await db.collection('time_sessions').updateOne(
      { _id: session._id },
      {
        $set: {
          logout_time: now,
          status: SessionStatus.COMPLETED,
          total_work_hours: workHours,
          total_break_minutes: totalBreakMinutes,
          overtime_hours: overtimeHours,
          updated_at: now
        }
      }
    );

    // Create overtime notification if applicable
    if (overtimeHours > 0 && req.user.manager_id) {
      await createNotification(
        req.user.manager_id,
        'OVERTIME_ALERT',
        'Overtime Alert',
        `${req.user.full_name} worked ${overtimeHours.toFixed(1)} hours overtime today.`,
        userId
      );
    }

    const updatedSession = await db.collection('time_sessions').findOne({ _id: session._id });
    res.json(formatSessionWithCalculatedHours({
      ...updatedSession,
      employee_name: null
    }));
  } catch (error) {
    console.error('Clock out error:', error);
    res.status(500).json({ detail: error.message });
  }
});

async function endCurrentBreak(db, session) {
  const now = getNow();
  const currentBreakId = session.current_break_id;

  if (!currentBreakId) return;

  const breaks = session.breaks || [];
  for (let i = 0; i < breaks.length; i++) {
    if (breaks[i].break_id === currentBreakId) {
      const startTime = moment(breaks[i].start_time);
      const duration = moment(now).diff(startTime, 'minutes');
      breaks[i].end_time = now;
      breaks[i].duration_minutes = duration;
      break;
    }
  }

  // Calculate total break minutes from all breaks
  const totalBreakMinutes = breaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);

  await db.collection('time_sessions').updateOne(
    { _id: session._id },
    {
      $set: {
        breaks,
        total_break_minutes: totalBreakMinutes,
        status: SessionStatus.ACTIVE,
        current_break_id: null,
        updated_at: now
      }
    }
  );
}

// POST /attendance/break/start
app.post('/attendance/break/start', authenticate, async (req, res) => {
  try {
    const { break_type, comment } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    const session = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: SessionStatus.ACTIVE
    });

    if (!session) {
      return res.status(400).json({ detail: 'No active session found. Please clock in first.' });
    }

    const now = getNow();
    const breakId = require('crypto').randomUUID();
    const newBreak = {
      break_id: breakId,
      start_time: now,
      end_time: null,
      break_type: break_type || BreakType.SHORT,
      duration_minutes: 0,
      comment: comment || null
    };

    await db.collection('time_sessions').updateOne(
      { _id: session._id },
      {
        $push: { breaks: newBreak },
        $set: {
          status: SessionStatus.ON_BREAK,
          current_break_id: breakId,
          updated_at: now
        }
      }
    );

    const updatedSession = await db.collection('time_sessions').findOne({ _id: session._id });
    res.json(formatSessionWithCalculatedHours({
      ...updatedSession,
      employee_name: null
    }));
  } catch (error) {
    console.error('Start break error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /attendance/break/end
app.post('/attendance/break/end', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    const session = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: SessionStatus.ON_BREAK
    });

    if (!session) {
      return res.status(400).json({ detail: 'No active break found' });
    }

    await endCurrentBreak(db, session);

    const updatedSession = await db.collection('time_sessions').findOne({ _id: session._id });
    res.json(formatSessionWithCalculatedHours({
      ...updatedSession,
      employee_name: null
    }));
  } catch (error) {
    console.error('End break error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /attendance/screen-active-time - Update screen active seconds
app.post('/attendance/screen-active-time', authenticate, async (req, res) => {
  try {
    const { screen_active_seconds } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    // Validate input
    if (typeof screen_active_seconds !== 'number' || screen_active_seconds < 0) {
      return res.status(400).json({ detail: 'Invalid screen_active_seconds value' });
    }

    const session = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: { $in: [SessionStatus.ACTIVE, SessionStatus.ON_BREAK] }
    });

    if (!session) {
      return res.status(400).json({ detail: 'No active session found' });
    }

    const now = getNow();
    await db.collection('time_sessions').updateOne(
      { _id: session._id },
      {
        $set: {
          screen_active_seconds: screen_active_seconds,
          last_screen_active_update: now,
          updated_at: now
        }
      }
    );

    res.json({ success: true, screen_active_seconds });
  } catch (error) {
    console.error('Update screen active time error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /attendance/current
app.get('/attendance/current', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const today = moment.tz(IST).format('YYYY-MM-DD');

    const session = await db.collection('time_sessions').findOne({
      employee_id: userId,
      date: today,
      status: { $in: [SessionStatus.ACTIVE, SessionStatus.ON_BREAK] }
    });

    if (!session) {
      return res.json(null);
    }

    res.json(formatSessionWithCalculatedHours({
      ...session,
      employee_name: null
    }));
  } catch (error) {
    console.error('Get current session error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /attendance/today-all
app.get('/attendance/today-all', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const db = getDatabase();
    const today = moment.tz(IST).format('YYYY-MM-DD');
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = { date: today };

    if (userRole === UserRole.TEAM_LEAD) {
      const teamMembers = await db.collection('users').find({ team_lead_id: userId }).toArray();
      query.employee_id = { $in: teamMembers.map(m => m._id.toString()) };
    } else if (userRole === UserRole.MANAGER) {
      const employees = await db.collection('users').find({ manager_id: userId }).toArray();
      query.employee_id = { $in: employees.map(e => e._id.toString()) };
    }

    const sessions = await db.collection('time_sessions').find(query).limit(1000).toArray();

    // Fetch employee names
    const employeeIds = [...new Set(sessions.map(s => s.employee_id))];
    const employeeCache = {};
    for (const empId of employeeIds) {
      if (ObjectId.isValid(empId)) {
        const emp = await db.collection('users').findOne({ _id: new ObjectId(empId) });
        if (emp) {
          employeeCache[empId] = emp.full_name;
        }
      }
    }

    res.json(sessions.map(s => formatSessionWithCalculatedHours({
      ...s,
      employee_name: employeeCache[s.employee_id] || null
    })));
  } catch (error) {
    console.error('Get today all attendance error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /attendance/today - Alias for /attendance/today-all
app.get('/attendance/today', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const db = getDatabase();
    const today = moment.tz(IST).format('YYYY-MM-DD');
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = { date: today };

    if (userRole === UserRole.TEAM_LEAD) {
      const teamMembers = await db.collection('users').find({ team_lead_id: userId }).toArray();
      query.employee_id = { $in: teamMembers.map(m => m._id.toString()) };
    } else if (userRole === UserRole.MANAGER) {
      const employees = await db.collection('users').find({ manager_id: userId }).toArray();
      query.employee_id = { $in: employees.map(e => e._id.toString()) };
    }

    const sessions = await db.collection('time_sessions').find(query).limit(1000).toArray();

    // Fetch employee names
    const employeeIds = [...new Set(sessions.map(s => s.employee_id))];
    const employeeCache = {};
    for (const empId of employeeIds) {
      if (ObjectId.isValid(empId)) {
        const emp = await db.collection('users').findOne({ _id: new ObjectId(empId) });
        if (emp) {
          employeeCache[empId] = emp.full_name;
        }
      }
    }

    res.json(sessions.map(s => formatSessionWithCalculatedHours({
      ...s,
      employee_name: employeeCache[s.employee_id] || null
    })));
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /attendance/history
app.get('/attendance/history', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, employee_id, skip = 0, limit = 100 } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = {};

    // Role-based filtering
    if (userRole === UserRole.ASSOCIATE) {
      query.employee_id = userId;
    } else if (userRole === UserRole.TEAM_LEAD) {
      if (employee_id) {
        const employee = await db.collection('users').findOne({ _id: new ObjectId(employee_id) });
        if (employee && employee.team_lead_id === userId) {
          query.employee_id = employee_id;
        } else {
          query.employee_id = userId;
        }
      } else {
        const teamMembers = await db.collection('users').find({ team_lead_id: userId }).toArray();
        const memberIds = teamMembers.map(m => m._id.toString());
        query.employee_id = { $in: [...memberIds, userId] };
      }
    } else if (userRole === UserRole.MANAGER) {
      if (employee_id) {
        query.employee_id = employee_id;
      } else {
        const employees = await db.collection('users').find({ manager_id: userId }).toArray();
        const employeeIds = employees.map(e => e._id.toString());
        query.employee_id = { $in: [...employeeIds, userId] };
      }
    } else if (employee_id) {
      query.employee_id = employee_id;
    }

    if (start_date) {
      query.date = { $gte: start_date };
    }
    if (end_date) {
      if (query.date) {
        query.date.$lte = end_date;
      } else {
        query.date = { $lte: end_date };
      }
    }

    const sessions = await db.collection('time_sessions')
      .find(query)
      .sort({ date: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // Fetch employee names
    const employeeIds = [...new Set(sessions.map(s => s.employee_id))];
    const employeeCache = {};
    for (const empId of employeeIds) {
      if (ObjectId.isValid(empId)) {
        const emp = await db.collection('users').findOne({ _id: new ObjectId(empId) });
        if (emp) {
          employeeCache[empId] = emp.full_name;
        }
      }
    }

    res.json(sessions.map(s => formatSessionWithCalculatedHours({
      ...s,
      employee_name: employeeCache[s.employee_id] || null
    })));
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /attendance/break-settings/:teamId - Get break settings for a team
app.get('/attendance/break-settings/:teamId', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { teamId } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(teamId)) {
      return res.status(400).json({ detail: 'Invalid team ID' });
    }

    const settings = await db.collection('break_settings').findOne({ team_id: teamId });

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        team_id: teamId,
        enforce_limits: false,
        max_breaks_per_day: 4,
        max_break_duration_minutes: 60,
        lunch_break_duration: 60,
        short_break_duration: 15,
        created_at: null,
        updated_at: null
      });
    }

    res.json({
      id: settings._id.toString(),
      team_id: settings.team_id,
      enforce_limits: settings.enforce_limits || false,
      max_breaks_per_day: settings.max_breaks_per_day || 4,
      max_break_duration_minutes: settings.max_break_duration_minutes || 60,
      lunch_break_duration: settings.lunch_break_duration || 60,
      short_break_duration: settings.short_break_duration || 15,
      created_at: settings.created_at,
      updated_at: settings.updated_at
    });
  } catch (error) {
    console.error('Get break settings error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /attendance/break-settings - Create break settings for a team
app.post('/attendance/break-settings', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { team_id, enforce_limits, max_breaks_per_day, max_break_duration_minutes, lunch_break_duration, short_break_duration } = req.body;
    const db = getDatabase();

    if (!team_id) {
      return res.status(400).json({ detail: 'team_id is required' });
    }

    if (!ObjectId.isValid(team_id)) {
      return res.status(400).json({ detail: 'Invalid team ID' });
    }

    // Check if team exists
    const team = await db.collection('teams').findOne({ _id: new ObjectId(team_id) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    // Check if settings already exist
    const existing = await db.collection('break_settings').findOne({ team_id });
    if (existing) {
      return res.status(400).json({ detail: 'Break settings already exist for this team. Use PUT to update.' });
    }

    const now = getNow();
    const newSettings = {
      team_id,
      enforce_limits: enforce_limits || false,
      max_breaks_per_day: max_breaks_per_day || 4,
      max_break_duration_minutes: max_break_duration_minutes || 60,
      lunch_break_duration: lunch_break_duration || 60,
      short_break_duration: short_break_duration || 15,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection('break_settings').insertOne(newSettings);

    res.status(201).json({
      id: result.insertedId.toString(),
      ...newSettings
    });
  } catch (error) {
    console.error('Create break settings error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /attendance/break-settings/:teamId - Update break settings for a team
app.put('/attendance/break-settings/:teamId', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { enforce_limits, max_breaks_per_day, max_break_duration_minutes, lunch_break_duration, short_break_duration } = req.body;
    const db = getDatabase();

    if (!ObjectId.isValid(teamId)) {
      return res.status(400).json({ detail: 'Invalid team ID' });
    }

    const settings = await db.collection('break_settings').findOne({ team_id: teamId });

    if (!settings) {
      return res.status(404).json({ detail: 'Break settings not found for this team' });
    }

    const updates = {
      updated_at: getNow()
    };

    if (enforce_limits !== undefined) updates.enforce_limits = enforce_limits;
    if (max_breaks_per_day !== undefined) updates.max_breaks_per_day = max_breaks_per_day;
    if (max_break_duration_minutes !== undefined) updates.max_break_duration_minutes = max_break_duration_minutes;
    if (lunch_break_duration !== undefined) updates.lunch_break_duration = lunch_break_duration;
    if (short_break_duration !== undefined) updates.short_break_duration = short_break_duration;

    await db.collection('break_settings').updateOne(
      { team_id: teamId },
      { $set: updates }
    );

    const updated = await db.collection('break_settings').findOne({ team_id: teamId });

    res.json({
      id: updated._id.toString(),
      team_id: updated.team_id,
      enforce_limits: updated.enforce_limits,
      max_breaks_per_day: updated.max_breaks_per_day,
      max_break_duration_minutes: updated.max_break_duration_minutes,
      lunch_break_duration: updated.lunch_break_duration,
      short_break_duration: updated.short_break_duration,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error) {
    console.error('Update break settings error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// ===== FORMS, WORKSHEETS, NOTIFICATIONS, REPORTS - Continued in next section =====
// Note: Due to length, implementing core endpoints. Additional endpoints follow same pattern.

// GET /forms - Get forms
app.get('/forms', authenticate, async (req, res) => {
  try {
    const { is_active, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = {};

    if (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) {
      // Admin and Delivery Manager see all
    } else if (userRole === UserRole.MANAGER) {
      const myTeams = await db.collection('teams').find({ manager_id: userId }).toArray();
      const teamIds = myTeams.map(t => t._id.toString());
      query.$or = [
        { created_by: userId },
        { assigned_teams: { $in: teamIds } }
      ];
    } else if (userRole === UserRole.TEAM_LEAD) {
      const myTeam = await db.collection('teams').findOne({ team_lead_id: userId });
      if (myTeam) {
        query.assigned_teams = myTeam._id.toString();
      } else {
        query._id = null;
      }
    } else {
      const teams = await db.collection('teams').find({ members: userId }).toArray();
      if (teams.length > 0) {
        const teamIds = teams.map(t => t._id.toString());
        query.assigned_teams = { $in: teamIds };
      } else {
        query._id = null;
      }
    }

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    const forms = await db.collection('forms')
      .find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(forms.map(f => ({
      id: f._id.toString(),
      name: f.name,
      description: f.description,
      fields: f.fields || [],
      created_by: f.created_by,
      assigned_teams: f.assigned_teams || [],
      is_active: f.is_active,
      version: f.version || 1,
      created_at: f.created_at,
      updated_at: f.updated_at
    })));
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /forms/:id - Get single form
app.get('/forms/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid form ID' });
    }

    const form = await db.collection('forms').findOne({ _id: new ObjectId(id) });

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    res.json({
      id: form._id.toString(),
      name: form.name,
      description: form.description,
      fields: form.fields || [],
      created_by: form.created_by,
      assigned_teams: form.assigned_teams || [],
      is_active: form.is_active,
      version: form.version || 1,
      created_at: form.created_at,
      updated_at: form.updated_at
    });
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /forms/:id - Update form
app.put('/forms/:id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, fields, is_active } = req.body;
    const db = getDatabase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid form ID' });
    }

    const form = await db.collection('forms').findOne({ _id: new ObjectId(id) });

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    const updates = { updated_at: getNow() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (fields) updates.fields = fields;
    if (is_active !== undefined) updates.is_active = is_active;

    await db.collection('forms').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updated = await db.collection('forms').findOne({ _id: new ObjectId(id) });

    res.json({
      id: updated._id.toString(),
      name: updated.name,
      description: updated.description,
      fields: updated.fields || [],
      created_by: updated.created_by,
      assigned_teams: updated.assigned_teams || [],
      is_active: updated.is_active,
      version: updated.version || 1,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error) {
    console.error('Update form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /forms/:id - Delete form
app.delete('/forms/:id', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid form ID' });
    }

    const form = await db.collection('forms').findOne({ _id: new ObjectId(id) });

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    await db.collection('forms').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Form deleted successfully' });
  } catch (error) {
    console.error('Delete form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /forms/team/:teamId - Get forms assigned to a team
app.get('/forms/team/:teamId', authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(teamId)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    // Verify team exists
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    // Find all forms assigned to this team
    const forms = await db.collection('forms').find({
      assigned_teams: teamId,
      is_active: true
    }).sort({ created_at: -1 }).toArray();

    res.json(forms.map(form => ({
      id: form._id.toString(),
      name: form.name,
      description: form.description,
      fields: form.fields,
      created_by: form.created_by,
      assigned_teams: form.assigned_teams || [],
      is_active: form.is_active,
      version: form.version,
      created_at: form.created_at,
      updated_at: form.updated_at
    })));
  } catch (error) {
    console.error('Get team forms error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /forms/:formId/assign - Assign form to teams
app.post('/forms/:formId/assign', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { formId } = req.params;
    const { team_ids } = req.body;
    const db = getDatabase();

    if (!ObjectId.isValid(formId)) {
      return res.status(400).json({ detail: 'Invalid form ID format' });
    }

    if (!team_ids || !Array.isArray(team_ids) || team_ids.length === 0) {
      return res.status(400).json({ detail: 'team_ids array is required' });
    }

    // Verify form exists
    const form = await db.collection('forms').findOne({ _id: new ObjectId(formId) });
    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    // Verify all teams exist
    for (const teamId of team_ids) {
      if (!ObjectId.isValid(teamId)) {
        return res.status(400).json({ detail: `Invalid team ID format: ${teamId}` });
      }
      const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
      if (!team) {
        return res.status(404).json({ detail: `Team not found: ${teamId}` });
      }
    }

    // Get current assigned teams and add new ones (avoid duplicates)
    const currentTeams = form.assigned_teams || [];
    const updatedTeams = [...new Set([...currentTeams, ...team_ids])];

    await db.collection('forms').updateOne(
      { _id: new ObjectId(formId) },
      {
        $set: {
          assigned_teams: updatedTeams,
          updated_at: getNow()
        }
      }
    );

    const updated = await db.collection('forms').findOne({ _id: new ObjectId(formId) });
    res.json({
      id: updated._id.toString(),
      name: updated.name,
      description: updated.description,
      fields: updated.fields,
      created_by: updated.created_by,
      assigned_teams: updated.assigned_teams,
      is_active: updated.is_active,
      version: updated.version,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error) {
    console.error('Assign form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /forms/:formId/unassign/:teamId - Unassign form from team
app.delete('/forms/:formId/unassign/:teamId', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { formId, teamId } = req.params;
    const db = getDatabase();

    if (!ObjectId.isValid(formId)) {
      return res.status(400).json({ detail: 'Invalid form ID format' });
    }

    if (!ObjectId.isValid(teamId)) {
      return res.status(400).json({ detail: 'Invalid team ID format' });
    }

    // Verify form exists
    const form = await db.collection('forms').findOne({ _id: new ObjectId(formId) });
    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    // Remove team from assigned_teams
    const currentTeams = form.assigned_teams || [];
    const updatedTeams = currentTeams.filter(tid => tid !== teamId);

    await db.collection('forms').updateOne(
      { _id: new ObjectId(formId) },
      {
        $set: {
          assigned_teams: updatedTeams,
          updated_at: getNow()
        }
      }
    );

    const updated = await db.collection('forms').findOne({ _id: new ObjectId(formId) });
    res.json({
      id: updated._id.toString(),
      name: updated.name,
      description: updated.description,
      fields: updated.fields,
      created_by: updated.created_by,
      assigned_teams: updated.assigned_teams,
      is_active: updated.is_active,
      version: updated.version,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error) {
    console.error('Unassign form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /forms - Create form
app.post('/forms', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { name, description, fields, is_active, assigned_teams } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!name || !fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ detail: 'Name and fields are required' });
    }

    const now = getNow();
    const formDoc = {
      name,
      description: description || '',
      fields,
      created_by: userId,
      assigned_teams: assigned_teams || [],
      is_active: is_active !== undefined ? is_active : true,
      version: 1,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection('forms').insertOne(formDoc);

    res.status(201).json({
      id: result.insertedId.toString(),
      name: formDoc.name,
      description: formDoc.description,
      fields: formDoc.fields,
      created_by: formDoc.created_by,
      assigned_teams: formDoc.assigned_teams,
      is_active: formDoc.is_active,
      version: formDoc.version,
      created_at: formDoc.created_at,
      updated_at: formDoc.updated_at
    });
  } catch (error) {
    console.error('Create form error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets - Create worksheet
app.post('/worksheets', authenticate, async (req, res) => {
  try {
    const { date, form_id, form_responses, tasks_completed, total_hours, notes } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();

    // Check if worksheet exists - if it does, update it instead of creating new one
    const existing = await db.collection('worksheets').findOne({
      employee_id: userId,
      date
    });

    if (existing) {
      // Update existing worksheet instead of returning error
      const now = getNow();
      const updateData = {
        form_id: form_id || existing.form_id,
        form_responses: form_responses || existing.form_responses,
        tasks_completed: tasks_completed || existing.tasks_completed,
        notes: notes || existing.notes,
        updated_at: now
      };

      // Get total_hours from time_session if not provided
      if (total_hours) {
        updateData.total_hours = total_hours;
      } else if (!existing.total_hours) {
        const timeSession = await db.collection('time_sessions').findOne({
          employee_id: userId,
          date
        });
        updateData.total_hours = timeSession?.total_work_hours || 0;
      }

      await db.collection('worksheets').updateOne(
        { _id: existing._id },
        { $set: updateData }
      );

      const updated = await db.collection('worksheets').findOne({ _id: existing._id });

      return res.json({
        id: updated._id.toString(),
        employee_id: updated.employee_id,
        date: updated.date,
        form_id: updated.form_id,
        form_responses: updated.form_responses,
        tasks_completed: updated.tasks_completed,
        total_hours: updated.total_hours,
        notes: updated.notes,
        status: updated.status,
        submitted_at: updated.submitted_at,
        tl_verified_by: updated.tl_verified_by,
        tl_verified_at: updated.tl_verified_at,
        manager_approved_by: updated.manager_approved_by,
        manager_approved_at: updated.manager_approved_at,
        rejection_reason: updated.rejection_reason,
        rejected_by: updated.rejected_by,
        rejected_at: updated.rejected_at,
        created_at: updated.created_at,
        updated_at: updated.updated_at
      });
    }

    // Verify form exists
    if (form_id) {
      const form = await db.collection('forms').findOne({ _id: new ObjectId(form_id) });
      if (!form) {
        return res.status(404).json({ detail: 'Form not found' });
      }
    }

    // Get total_hours from time_session if not provided
    let finalTotalHours = total_hours || 0;
    if (!finalTotalHours) {
      const timeSession = await db.collection('time_sessions').findOne({
        employee_id: userId,
        date
      });
      finalTotalHours = timeSession?.total_work_hours || 0;
    }

    const now = getNow();
    const worksheetDoc = {
      employee_id: userId,
      date,
      form_id: form_id || null,
      form_responses: form_responses || [],
      tasks_completed: tasks_completed || [],
      total_hours: finalTotalHours,
      notes: notes || null,
      status: WorksheetStatus.DRAFT,
      submitted_at: null,
      tl_verified_by: null,
      tl_verified_at: null,
      manager_approved_by: null,
      manager_approved_at: null,
      rejection_reason: null,
      rejected_by: null,
      rejected_at: null,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection('worksheets').insertOne(worksheetDoc);
    worksheetDoc._id = result.insertedId;

    res.json({
      id: worksheetDoc._id.toString(),
      employee_id: worksheetDoc.employee_id,
      date: worksheetDoc.date,
      form_id: worksheetDoc.form_id,
      form_responses: worksheetDoc.form_responses,
      tasks_completed: worksheetDoc.tasks_completed,
      total_hours: worksheetDoc.total_hours,
      notes: worksheetDoc.notes,
      status: worksheetDoc.status,
      submitted_at: worksheetDoc.submitted_at,
      tl_verified_by: worksheetDoc.tl_verified_by,
      tl_verified_at: worksheetDoc.tl_verified_at,
      manager_approved_by: worksheetDoc.manager_approved_by,
      manager_approved_at: worksheetDoc.manager_approved_at,
      rejection_reason: worksheetDoc.rejection_reason,
      rejected_by: worksheetDoc.rejected_by,
      rejected_at: worksheetDoc.rejected_at,
      created_at: worksheetDoc.created_at,
      updated_at: worksheetDoc.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('Create worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/:worksheet_id/submit
app.post('/worksheets/:worksheet_id/submit', authenticate, async (req, res) => {
  try {
    const { worksheet_id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(worksheet_id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID format' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.employee_id !== userId) {
      return res.status(403).json({ detail: 'Can only submit your own worksheet' });
    }

    if (![WorksheetStatus.DRAFT, WorksheetStatus.REJECTED].includes(worksheet.status)) {
      return res.status(400).json({ detail: 'Worksheet already submitted' });
    }

    const now = getNow();
    const employee = req.user;
    const employeeRole = employee.role;

    // All worksheets require manual verification - no auto-verify
    // Workflow for all roles: SUBMITTED -> TL/Manager verifies -> Manager approves -> DM approves
    let newStatus = WorksheetStatus.SUBMITTED;
    let updateFields = {
      status: newStatus,
      submitted_at: now,
      updated_at: now,
      rejection_reason: null,
      rejected_by: null,
      rejected_at: null
    };

    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(worksheet_id) },
      { $set: updateFields }
    );

    // Mark worksheet as submitted in time session
    await db.collection('time_sessions').updateOne(
      { employee_id: userId, date: worksheet.date },
      { $set: { worksheet_submitted: true } }
    );

    // Notify appropriate verifier - all worksheets need manual verification
    // Workflow for all: SUBMITTED -> TL/Manager verifies -> Manager approves -> DM approves
    if (employeeRole === UserRole.ASSOCIATE) {
      // Associates: notify Team Lead for verification
      if (employee.team_lead_id) {
        await createNotification(
          employee.team_lead_id,
          'WORKSHEET_SUBMITTED',
          'New Worksheet Submitted',
          `${employee.full_name} has submitted their worksheet for ${worksheet.date}`,
          worksheet_id
        );
      }
    } else if (employeeRole === UserRole.TEAM_LEAD) {
      // Team Leads: notify Manager for verification (no self-verify)
      if (employee.manager_id) {
        await createNotification(
          employee.manager_id,
          'WORKSHEET_SUBMITTED',
          'Team Lead Worksheet for Verification',
          `${employee.full_name} (Team Lead) has submitted their worksheet for ${worksheet.date} - needs verification`,
          worksheet_id
        );
      }
    } else if (employeeRole === UserRole.MANAGER) {
      // Managers: notify Delivery Manager for verification (no self-verify)
      const deliveryManagers = await db.collection('users').find({
        role: UserRole.DELIVERY_MANAGER,
        is_active: true
      }).toArray();

      for (const dm of deliveryManagers) {
        await createNotification(
          dm._id.toString(),
          'WORKSHEET_SUBMITTED',
          'Manager Worksheet for Verification',
          `${employee.full_name} (Manager) has submitted their worksheet for ${worksheet.date} - needs verification`,
          worksheet_id
        );
      }
    }

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('Submit worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/:worksheet_id/verify - Team Lead verification
app.post('/worksheets/:worksheet_id/verify', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { worksheet_id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    if (!ObjectId.isValid(worksheet_id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID format' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== WorksheetStatus.SUBMITTED) {
      return res.status(400).json({ detail: 'Worksheet must be in SUBMITTED status to verify' });
    }

    // Verify employee is in user's team/management
    if (userRole === UserRole.TEAM_LEAD) {
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      let hasAccess = employee && employee.team_lead_id === userId;

      // Also check if employee is in a team led by this TL
      if (!hasAccess) {
        const ledTeams = await db.collection('teams').find({
          team_lead_id: userId,
          is_active: true
        }).toArray();

        for (const team of ledTeams) {
          if (team.members && team.members.includes(worksheet.employee_id)) {
            hasAccess = true;
            break;
          }
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ detail: 'Can only verify worksheets from your team members' });
      }
    } else if (userRole === UserRole.MANAGER) {
      // Managers can verify worksheets from their team leads and team members
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      if (!employee) {
        return res.status(404).json({ detail: 'Employee not found' });
      }

      let hasAccess = employee.manager_id === userId;

      if (!hasAccess) {
        const managedTeams = await db.collection('teams').find({
          manager_id: userId,
          is_active: true
        }).toArray();

        for (const team of managedTeams) {
          if (team.members && team.members.includes(worksheet.employee_id)) {
            hasAccess = true;
            break;
          }
          if (team.team_lead_id === worksheet.employee_id) {
            hasAccess = true;
            break;
          }
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ detail: 'Can only verify worksheets from employees under your management' });
      }
    }

    const now = getNow();
    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(worksheet_id) },
      {
        $set: {
          status: WorksheetStatus.TL_VERIFIED,
          tl_verified_by: userId,
          tl_verified_at: now,
          updated_at: now
        }
      }
    );

    // Notify Employee
    await createNotification(
      worksheet.employee_id,
      'WORKSHEET_VERIFIED',
      'Worksheet Verified',
      `Your worksheet for ${worksheet.date} has been verified by Team Lead`,
      worksheet_id
    );

    // Notify Manager
    const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
    if (employee && employee.manager_id) {
      await createNotification(
        employee.manager_id,
        'WORKSHEET_VERIFIED',
        'Worksheet Pending Approval',
        `${employee.full_name}'s worksheet for ${worksheet.date} is verified and pending your approval`,
        worksheet_id
      );
    }

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('Verify worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/:worksheet_id/approve - Manager approval
app.post('/worksheets/:worksheet_id/approve', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { worksheet_id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(worksheet_id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID format' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== WorksheetStatus.TL_VERIFIED) {
      return res.status(400).json({ detail: 'Worksheet must be TL_VERIFIED to approve' });
    }

    // Verify employee is under this manager (either directly or through team)
    if (req.user.role === UserRole.MANAGER) {
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      if (!employee) {
        return res.status(404).json({ detail: 'Employee not found' });
      }

      // Check direct manager relationship
      let hasAccess = employee.manager_id === userId;

      // If not direct, check if employee is in a team managed by this manager
      if (!hasAccess) {
        const managedTeams = await db.collection('teams').find({
          manager_id: userId,
          is_active: true
        }).toArray();

        for (const team of managedTeams) {
          // Check if employee is a team member or team lead of this team
          if (team.members && team.members.includes(worksheet.employee_id)) {
            hasAccess = true;
            break;
          }
          if (team.team_lead_id === worksheet.employee_id) {
            hasAccess = true;
            break;
          }
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ detail: 'Can only approve worksheets from employees under your management' });
      }
    }

    const now = getNow();
    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(worksheet_id) },
      {
        $set: {
          status: WorksheetStatus.MANAGER_APPROVED,
          manager_approved_by: userId,
          manager_approved_at: now,
          updated_at: now
        }
      }
    );

    // Notify Employee that Manager approved
    await createNotification(
      worksheet.employee_id,
      'WORKSHEET_VERIFIED',
      'Worksheet Approved by Manager',
      `Your worksheet for ${worksheet.date} has been approved by Manager - pending Delivery Manager approval`,
      worksheet_id
    );

    // Notify Delivery Managers for final approval
    const deliveryManagers = await db.collection('users').find({
      role: UserRole.DELIVERY_MANAGER,
      is_active: true
    }).toArray();

    const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
    for (const dm of deliveryManagers) {
      await createNotification(
        dm._id.toString(),
        'WORKSHEET_PENDING_DM',
        'Worksheet Pending Final Approval',
        `${employee?.full_name || 'Employee'}'s worksheet for ${worksheet.date} is approved by Manager - pending your final approval`,
        worksheet_id
      );
    }

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      dm_approved_by: updated.dm_approved_by,
      dm_approved_at: updated.dm_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('Approve worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/:id/reject - Reject a worksheet (Team Lead/Manager)
app.post('/worksheets/:id/reject', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.TEAM_LEAD, UserRole.MANAGER]), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID format' });
    }

    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({ detail: 'Rejection reason is required' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(id) });
    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    // Check permissions based on role and worksheet status
    if (userRole === UserRole.TEAM_LEAD) {
      if (worksheet.status !== WorksheetStatus.SUBMITTED) {
        return res.status(400).json({ detail: 'Worksheet must be in SUBMITTED status for Team Lead rejection' });
      }
      // Verify employee is in this team lead's team
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      if (!employee || employee.team_lead_id !== userId) {
        return res.status(403).json({ detail: 'Can only reject worksheets from employees in your team' });
      }
    } else if (userRole === UserRole.MANAGER) {
      if (worksheet.status !== WorksheetStatus.SUBMITTED && worksheet.status !== WorksheetStatus.TL_VERIFIED) {
        return res.status(400).json({ detail: 'Worksheet must be SUBMITTED or TL_VERIFIED for Manager rejection' });
      }
      // Verify employee is under this manager
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      if (!employee || employee.manager_id !== userId) {
        return res.status(403).json({ detail: 'Can only reject worksheets from employees under your management' });
      }
    } else if (userRole === UserRole.DELIVERY_MANAGER) {
      // DM can reject worksheets in MANAGER_APPROVED status
      if (worksheet.status !== WorksheetStatus.MANAGER_APPROVED) {
        return res.status(400).json({ detail: 'Worksheet must be in MANAGER_APPROVED status for Delivery Manager rejection' });
      }
    }

    const now = getNow();
    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: WorksheetStatus.REJECTED,
          rejection_reason: rejection_reason.trim(),
          rejected_by: userId,
          rejected_at: now,
          updated_at: now
        }
      }
    );

    // Notify Employee
    await createNotification(
      worksheet.employee_id,
      'WORKSHEET_REJECTED',
      'Worksheet Rejected',
      `Your worksheet for ${worksheet.date} has been rejected. Reason: ${rejection_reason.trim()}`,
      id
    );

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(id) });
    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('Reject worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/bulk-approve - Bulk approve multiple worksheets (Manager)
app.post('/worksheets/bulk-approve', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { worksheet_ids } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!worksheet_ids || !Array.isArray(worksheet_ids) || worksheet_ids.length === 0) {
      return res.status(400).json({ detail: 'worksheet_ids array is required' });
    }

    // Validate all IDs
    for (const id of worksheet_ids) {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ detail: `Invalid worksheet ID format: ${id}` });
      }
    }

    const objectIds = worksheet_ids.map(id => new ObjectId(id));
    const worksheets = await db.collection('worksheets').find({
      _id: { $in: objectIds },
      status: WorksheetStatus.TL_VERIFIED
    }).toArray();

    if (worksheets.length === 0) {
      return res.status(400).json({ detail: 'No worksheets found with TL_VERIFIED status' });
    }

    // Verify all employees are under this manager
    if (req.user.role === UserRole.MANAGER) {
      const employeeIds = worksheets.map(w => new ObjectId(w.employee_id));
      const employees = await db.collection('users').find({
        _id: { $in: employeeIds }
      }).toArray();

      const unauthorized = employees.some(emp => emp.manager_id !== userId);
      if (unauthorized) {
        return res.status(403).json({ detail: 'Can only approve worksheets from employees under your management' });
      }
    }

    const now = getNow();
    const result = await db.collection('worksheets').updateMany(
      {
        _id: { $in: objectIds },
        status: WorksheetStatus.TL_VERIFIED
      },
      {
        $set: {
          status: WorksheetStatus.MANAGER_APPROVED,
          manager_approved_by: userId,
          manager_approved_at: now,
          updated_at: now
        }
      }
    );

    // Notify all employees and DMs
    const deliveryManagers = await db.collection('users').find({
      role: UserRole.DELIVERY_MANAGER,
      is_active: true
    }).toArray();

    for (const worksheet of worksheets) {
      // Notify employee
      await createNotification(
        worksheet.employee_id,
        'WORKSHEET_VERIFIED',
        'Worksheet Approved by Manager',
        `Your worksheet for ${worksheet.date} has been approved by Manager - pending Delivery Manager approval`,
        worksheet._id.toString()
      );

      // Notify DMs
      const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
      for (const dm of deliveryManagers) {
        await createNotification(
          dm._id.toString(),
          'WORKSHEET_PENDING_DM',
          'Worksheet Pending Final Approval',
          `${employee?.full_name || 'Employee'}'s worksheet for ${worksheet.date} is approved by Manager - pending your final approval`,
          worksheet._id.toString()
        );
      }
    }

    res.json({
      message: `Successfully approved ${result.modifiedCount} worksheets`,
      approved_count: result.modifiedCount,
      requested_count: worksheet_ids.length
    });
  } catch (error) {
    console.error('Bulk approve worksheets error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/:worksheet_id/dm-approve - Delivery Manager final approval
app.post('/worksheets/:worksheet_id/dm-approve', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const { worksheet_id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(worksheet_id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID format' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== WorksheetStatus.MANAGER_APPROVED) {
      return res.status(400).json({ detail: 'Worksheet must be MANAGER_APPROVED for DM approval' });
    }

    const now = getNow();
    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(worksheet_id) },
      {
        $set: {
          status: WorksheetStatus.DM_APPROVED,
          dm_approved_by: userId,
          dm_approved_at: now,
          updated_at: now
        }
      }
    );

    // Notify Employee
    await createNotification(
      worksheet.employee_id,
      'WORKSHEET_FINAL_APPROVED',
      'Worksheet Fully Approved',
      `Your worksheet for ${worksheet.date} has been approved by Delivery Manager - fully approved!`,
      worksheet_id
    );

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(worksheet_id) });
    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      dm_approved_by: updated.dm_approved_by,
      dm_approved_at: updated.dm_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      employee_name: null,
      form_name: null
    });
  } catch (error) {
    console.error('DM approve worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /worksheets/bulk-dm-approve - Bulk DM approve multiple worksheets
app.post('/worksheets/bulk-dm-approve', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const { worksheet_ids } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!worksheet_ids || !Array.isArray(worksheet_ids) || worksheet_ids.length === 0) {
      return res.status(400).json({ detail: 'worksheet_ids array is required' });
    }

    // Validate all IDs
    for (const id of worksheet_ids) {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ detail: `Invalid worksheet ID format: ${id}` });
      }
    }

    const objectIds = worksheet_ids.map(id => new ObjectId(id));
    const worksheets = await db.collection('worksheets').find({
      _id: { $in: objectIds },
      status: WorksheetStatus.MANAGER_APPROVED
    }).toArray();

    if (worksheets.length === 0) {
      return res.status(400).json({ detail: 'No worksheets found with MANAGER_APPROVED status' });
    }

    const now = getNow();
    const result = await db.collection('worksheets').updateMany(
      {
        _id: { $in: objectIds },
        status: WorksheetStatus.MANAGER_APPROVED
      },
      {
        $set: {
          status: WorksheetStatus.DM_APPROVED,
          dm_approved_by: userId,
          dm_approved_at: now,
          updated_at: now
        }
      }
    );

    // Notify all employees
    for (const worksheet of worksheets) {
      await createNotification(
        worksheet.employee_id,
        'WORKSHEET_FINAL_APPROVED',
        'Worksheet Fully Approved',
        `Your worksheet for ${worksheet.date} has been approved by Delivery Manager - fully approved!`,
        worksheet._id.toString()
      );
    }

    res.json({
      message: `Successfully approved ${result.modifiedCount} worksheets`,
      approved_count: result.modifiedCount,
      requested_count: worksheet_ids.length
    });
  } catch (error) {
    console.error('Bulk DM approve worksheets error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/summary - Get worksheet summary statistics
app.get('/worksheets/summary', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    // Build employee filter - filter by assigned teams
    let employeeFilter = {};
    if (userRole === UserRole.ASSOCIATE) {
      employeeFilter = { employee_id: userId };
    } else if (userRole === UserRole.TEAM_LEAD) {
      // Get all teams where user is team_lead
      const assignedTeams = await db.collection('teams').find({ team_lead_id: userId, is_active: true }).toArray();
      const memberIds = new Set();
      memberIds.add(userId); // Include Team Lead's own worksheets
      assignedTeams.forEach(team => {
        if (team.members) {
          team.members.forEach(memberId => memberIds.add(memberId));
        }
      });
      const memberIdsArray = Array.from(memberIds);
      if (employee_id && memberIdsArray.includes(employee_id)) {
        employeeFilter = { employee_id };
      } else {
        employeeFilter = { employee_id: { $in: memberIdsArray } };
      }
    } else if (userRole === UserRole.MANAGER) {
      // Get all teams where user is manager
      const assignedTeams = await db.collection('teams').find({ manager_id: userId, is_active: true }).toArray();
      const employeeIds = new Set();
      employeeIds.add(userId); // Include Manager's own worksheets
      assignedTeams.forEach(team => {
        if (team.team_lead_id) {
          employeeIds.add(team.team_lead_id);
        }
        if (team.members) {
          team.members.forEach(memberId => employeeIds.add(memberId));
        }
      });
      const employeeIdsArray = Array.from(employeeIds);
      if (employee_id && employeeIdsArray.includes(employee_id)) {
        employeeFilter = { employee_id };
      } else {
        employeeFilter = { employee_id: { $in: employeeIdsArray } };
      }
    } else if (employee_id) {
      employeeFilter = { employee_id };
    }

    // Build date filter
    const dateFilter = {};
    if (start_date) {
      dateFilter.$gte = start_date;
    }
    if (end_date) {
      dateFilter.$lte = end_date;
    }

    const query = { ...employeeFilter };
    if (Object.keys(dateFilter).length > 0) {
      query.date = dateFilter;
    }

    // Get counts by status
    const statusCounts = await db.collection('worksheets').aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    // Calculate total hours
    const hoursResult = await db.collection('worksheets').aggregate([
      { $match: query },
      { $group: { _id: null, total_hours: { $sum: '$total_hours' } } }
    ]).toArray();

    const summary = {
      total: 0,
      draft: 0,
      submitted: 0,
      tl_verified: 0,
      manager_approved: 0,
      rejected: 0,
      total_hours: hoursResult.length > 0 ? hoursResult[0].total_hours : 0
    };

    statusCounts.forEach(item => {
      summary.total += item.count;
      if (item._id === WorksheetStatus.DRAFT) summary.draft = item.count;
      else if (item._id === WorksheetStatus.SUBMITTED) summary.submitted = item.count;
      else if (item._id === WorksheetStatus.TL_VERIFIED) summary.tl_verified = item.count;
      else if (item._id === WorksheetStatus.MANAGER_APPROVED) summary.manager_approved = item.count;
      else if (item._id === WorksheetStatus.REJECTED) summary.rejected = item.count;
    });

    res.json(summary);
  } catch (error) {
    console.error('Get worksheet summary error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets - Get worksheets
app.get('/worksheets', authenticate, async (req, res) => {
  try {
    const { status, employee_id, start_date, end_date, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const query = {};

    // Role-based filtering - filter by assigned teams
    if (userRole === UserRole.ASSOCIATE) {
      query.employee_id = userId;
    } else if (userRole === UserRole.TEAM_LEAD) {
      // Get all teams where user is team_lead
      const assignedTeams = await db.collection('teams').find({ team_lead_id: userId, is_active: true }).toArray();
      // Collect all member IDs from assigned teams
      const memberIds = new Set();
      memberIds.add(userId); // Include Team Lead's own worksheets
      assignedTeams.forEach(team => {
        if (team.members) {
          team.members.forEach(memberId => memberIds.add(memberId));
        }
      });
      const memberIdsArray = Array.from(memberIds);
      if (employee_id && memberIdsArray.includes(employee_id)) {
        query.employee_id = employee_id;
      } else {
        query.employee_id = { $in: memberIdsArray };
      }
      if (!status) {
        query.status = { $ne: WorksheetStatus.REJECTED };
      }
    } else if (userRole === UserRole.MANAGER) {
      // Get all teams where user is manager
      const assignedTeams = await db.collection('teams').find({ manager_id: userId, is_active: true }).toArray();
      // Collect all member IDs and team lead IDs from assigned teams
      const employeeIds = new Set();
      employeeIds.add(userId); // Include Manager's own worksheets
      assignedTeams.forEach(team => {
        if (team.team_lead_id) {
          employeeIds.add(team.team_lead_id);
        }
        if (team.members) {
          team.members.forEach(memberId => employeeIds.add(memberId));
        }
      });
      const employeeIdsArray = Array.from(employeeIds);
      if (employee_id && employeeIdsArray.includes(employee_id)) {
        query.employee_id = employee_id;
      } else {
        query.employee_id = { $in: employeeIdsArray };
      }
      if (!status) {
        query.status = { $in: [WorksheetStatus.TL_VERIFIED, WorksheetStatus.MANAGER_APPROVED] };
      }
    } else if (employee_id) {
      query.employee_id = employee_id;
    }

    if (status) query.status = status;
    if (start_date) {
      query.date = { $gte: start_date };
    }
    if (end_date) {
      if (query.date) {
        query.date.$lte = end_date;
      } else {
        query.date = { $lte: end_date };
      }
    }

    const worksheets = await db.collection('worksheets')
      .find(query)
      .sort({ date: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // Fetch employee names - filter out invalid ObjectIds
    const employeeIds = [...new Set(worksheets.map(w => w.employee_id).filter(Boolean))];
    const validEmployeeIds = employeeIds.filter(id => ObjectId.isValid(id));
    const employeeMap = {};
    if (validEmployeeIds.length > 0) {
      const employees = await db.collection('users').find({
        _id: { $in: validEmployeeIds.map(id => new ObjectId(id)) }
      }).toArray();
      employees.forEach(e => {
        employeeMap[e._id.toString()] = e.full_name;
      });
    }

    // Fetch form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const formMap = {};
    if (validFormIds.length > 0) {
      const forms = await db.collection('forms').find({
        _id: { $in: validFormIds.map(id => new ObjectId(id)) }
      }).toArray();
      forms.forEach(f => {
        formMap[f._id.toString()] = f.name;
      });
    }

    // Fetch verifier names (tl_verified_by, manager_approved_by, rejected_by)
    const verifierIds = [
      ...worksheets.map(w => w.tl_verified_by),
      ...worksheets.map(w => w.manager_approved_by),
      ...worksheets.map(w => w.rejected_by)
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const validVerifierIds = verifierIds.filter(id => ObjectId.isValid(id));

    const verifiers = validVerifierIds.length > 0 ? await db.collection('users').find({
      _id: { $in: validVerifierIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const verifierMap = {};
    verifiers.forEach(v => {
      verifierMap[v._id.toString()] = v.full_name;
    });

    res.json(worksheets.map(w => ({
      id: w._id.toString(),
      employee_id: w.employee_id,
      date: w.date,
      form_id: w.form_id,
      form_responses: w.form_responses || [],
      tasks_completed: w.tasks_completed || [],
      total_hours: w.total_hours || 0,
      notes: w.notes,
      status: w.status,
      submitted_at: w.submitted_at,
      tl_verified_by: verifierMap[w.tl_verified_by] || w.tl_verified_by || null,
      tl_verified_at: w.tl_verified_at,
      manager_approved_by: verifierMap[w.manager_approved_by] || w.manager_approved_by || null,
      manager_approved_at: w.manager_approved_at,
      rejection_reason: w.rejection_reason,
      rejected_by: verifierMap[w.rejected_by] || w.rejected_by || null,
      rejected_at: w.rejected_at,
      created_at: w.created_at,
      updated_at: w.updated_at,
      employee_name: employeeMap[w.employee_id] || null,
      form_name: w.form_id ? formMap[w.form_id.toString ? w.form_id.toString() : String(w.form_id)] || null : null
    })));
  } catch (error) {
    console.error('Get worksheets error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/my-worksheets - Get current user's worksheets
app.get('/worksheets/my-worksheets', authenticate, async (req, res) => {
  try {
    const { status, start_date, end_date, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const query = { employee_id: userId };

    if (status) query.status = status;
    if (start_date) {
      query.date = { $gte: start_date };
    }
    if (end_date) {
      if (query.date) {
        query.date.$lte = end_date;
      } else {
        query.date = { $lte: end_date };
      }
    }

    const worksheets = await db.collection('worksheets')
      .find(query)
      .sort({ date: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // Fetch form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const forms = validFormIds.length > 0
      ? await db.collection('forms').find({
          _id: { $in: validFormIds.map(id => new ObjectId(id)) }
        }).toArray()
      : [];
    const formMap = {};
    forms.forEach(f => {
      formMap[f._id.toString()] = f.name;
    });

    // Get current user's name
    const employeeName = req.user.full_name;

    res.json(worksheets.map(w => ({
      id: w._id.toString(),
      employee_id: w.employee_id,
      date: w.date,
      form_id: w.form_id,
      form_responses: w.form_responses || [],
      tasks_completed: w.tasks_completed || [],
      total_hours: w.total_hours || 0,
      notes: w.notes,
      status: w.status,
      submitted_at: w.submitted_at,
      tl_verified_by: w.tl_verified_by,
      tl_verified_at: w.tl_verified_at,
      manager_approved_by: w.manager_approved_by,
      manager_approved_at: w.manager_approved_at,
      rejection_reason: w.rejection_reason,
      rejected_by: w.rejected_by,
      rejected_at: w.rejected_at,
      created_at: w.created_at,
      updated_at: w.updated_at,
      employee_name: employeeName,
      form_name: w.form_id ? formMap[w.form_id.toString ? w.form_id.toString() : String(w.form_id)] || null : null
    })));
  } catch (error) {
    console.error('Get my worksheets error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/pending-verification - Get worksheets pending Team Lead verification
app.get('/worksheets/pending-verification', authenticate, requireRoles([UserRole.TEAM_LEAD, UserRole.MANAGER, UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    let query = { status: WorksheetStatus.SUBMITTED };

    // Team Leads see worksheets from members of their assigned teams
    if (userRole === UserRole.TEAM_LEAD) {
      const assignedTeams = await db.collection('teams').find({ team_lead_id: userId, is_active: true }).toArray();
      const memberIds = new Set();
      assignedTeams.forEach(team => {
        if (team.members) {
          team.members.forEach(memberId => memberIds.add(memberId));
        }
      });
      query.employee_id = { $in: Array.from(memberIds) };
    } else if (userRole === UserRole.MANAGER) {
      // Managers see worksheets from members and team leads of their assigned teams
      const assignedTeams = await db.collection('teams').find({ manager_id: userId, is_active: true }).toArray();
      const employeeIds = new Set();
      assignedTeams.forEach(team => {
        if (team.team_lead_id) {
          employeeIds.add(team.team_lead_id);
        }
        if (team.members) {
          team.members.forEach(memberId => employeeIds.add(memberId));
        }
      });
      query.employee_id = { $in: Array.from(employeeIds) };
    }
    // Admins see all pending verification

    const worksheets = await db.collection('worksheets')
      .find(query)
      .sort({ submitted_at: -1 })
      .limit(100)
      .toArray();

    // Fetch employee names - filter out invalid ObjectIds
    const employeeIds = [...new Set(worksheets.map(w => w.employee_id).filter(Boolean))];
    const validEmployeeIds = employeeIds.filter(id => ObjectId.isValid(id));
    const employeeMap = {};
    if (validEmployeeIds.length > 0) {
      const employees = await db.collection('users').find({
        _id: { $in: validEmployeeIds.map(id => new ObjectId(id)) }
      }).toArray();
      employees.forEach(e => {
        employeeMap[e._id.toString()] = e.full_name;
      });
    }

    // Fetch form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const formMap = {};
    if (validFormIds.length > 0) {
      const forms = await db.collection('forms').find({
        _id: { $in: validFormIds.map(id => new ObjectId(id)) }
      }).toArray();
      forms.forEach(f => {
        formMap[f._id.toString()] = f.name;
      });
    }

    // Fetch verifier names (tl_verified_by, manager_approved_by, rejected_by)
    const verifierIds = [
      ...worksheets.map(w => w.tl_verified_by),
      ...worksheets.map(w => w.manager_approved_by),
      ...worksheets.map(w => w.rejected_by)
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const validVerifierIds = verifierIds.filter(id => ObjectId.isValid(id));

    const verifiers = validVerifierIds.length > 0 ? await db.collection('users').find({
      _id: { $in: validVerifierIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const verifierMap = {};
    verifiers.forEach(v => {
      verifierMap[v._id.toString()] = v.full_name;
    });

    res.json(worksheets.map(w => ({
      id: w._id.toString(),
      employee_id: w.employee_id,
      date: w.date,
      form_id: w.form_id,
      form_responses: w.form_responses || [],
      tasks_completed: w.tasks_completed || [],
      total_hours: w.total_hours || 0,
      notes: w.notes,
      status: w.status,
      submitted_at: w.submitted_at,
      tl_verified_by: verifierMap[w.tl_verified_by] || w.tl_verified_by || null,
      tl_verified_at: w.tl_verified_at,
      manager_approved_by: verifierMap[w.manager_approved_by] || w.manager_approved_by || null,
      manager_approved_at: w.manager_approved_at,
      rejection_reason: w.rejection_reason,
      rejected_by: verifierMap[w.rejected_by] || w.rejected_by || null,
      rejected_at: w.rejected_at,
      created_at: w.created_at,
      updated_at: w.updated_at,
      employee_name: employeeMap[w.employee_id] || null,
      form_name: w.form_id ? formMap[w.form_id.toString ? w.form_id.toString() : String(w.form_id)] || null : null
    })));
  } catch (error) {
    console.error('Get pending verification error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/pending-approval - Get worksheets pending Manager approval
app.get('/worksheets/pending-approval', authenticate, requireRoles([UserRole.MANAGER, UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    let query = { status: WorksheetStatus.TL_VERIFIED };

    if (userRole === UserRole.MANAGER) {
      // Managers see worksheets from members and team leads of their assigned teams
      const assignedTeams = await db.collection('teams').find({ manager_id: userId, is_active: true }).toArray();
      const employeeIds = new Set();
      assignedTeams.forEach(team => {
        if (team.team_lead_id) {
          employeeIds.add(team.team_lead_id);
        }
        if (team.members) {
          team.members.forEach(memberId => employeeIds.add(memberId));
        }
      });
      query.employee_id = { $in: Array.from(employeeIds) };
    } else if (userRole === UserRole.DELIVERY_MANAGER) {
      // Delivery Managers see worksheets from all managers plus regular pending approval
      const managers = await db.collection('users').find({
        role: UserRole.MANAGER,
        is_active: true
      }).toArray();
      const managerIds = managers.map(m => m._id.toString());

      // Also get all employees without manager (or directly under DM)
      const allEmployees = await db.collection('users').find({
        role: { $in: [UserRole.ASSOCIATE, UserRole.TEAM_LEAD] },
        is_active: true
      }).toArray();
      const allEmployeeIds = allEmployees.map(e => e._id.toString());

      query.employee_id = { $in: [...managerIds, ...allEmployeeIds] };
    }
    // Admins see all pending approval

    const worksheets = await db.collection('worksheets')
      .find(query)
      .sort({ tl_verified_at: -1 })
      .limit(100)
      .toArray();

    // Fetch employee names - filter out invalid ObjectIds
    const employeeIds = [...new Set(worksheets.map(w => w.employee_id).filter(Boolean))];
    const validEmployeeIds = employeeIds.filter(id => ObjectId.isValid(id));
    const employeeMap = {};
    if (validEmployeeIds.length > 0) {
      const employees = await db.collection('users').find({
        _id: { $in: validEmployeeIds.map(id => new ObjectId(id)) }
      }).toArray();
      employees.forEach(e => {
        employeeMap[e._id.toString()] = e.full_name;
      });
    }

    // Fetch form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const formMap = {};
    if (validFormIds.length > 0) {
      const forms = await db.collection('forms').find({
        _id: { $in: validFormIds.map(id => new ObjectId(id)) }
      }).toArray();
      forms.forEach(f => {
        formMap[f._id.toString()] = f.name;
      });
    }

    // Fetch verifier names (tl_verified_by, manager_approved_by, rejected_by)
    const verifierIds = [
      ...worksheets.map(w => w.tl_verified_by),
      ...worksheets.map(w => w.manager_approved_by),
      ...worksheets.map(w => w.rejected_by)
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const validVerifierIds = verifierIds.filter(id => ObjectId.isValid(id));

    const verifiers = validVerifierIds.length > 0 ? await db.collection('users').find({
      _id: { $in: validVerifierIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const verifierMap = {};
    verifiers.forEach(v => {
      verifierMap[v._id.toString()] = v.full_name;
    });

    res.json(worksheets.map(w => ({
      id: w._id.toString(),
      employee_id: w.employee_id,
      date: w.date,
      form_id: w.form_id,
      form_responses: w.form_responses || [],
      tasks_completed: w.tasks_completed || [],
      total_hours: w.total_hours || 0,
      notes: w.notes,
      status: w.status,
      submitted_at: w.submitted_at,
      tl_verified_by: verifierMap[w.tl_verified_by] || w.tl_verified_by || null,
      tl_verified_at: w.tl_verified_at,
      manager_approved_by: verifierMap[w.manager_approved_by] || w.manager_approved_by || null,
      manager_approved_at: w.manager_approved_at,
      rejection_reason: w.rejection_reason,
      rejected_by: verifierMap[w.rejected_by] || w.rejected_by || null,
      rejected_at: w.rejected_at,
      created_at: w.created_at,
      updated_at: w.updated_at,
      employee_name: employeeMap[w.employee_id] || null,
      form_name: w.form_id ? formMap[w.form_id.toString ? w.form_id.toString() : String(w.form_id)] || null : null
    })));
  } catch (error) {
    console.error('Get pending approval error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/pending-dm-approval - Get worksheets pending Delivery Manager approval
app.get('/worksheets/pending-dm-approval', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER]), async (req, res) => {
  try {
    const db = getDatabase();

    // Get all worksheets with MANAGER_APPROVED status (pending DM final approval)
    const query = { status: WorksheetStatus.MANAGER_APPROVED };

    const worksheets = await db.collection('worksheets')
      .find(query)
      .sort({ manager_approved_at: -1 })
      .limit(100)
      .toArray();

    // Fetch employee names
    const employeeIds = [...new Set(worksheets.map(w => w.employee_id).filter(Boolean))];
    const validEmployeeIds = employeeIds.filter(id => ObjectId.isValid(id));
    const employeeMap = {};
    if (validEmployeeIds.length > 0) {
      const employees = await db.collection('users').find({
        _id: { $in: validEmployeeIds.map(id => new ObjectId(id)) }
      }).toArray();
      employees.forEach(e => {
        employeeMap[e._id.toString()] = e.full_name;
      });
    }

    // Fetch form names
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const formMap = {};
    if (validFormIds.length > 0) {
      const forms = await db.collection('forms').find({
        _id: { $in: validFormIds.map(id => new ObjectId(id)) }
      }).toArray();
      forms.forEach(f => {
        formMap[f._id.toString()] = f.name;
      });
    }

    // Fetch verifier names
    const verifierIds = [
      ...worksheets.map(w => w.tl_verified_by),
      ...worksheets.map(w => w.manager_approved_by),
      ...worksheets.map(w => w.rejected_by)
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const validVerifierIds = verifierIds.filter(id => ObjectId.isValid(id));

    const verifiers = validVerifierIds.length > 0 ? await db.collection('users').find({
      _id: { $in: validVerifierIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const verifierMap = {};
    verifiers.forEach(v => {
      verifierMap[v._id.toString()] = v.full_name;
    });

    res.json(worksheets.map(w => ({
      id: w._id.toString(),
      employee_id: w.employee_id,
      date: w.date,
      form_id: w.form_id,
      form_responses: w.form_responses || [],
      tasks_completed: w.tasks_completed || [],
      total_hours: w.total_hours || 0,
      notes: w.notes,
      status: w.status,
      submitted_at: w.submitted_at,
      tl_verified_by: verifierMap[w.tl_verified_by] || w.tl_verified_by || null,
      tl_verified_at: w.tl_verified_at,
      manager_approved_by: verifierMap[w.manager_approved_by] || w.manager_approved_by || null,
      manager_approved_at: w.manager_approved_at,
      dm_approved_by: verifierMap[w.dm_approved_by] || w.dm_approved_by || null,
      dm_approved_at: w.dm_approved_at,
      rejection_reason: w.rejection_reason,
      rejected_by: verifierMap[w.rejected_by] || w.rejected_by || null,
      rejected_at: w.rejected_at,
      created_at: w.created_at,
      updated_at: w.updated_at,
      employee_name: employeeMap[w.employee_id] || null,
      form_name: w.form_id ? formMap[w.form_id.toString ? w.form_id.toString() : String(w.form_id)] || null : null
    })));
  } catch (error) {
    console.error('Get pending DM approval error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /worksheets/:id - Get single worksheet (MOVED AFTER SPECIFIC ROUTES)
app.get('/worksheets/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(id) });

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    // Check permissions
    if (userRole === UserRole.ASSOCIATE && worksheet.employee_id !== userId) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    // Fetch employee name
    const employee = await db.collection('users').findOne({ _id: new ObjectId(worksheet.employee_id) });
    const employeeName = employee?.full_name || null;

    // Fetch form name
    let formName = null;
    if (worksheet.form_id) {
      const form = await db.collection('forms').findOne({ _id: new ObjectId(worksheet.form_id) });
      formName = form?.name || null;
    }

    res.json({
      id: worksheet._id.toString(),
      employee_id: worksheet.employee_id,
      date: worksheet.date,
      form_id: worksheet.form_id,
      form_responses: worksheet.form_responses || [],
      tasks_completed: worksheet.tasks_completed || [],
      total_hours: worksheet.total_hours || 0,
      notes: worksheet.notes,
      status: worksheet.status,
      submitted_at: worksheet.submitted_at,
      tl_verified_by: worksheet.tl_verified_by,
      tl_verified_at: worksheet.tl_verified_at,
      manager_approved_by: worksheet.manager_approved_by,
      manager_approved_at: worksheet.manager_approved_at,
      rejection_reason: worksheet.rejection_reason,
      rejected_by: worksheet.rejected_by,
      rejected_at: worksheet.rejected_at,
      created_at: worksheet.created_at,
      updated_at: worksheet.updated_at,
      employee_name: employeeName,
      form_name: formName
    });
  } catch (error) {
    console.error('Get worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /worksheets/:id - Update worksheet (MOVED AFTER SPECIFIC ROUTES)
app.put('/worksheets/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { form_responses, tasks_completed, total_hours, notes } = req.body;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid worksheet ID' });
    }

    const worksheet = await db.collection('worksheets').findOne({ _id: new ObjectId(id) });

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.employee_id !== userId) {
      return res.status(403).json({ detail: 'Can only update your own worksheet' });
    }

    if (![WorksheetStatus.DRAFT, WorksheetStatus.REJECTED].includes(worksheet.status)) {
      return res.status(400).json({ detail: 'Can only update draft or rejected worksheets' });
    }

    const updates = { updated_at: getNow() };
    if (form_responses) updates.form_responses = form_responses;
    if (tasks_completed) updates.tasks_completed = tasks_completed;
    if (total_hours !== undefined) updates.total_hours = total_hours;
    if (notes !== undefined) updates.notes = notes;

    await db.collection('worksheets').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updated = await db.collection('worksheets').findOne({ _id: new ObjectId(id) });

    res.json({
      id: updated._id.toString(),
      employee_id: updated.employee_id,
      date: updated.date,
      form_id: updated.form_id,
      form_responses: updated.form_responses || [],
      tasks_completed: updated.tasks_completed || [],
      total_hours: updated.total_hours || 0,
      notes: updated.notes,
      status: updated.status,
      submitted_at: updated.submitted_at,
      tl_verified_by: updated.tl_verified_by,
      tl_verified_at: updated.tl_verified_at,
      manager_approved_by: updated.manager_approved_by,
      manager_approved_at: updated.manager_approved_at,
      rejection_reason: updated.rejection_reason,
      rejected_by: updated.rejected_by,
      rejected_at: updated.rejected_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error) {
    console.error('Update worksheet error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /notifications - Get notifications
app.get('/notifications', authenticate, async (req, res) => {
  try {
    const { is_read, skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const userId = req.user._id.toString();
    const query = { recipient_id: userId };

    if (is_read !== undefined) {
      query.is_read = is_read === 'true';
    }

    const notifications = await db.collection('notifications')
      .find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(notifications.map(n => ({
      id: n._id.toString(),
      recipient_id: n.recipient_id,
      type: (n.type || 'task_assigned').toLowerCase(),
      title: n.title,
      message: n.message,
      related_id: n.related_id,
      is_read: n.is_read || false,
      created_at: n.created_at
    })));
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /notifications/count - Get notification count
app.get('/notifications/count', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();

    const total = await db.collection('notifications').countDocuments({ recipient_id: userId });
    const unread = await db.collection('notifications').countDocuments({
      recipient_id: userId,
      is_read: false
    });

    res.json({ total, unread });
  } catch (error) {
    console.error('Get notification count error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /notifications/:notification_id/read
app.put('/notifications/:notification_id/read', authenticate, async (req, res) => {
  try {
    const { notification_id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(notification_id)) {
      return res.status(400).json({ detail: 'Invalid notification ID' });
    }

    const notification = await db.collection('notifications').findOne({
      _id: new ObjectId(notification_id),
      recipient_id: userId
    });

    if (!notification) {
      return res.status(404).json({ detail: 'Notification not found' });
    }

    await db.collection('notifications').updateOne(
      { _id: new ObjectId(notification_id) },
      { $set: { is_read: true } }
    );

    notification.is_read = true;
    res.json({
      id: notification._id.toString(),
      recipient_id: notification.recipient_id,
      type: (notification.type || 'task_assigned').toLowerCase(),
      title: notification.title,
      message: notification.message,
      related_id: notification.related_id,
      is_read: notification.is_read,
      created_at: notification.created_at
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /notifications/unread - Get only unread notifications
app.get('/notifications/unread', authenticate, async (req, res) => {
  try {
    const { skip = 0, limit = 50 } = req.query;
    const db = getDatabase();
    const userId = req.user._id.toString();

    const notifications = await db.collection('notifications')
      .find({
        recipient_id: userId,
        is_read: false
      })
      .sort({ created_at: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(notifications.map(n => ({
      id: n._id.toString(),
      recipient_id: n.recipient_id,
      type: (n.type || 'task_assigned').toLowerCase(),
      title: n.title,
      message: n.message,
      related_id: n.related_id,
      is_read: n.is_read || false,
      created_at: n.created_at
    })));
  } catch (error) {
    console.error('Get unread notifications error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// PUT /notifications/read-all - Mark all notifications as read
app.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();

    const result = await db.collection('notifications').updateMany(
      {
        recipient_id: userId,
        is_read: false
      },
      {
        $set: { is_read: true }
      }
    );

    res.json({
      message: 'All notifications marked as read',
      modified_count: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /notifications/:id - Delete single notification
app.delete('/notifications/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const userId = req.user._id.toString();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ detail: 'Invalid notification ID' });
    }

    const notification = await db.collection('notifications').findOne({
      _id: new ObjectId(id),
      recipient_id: userId
    });

    if (!notification) {
      return res.status(404).json({ detail: 'Notification not found' });
    }

    await db.collection('notifications').deleteOne({
      _id: new ObjectId(id),
      recipient_id: userId
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /notifications - Delete all notifications
app.delete('/notifications', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user._id.toString();

    const result = await db.collection('notifications').deleteMany({
      recipient_id: userId
    });

    res.json({
      message: 'All notifications deleted successfully',
      deleted_count: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/productivity - Productivity report
app.get('/reports/productivity', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    // Build employee filter
    const employeeQuery = {};
    if (userRole === UserRole.TEAM_LEAD) {
      employeeQuery.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      employeeQuery.manager_id = userId;
    }

    if (employee_id && ObjectId.isValid(employee_id)) {
      employeeQuery._id = new ObjectId(employee_id);
    }

    const employees = await db.collection('users').find({
      ...employeeQuery,
      role: UserRole.ASSOCIATE
    }).toArray();

    const startDate = start_date ? new Date(start_date) : moment.tz(IST).subtract(30, 'days').toDate();
    const endDate = end_date ? new Date(end_date) : moment.tz(IST).toDate();
    const startDateStr = moment(startDate).format('YYYY-MM-DD');
    const endDateStr = moment(endDate).format('YYYY-MM-DD');

    const empIds = employees.map(e => e._id.toString());

    // Batch fetch all data in parallel
    const [allTasks, allSessions, allWorksheets] = await Promise.all([
      db.collection('tasks').find({ assigned_to: { $in: empIds } }).toArray(),
      db.collection('time_sessions').find({
        employee_id: { $in: empIds },
        date: { $gte: startDateStr, $lte: endDateStr }
      }).toArray(),
      db.collection('worksheets').find({
        employee_id: { $in: empIds },
        date: { $gte: startDateStr, $lte: endDateStr }
      }).toArray()
    ]);

    // Pre-process data by employee
    const tasksByEmployee = {};
    const sessionsByEmployee = {};
    const worksheetsByEmployee = {};

    empIds.forEach(id => {
      tasksByEmployee[id] = { completed: 0, total: 0 };
      sessionsByEmployee[id] = [];
      worksheetsByEmployee[id] = { total: 0, approved: 0 };
    });

    allTasks.forEach(t => {
      if (tasksByEmployee[t.assigned_to]) {
        tasksByEmployee[t.assigned_to].total++;
        if (t.status === TaskStatus.COMPLETED && t.completed_at >= startDate && t.completed_at <= endDate) {
          tasksByEmployee[t.assigned_to].completed++;
        }
      }
    });

    allSessions.forEach(s => {
      if (sessionsByEmployee[s.employee_id]) {
        sessionsByEmployee[s.employee_id].push(s);
      }
    });

    allWorksheets.forEach(w => {
      if (worksheetsByEmployee[w.employee_id]) {
        worksheetsByEmployee[w.employee_id].total++;
        if (w.status === WorksheetStatus.MANAGER_APPROVED) {
          worksheetsByEmployee[w.employee_id].approved++;
        }
      }
    });

    // Build report data
    const reportData = employees.map(emp => {
      const empId = emp._id.toString();
      const tasks = tasksByEmployee[empId];
      const sessions = sessionsByEmployee[empId];
      const worksheets = worksheetsByEmployee[empId];

      const totalWorkHours = sessions.reduce((sum, s) => sum + (s.total_work_hours || 0), 0);
      const totalOvertime = sessions.reduce((sum, s) => sum + (s.overtime_hours || 0), 0);
      const daysWorked = sessions.length;

      return {
        employee_id: empId,
        employee_name: emp.full_name,
        employee_email: emp.email || '',
        department: emp.department || '',
        tasks_completed: tasks.completed,
        total_tasks: tasks.total,
        completion_rate: tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100 * 100) / 100 : 0,
        days_worked: daysWorked,
        total_work_hours: Math.round(totalWorkHours * 100) / 100,
        total_overtime_hours: Math.round(totalOvertime * 100) / 100,
        average_hours_per_day: daysWorked > 0 ? Math.round((totalWorkHours / daysWorked) * 100) / 100 : 0,
        worksheets_submitted: worksheets.total,
        worksheets_approved: worksheets.approved,
        worksheet_approval_rate: worksheets.total > 0 ? Math.round((worksheets.approved / worksheets.total) * 100 * 100) / 100 : 0
      };
    });

    // Calculate overview statistics
    const overview = {
      total_employees: reportData.length,
      total_tasks_completed: reportData.reduce((sum, emp) => sum + emp.tasks_completed, 0),
      total_tasks: reportData.reduce((sum, emp) => sum + emp.total_tasks, 0),
      average_completion_rate: reportData.length > 0
        ? Math.round((reportData.reduce((sum, emp) => sum + emp.completion_rate, 0) / reportData.length) * 100) / 100
        : 0,
      total_work_hours: reportData.reduce((sum, emp) => sum + emp.total_work_hours, 0),
      total_overtime_hours: reportData.reduce((sum, emp) => sum + emp.total_overtime_hours, 0),
      total_worksheets_submitted: reportData.reduce((sum, emp) => sum + emp.worksheets_submitted, 0),
      total_worksheets_approved: reportData.reduce((sum, emp) => sum + emp.worksheets_approved, 0)
    };

    res.json({
      report_type: 'productivity',
      date_range: {
        start: moment(startDate).format('YYYY-MM-DD'),
        end: moment(endDate).format('YYYY-MM-DD')
      },
      generated_at: moment.tz(IST).format(),
      overview,
      data: reportData
    });
  } catch (error) {
    console.error('Get productivity report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/attendance - Get attendance report
app.get('/reports/attendance', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    // Build employee filter
    const employeeQuery = {};
    if (userRole === UserRole.TEAM_LEAD) {
      employeeQuery.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      employeeQuery.manager_id = userId;
    }

    if (employee_id && ObjectId.isValid(employee_id)) {
      employeeQuery._id = new ObjectId(employee_id);
    }

    const employees = await db.collection('users').find({
      ...employeeQuery,
      role: UserRole.ASSOCIATE
    }).toArray();

    const startDate = start_date ? new Date(start_date) : moment.tz(IST).subtract(30, 'days').toDate();
    const endDate = end_date ? new Date(end_date) : moment.tz(IST).toDate();

    const reportData = [];
    const employeeMap = {};
    employees.forEach(emp => {
      employeeMap[emp._id.toString()] = emp.full_name;
    });

    // Get all sessions for all employees in the date range
    const employeeIds = employees.map(emp => emp._id.toString());
    const sessions = await db.collection('time_sessions').find({
      employee_id: { $in: employeeIds },
      date: {
        $gte: moment(startDate).format('YYYY-MM-DD'),
        $lte: moment(endDate).format('YYYY-MM-DD')
      }
    }).sort({ date: -1 }).toArray();

    // Return session-level data (one record per employee per day)
    sessions.forEach(session => {
      reportData.push({
        employee_id: session.employee_id,
        employee_name: employeeMap[session.employee_id] || null,
        date: session.date,
        login_time: session.login_time,
        logout_time: session.logout_time,
        total_work_hours: Math.round((session.total_work_hours || 0) * 100) / 100,
        total_break_minutes: session.total_break_minutes || 0,
        overtime_hours: Math.round((session.overtime_hours || 0) * 100) / 100,
        status: session.status
      });
    });

    // Calculate overview statistics
    const totalWorkHours = sessions.reduce((sum, s) => sum + (s.total_work_hours || 0), 0);
    const totalOvertimeHours = sessions.reduce((sum, s) => sum + (s.overtime_hours || 0), 0);
    const overview = {
      total_employees: employees.length,
      total_sessions: sessions.length,
      total_work_hours: Math.round(totalWorkHours * 100) / 100,
      total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
      average_work_hours_per_session: sessions.length > 0 ? Math.round((totalWorkHours / sessions.length) * 100) / 100 : 0
    };

    res.json({
      report_type: 'attendance',
      date_range: {
        start: moment(startDate).format('YYYY-MM-DD'),
        end: moment(endDate).format('YYYY-MM-DD')
      },
      generated_at: moment.tz(IST).format(),
      overview,
      data: reportData
    });
  } catch (error) {
    console.error('Get attendance report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/overtime - Get overtime report
app.get('/reports/overtime', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    // Build employee filter
    const employeeQuery = {};
    if (userRole === UserRole.TEAM_LEAD) {
      employeeQuery.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      employeeQuery.manager_id = userId;
    }

    if (employee_id && ObjectId.isValid(employee_id)) {
      employeeQuery._id = new ObjectId(employee_id);
    }

    const employees = await db.collection('users').find({
      ...employeeQuery,
      role: UserRole.ASSOCIATE
    }).toArray();

    const startDate = start_date ? new Date(start_date) : moment.tz(IST).subtract(30, 'days').toDate();
    const endDate = end_date ? new Date(end_date) : moment.tz(IST).toDate();

    const reportData = [];

    for (const emp of employees) {
      const empId = emp._id.toString();

      // Get time sessions with overtime
      const sessions = await db.collection('time_sessions').find({
        employee_id: empId,
        date: {
          $gte: moment(startDate).format('YYYY-MM-DD'),
          $lte: moment(endDate).format('YYYY-MM-DD')
        },
        overtime_hours: { $gt: 0 }
      }).sort({ date: -1 }).toArray();

      const totalOvertimeHours = sessions.reduce((sum, s) => sum + (s.overtime_hours || 0), 0);
      const daysWithOvertime = sessions.length;

      reportData.push({
        employee_id: empId,
        employee_name: emp.full_name,
        employee_email: emp.email || '',
        department: emp.department || '',
        total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
        days_with_overtime: daysWithOvertime,
        average_overtime_per_day: daysWithOvertime > 0 ? Math.round((totalOvertimeHours / daysWithOvertime) * 100) / 100 : 0,
        sessions: sessions.map(s => ({
          date: s.date,
          overtime_hours: s.overtime_hours,
          total_work_hours: s.total_work_hours
        }))
      });
    }

    const overview = {
      total_employees: reportData.length,
      total_overtime_hours: Math.round(reportData.reduce((sum, emp) => sum + emp.total_overtime_hours, 0) * 100) / 100,
      average_overtime_per_employee: reportData.length > 0
        ? Math.round((reportData.reduce((sum, emp) => sum + emp.total_overtime_hours, 0) / reportData.length) * 100) / 100
        : 0
    };

    res.json({
      report_type: 'overtime',
      date_range: {
        start: moment(startDate).format('YYYY-MM-DD'),
        end: moment(endDate).format('YYYY-MM-DD')
      },
      generated_at: moment.tz(IST).format(),
      overview,
      data: reportData
    });
  } catch (error) {
    console.error('Get overtime report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/team-performance - Get team performance report
app.get('/reports/team-performance', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date, team_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    const startDate = start_date ? new Date(start_date) : moment.tz(IST).subtract(30, 'days').toDate();
    const endDate = end_date ? new Date(end_date) : moment.tz(IST).toDate();

    // Build team filter
    const teamQuery = {};
    if (userRole === UserRole.TEAM_LEAD) {
      teamQuery.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      teamQuery.manager_id = userId;
    }

    if (team_id && ObjectId.isValid(team_id)) {
      teamQuery._id = new ObjectId(team_id);
    }

    const teams = await db.collection('teams').find(teamQuery).toArray();
    const teamIds = teams.map(t => t._id.toString());
    const startDateStr = moment(startDate).format('YYYY-MM-DD');
    const endDateStr = moment(endDate).format('YYYY-MM-DD');

    // Collect all member IDs from teams
    const allMemberIds = new Set();
    teams.forEach(team => {
      if (team.members) {
        team.members.forEach(m => allMemberIds.add(m));
      }
      if (team.team_lead_id) allMemberIds.add(team.team_lead_id);
    });
    const memberIdsArray = Array.from(allMemberIds);

    // Batch fetch all data in parallel
    const [allTeamMembers, allTasks, allWorksheets, allSessions, teamLeads] = await Promise.all([
      db.collection('team_members').find({ team_id: { $in: teamIds } }).toArray(),
      db.collection('tasks').find({
        assigned_to: { $in: memberIdsArray },
        created_at: { $gte: startDate, $lte: endDate }
      }).toArray(),
      db.collection('worksheets').find({
        employee_id: { $in: memberIdsArray },
        date: { $gte: startDateStr, $lte: endDateStr }
      }).toArray(),
      db.collection('time_sessions').find({
        employee_id: { $in: memberIdsArray },
        date: { $gte: startDateStr, $lte: endDateStr }
      }).toArray(),
      db.collection('users').find({
        _id: { $in: teams.filter(t => t.team_lead_id).map(t => new ObjectId(t.team_lead_id)) }
      }).toArray()
    ]);

    // Create team lead map
    const teamLeadMap = {};
    teamLeads.forEach(tl => {
      teamLeadMap[tl._id.toString()] = tl.full_name;
    });

    // Group team members by team
    const membersByTeam = {};
    allTeamMembers.forEach(tm => {
      if (!membersByTeam[tm.team_id]) {
        membersByTeam[tm.team_id] = [];
      }
      membersByTeam[tm.team_id].push(tm.employee_id);
    });

    // Build report data
    const reportData = teams.map(team => {
      const teamId = team._id.toString();
      const memberIds = team.members || membersByTeam[teamId] || [];
      const allTeamMemberIds = [...new Set([...memberIds, team.team_lead_id].filter(Boolean))];

      // Filter data for this team
      const teamTasks = allTasks.filter(t => allTeamMemberIds.includes(t.assigned_to));
      const teamWorksheets = allWorksheets.filter(w => allTeamMemberIds.includes(w.employee_id));
      const teamSessions = allSessions.filter(s => allTeamMemberIds.includes(s.employee_id));

      const completedTasks = teamTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      const inProgressTasks = teamTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
      const todoTasks = teamTasks.filter(t => t.status === TaskStatus.TODO).length;
      const submittedWorksheets = teamWorksheets.filter(w => w.status !== WorksheetStatus.DRAFT).length;
      const approvedWorksheets = teamWorksheets.filter(w => w.status === WorksheetStatus.MANAGER_APPROVED).length;
      const totalWorkHours = teamSessions.reduce((sum, s) => sum + (s.total_work_hours || 0), 0);
      const totalOvertimeHours = teamSessions.reduce((sum, s) => sum + (s.overtime_hours || 0), 0);

      return {
        team_id: teamId,
        team_name: team.name,
        team_lead: teamLeadMap[team.team_lead_id] || 'Not Assigned',
        team_description: team.description || '',
        member_count: allTeamMemberIds.length,
        tasks_completed: completedTasks,
        task_completion_rate: teamTasks.length > 0 ? Math.round((completedTasks / teamTasks.length) * 100 * 100) / 100 : 0,
        worksheets_submitted: submittedWorksheets,
        worksheet_approval_rate: submittedWorksheets > 0 ? Math.round((approvedWorksheets / submittedWorksheets) * 100 * 100) / 100 : 0,
        total_work_hours: Math.round(totalWorkHours * 100) / 100,
        tasks: {
          total: teamTasks.length,
          completed: completedTasks,
          in_progress: inProgressTasks,
          todo: todoTasks,
          completion_rate: teamTasks.length > 0 ? Math.round((completedTasks / teamTasks.length) * 100 * 100) / 100 : 0
        },
        worksheets: {
          total: teamWorksheets.length,
          submitted: submittedWorksheets,
          approved: approvedWorksheets,
          approval_rate: submittedWorksheets > 0 ? Math.round((approvedWorksheets / submittedWorksheets) * 100 * 100) / 100 : 0
        },
        attendance: {
          total_work_hours: Math.round(totalWorkHours * 100) / 100,
          total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
          average_hours_per_member: allTeamMemberIds.length > 0 ? Math.round((totalWorkHours / allTeamMemberIds.length) * 100) / 100 : 0
        }
      };
    });

    res.json({
      report_type: 'team_performance',
      date_range: {
        start: moment(startDate).format('YYYY-MM-DD'),
        end: moment(endDate).format('YYYY-MM-DD')
      },
      generated_at: moment.tz(IST).format(),
      data: reportData
    });
  } catch (error) {
    console.error('Get team performance report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/worksheet-analytics - Get worksheet analytics report
app.get('/reports/worksheet-analytics', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    const startDate = start_date ? new Date(start_date) : moment.tz(IST).subtract(30, 'days').toDate();
    const endDate = end_date ? new Date(end_date) : moment.tz(IST).toDate();

    // Build employee filter based on assigned teams
    let employeeIds = [];
    if (userRole === UserRole.TEAM_LEAD) {
      // Get all teams where user is team_lead
      const assignedTeams = await db.collection('teams').find({ team_lead_id: userId, is_active: true }).toArray();
      const memberIds = new Set();
      assignedTeams.forEach(team => {
        if (team.members) {
          team.members.forEach(memberId => memberIds.add(memberId));
        }
      });
      employeeIds = Array.from(memberIds);
    } else if (userRole === UserRole.MANAGER) {
      // Get all teams where user is manager
      const assignedTeams = await db.collection('teams').find({ manager_id: userId, is_active: true }).toArray();
      const memberIds = new Set();
      assignedTeams.forEach(team => {
        if (team.team_lead_id) {
          memberIds.add(team.team_lead_id);
        }
        if (team.members) {
          team.members.forEach(memberId => memberIds.add(memberId));
        }
      });
      employeeIds = Array.from(memberIds);
    }

    // Build employee query
    const employeeQuery = { role: UserRole.ASSOCIATE };
    if (userRole === UserRole.TEAM_LEAD || userRole === UserRole.MANAGER) {
      employeeQuery._id = { $in: employeeIds.map(id => new ObjectId(id)) };
    }
    if (employee_id && ObjectId.isValid(employee_id)) {
      employeeQuery._id = new ObjectId(employee_id);
    }

    const employees = await db.collection('users').find(employeeQuery).toArray();

    const reportData = [];

    for (const emp of employees) {
      const empId = emp._id.toString();

      const worksheets = await db.collection('worksheets').find({
        employee_id: empId,
        date: {
          $gte: moment(startDate).format('YYYY-MM-DD'),
          $lte: moment(endDate).format('YYYY-MM-DD')
        }
      }).toArray();

      const totalWorksheets = worksheets.length;
      const draftWorksheets = worksheets.filter(w => w.status === WorksheetStatus.DRAFT).length;
      const submittedWorksheets = worksheets.filter(w => w.status === WorksheetStatus.SUBMITTED).length;
      const verifiedWorksheets = worksheets.filter(w => w.status === WorksheetStatus.TL_VERIFIED).length;
      const approvedWorksheets = worksheets.filter(w => w.status === WorksheetStatus.MANAGER_APPROVED).length;
      const rejectedWorksheets = worksheets.filter(w => w.status === WorksheetStatus.REJECTED).length;

      const submissionRate = totalWorksheets > 0 ? Math.round((submittedWorksheets / totalWorksheets) * 100 * 100) / 100 : 0;
      const approvalRate = submittedWorksheets > 0 ? Math.round((approvedWorksheets / submittedWorksheets) * 100 * 100) / 100 : 0;

      reportData.push({
        employee_id: empId,
        employee_name: emp.full_name,
        employee_email: emp.email || '',
        department: emp.department || '',
        total_worksheets: totalWorksheets,
        draft: draftWorksheets,
        submitted: submittedWorksheets,
        verified: verifiedWorksheets,
        approved: approvedWorksheets,
        rejected: rejectedWorksheets,
        submission_rate: submissionRate,
        approval_rate: approvalRate
      });
    }

    const overview = {
      total_employees: reportData.length,
      total_worksheets: reportData.reduce((sum, emp) => sum + emp.total_worksheets, 0),
      total_approved: reportData.reduce((sum, emp) => sum + emp.approved, 0),
      total_rejected: reportData.reduce((sum, emp) => sum + emp.rejected, 0),
      average_submission_rate: reportData.length > 0
        ? Math.round((reportData.reduce((sum, emp) => sum + emp.submission_rate, 0) / reportData.length) * 100) / 100
        : 0,
      average_approval_rate: reportData.length > 0
        ? Math.round((reportData.reduce((sum, emp) => sum + emp.approval_rate, 0) / reportData.length) * 100) / 100
        : 0
    };

    res.json({
      report_type: 'worksheet_analytics',
      date_range: {
        start: moment(startDate).format('YYYY-MM-DD'),
        end: moment(endDate).format('YYYY-MM-DD')
      },
      generated_at: moment.tz(IST).format(),
      overview,
      data: reportData
    });
  } catch (error) {
    console.error('Get worksheet analytics error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/projects - Project-wise report with member login status and aggregated data
app.get('/reports/projects', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    const today = moment.tz(IST).format('YYYY-MM-DD');
    const startDate = start_date || today;
    const endDate = end_date || today;

    // Build team query based on role
    const teamQuery = { is_active: true };
    if (userRole === UserRole.TEAM_LEAD) {
      teamQuery.team_lead_id = userId;
    } else if (userRole === UserRole.MANAGER) {
      teamQuery.manager_id = userId;
    }

    const teams = await db.collection('teams').find(teamQuery).toArray();

    // Get today's attendance for all relevant members
    const allMemberIds = new Set();
    teams.forEach(team => {
      if (team.members) {
        team.members.forEach(m => allMemberIds.add(m));
      }
      if (team.team_lead_id) allMemberIds.add(team.team_lead_id);
    });

    const memberIdsArray = Array.from(allMemberIds);

    // Parallel fetch: attendance, worksheets, users, tasks
    const [todayAttendance, worksheets, users, tasks] = await Promise.all([
      db.collection('time_sessions').find({
        employee_id: { $in: memberIdsArray },
        date: today,
        status: { $in: ['active', 'completed', 'on_break'] }
      }).toArray(),
      db.collection('worksheets').find({
        employee_id: { $in: memberIdsArray },
        date: { $gte: startDate, $lte: endDate }
      }).toArray(),
      db.collection('users').find({
        _id: { $in: memberIdsArray.map(id => new ObjectId(id)) }
      }).toArray(),
      db.collection('tasks').find({
        assigned_to: { $in: memberIdsArray }
      }).toArray()
    ]);

    const loggedInUserIds = new Set(todayAttendance.map(a => a.employee_id));

    // Get forms for form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const forms = validFormIds.length > 0 ? await db.collection('forms').find({
      _id: { $in: validFormIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const formMap = {};
    forms.forEach(f => {
      formMap[f._id.toString()] = f.name;
    });

    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    const tasksByMember = {};
    tasks.forEach(t => {
      if (!tasksByMember[t.assigned_to]) {
        tasksByMember[t.assigned_to] = [];
      }
      tasksByMember[t.assigned_to].push(t);
    });

    const projectsData = [];

    for (const team of teams) {
      const teamId = team._id.toString();
      const teamMembers = team.members || [];
      const allTeamMembers = [...new Set([...teamMembers, team.team_lead_id].filter(Boolean))];

      // Count logged in today
      const loggedInToday = allTeamMembers.filter(m => loggedInUserIds.has(m)).length;

      // Get team worksheets
      const teamWorksheets = worksheets.filter(w => allTeamMembers.includes(w.employee_id));

      // Calculate aggregated data based on project type
      let aggregatedData = {};
      const teamNameLower = (team.name || '').toLowerCase();

      // For Annotation projects - sum image count
      if (teamNameLower.includes('annotation')) {
        let totalImageCount = 0;
        teamWorksheets.forEach(ws => {
          if (ws.form_responses) {
            ws.form_responses.forEach(resp => {
              if (resp.field_id === 'image_count' ||
                  (resp.field_label && resp.field_label.toLowerCase().includes('image'))) {
                totalImageCount += parseInt(resp.value) || 0;
              }
            });
          }
        });
        aggregatedData.total_image_count = totalImageCount;
        aggregatedData.type = 'annotation';
      }

      // For Finance/Pleo projects - sum pleo validation count
      if (teamNameLower.includes('finance') || teamNameLower.includes('pleo')) {
        let totalPleoValidation = 0;
        teamWorksheets.forEach(ws => {
          if (ws.form_responses) {
            ws.form_responses.forEach(resp => {
              if (resp.field_id === 'pleo_validation_count' ||
                  resp.field_id === 'pleo_count' ||
                  (resp.field_label && (resp.field_label.toLowerCase().includes('pleo') ||
                   resp.field_label.toLowerCase().includes('validation')))) {
                totalPleoValidation += parseInt(resp.value) || 0;
              }
            });
          }
        });
        aggregatedData.total_pleo_validation = totalPleoValidation;
        aggregatedData.type = 'finance_pleo';
      }

      // For Project Managers projects - identify for member dropdown
      if (teamNameLower.includes('project manager') || teamNameLower.includes('project_manager')) {
        aggregatedData.type = 'project_managers';
      }

      // Get team lead and manager names
      const teamLead = team.team_lead_id ? userMap[team.team_lead_id] : null;
      const manager = team.manager_id ? userMap[team.manager_id] : null;

      // Check if this is a project_managers type team (need worksheet details)
      const isProjectManagersTeam = aggregatedData.type === 'project_managers';

      // Build member details with worksheet data
      const memberDetails = allTeamMembers.map(memberId => {
        const user = userMap[memberId];
        const memberWorksheets = teamWorksheets.filter(w => w.employee_id === memberId);
        const isLoggedIn = loggedInUserIds.has(memberId);

        // Aggregate worksheet data for this member
        let memberImageCount = 0;
        let memberPleoCount = 0;
        let totalHours = 0;

        // Calculate totals from worksheets
        memberWorksheets.forEach(ws => {
          totalHours += ws.total_hours || 0;
          if (ws.form_responses) {
            ws.form_responses.forEach(resp => {
              if (resp.field_id === 'image_count' ||
                  (resp.field_label && resp.field_label.toLowerCase().includes('image'))) {
                memberImageCount += parseInt(resp.value) || 0;
              }
              if (resp.field_id === 'pleo_validation_count' ||
                  resp.field_id === 'pleo_count' ||
                  (resp.field_label && (resp.field_label.toLowerCase().includes('pleo') ||
                   resp.field_label.toLowerCase().includes('validation')))) {
                memberPleoCount += parseInt(resp.value) || 0;
              }
            });
          }
        });

        // Only build detailed worksheet list for project_managers type teams
        let worksheetDetails = [];
        if (isProjectManagersTeam) {
          worksheetDetails = memberWorksheets.slice(0, 20).map(ws => ({
            id: ws._id.toString(),
            date: ws.date,
            form_name: ws.form_id ? formMap[ws.form_id.toString ? ws.form_id.toString() : String(ws.form_id)] || null : null,
            status: ws.status,
            total_hours: ws.total_hours || 0
          }));
        }

        // Get member's tasks
        const memberTasks = tasksByMember[memberId] || [];

        return {
          id: memberId,
          name: user?.full_name || 'Unknown',
          employee_id: user?.employee_id || '',
          role: user?.role || '',
          is_logged_in: isLoggedIn,
          worksheets_count: memberWorksheets.length,
          tasks_count: memberTasks.length,
          total_hours: Math.round(totalHours * 100) / 100,
          image_count: memberImageCount,
          pleo_validation_count: memberPleoCount,
          worksheets: worksheetDetails
        };
      });

      projectsData.push({
        id: teamId,
        name: team.name,
        description: team.description || '',
        team_lead: teamLead?.full_name || 'Not Assigned',
        team_lead_id: team.team_lead_id,
        manager: manager?.full_name || 'Not Assigned',
        manager_id: team.manager_id,
        total_members: allTeamMembers.length,
        logged_in_today: loggedInToday,
        worksheets_submitted: teamWorksheets.filter(w => w.status !== 'draft').length,
        ...aggregatedData,
        members: memberDetails
      });
    }

    res.json({
      report_type: 'projects',
      date: today,
      date_range: { start: startDate, end: endDate },
      generated_at: moment.tz(IST).format(),
      data: projectsData
    });
  } catch (error) {
    console.error('Get projects report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/manager-members - Get manager's assigned members with their worksheet data
app.get('/reports/manager-members', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER]), async (req, res) => {
  try {
    const { manager_id, start_date, end_date } = req.query;
    const db = getDatabase();
    const userRole = req.user.role;
    const userId = req.user._id.toString();

    const today = moment.tz(IST).format('YYYY-MM-DD');
    const startDate = start_date || today;
    const endDate = end_date || today;

    // Determine which manager's data to fetch
    let targetManagerId = userId;
    if ((userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER) && manager_id) {
      targetManagerId = manager_id;
    }

    // Parallel fetch: managers (if needed) and members
    const [allManagers, members] = await Promise.all([
      (userRole === UserRole.ADMIN || userRole === UserRole.DELIVERY_MANAGER)
        ? db.collection('users').find({ role: UserRole.MANAGER, is_active: true }).toArray()
        : Promise.resolve([]),
      db.collection('users').find({ manager_id: targetManagerId, is_active: true }).toArray()
    ]);

    const memberIds = members.map(m => m._id.toString());

    // Parallel fetch: attendance and worksheets
    const [todayAttendance, worksheets] = await Promise.all([
      db.collection('time_sessions').find({
        employee_id: { $in: memberIds },
        date: today
      }).toArray(),
      db.collection('worksheets').find({
        employee_id: { $in: memberIds },
        date: { $gte: startDate, $lte: endDate }
      }).toArray()
    ]);

    const attendanceMap = {};
    todayAttendance.forEach(a => {
      attendanceMap[a.employee_id] = a;
    });

    // Get forms for form names - filter out invalid ObjectIds and handle both string and ObjectId formats
    const formIds = [...new Set(worksheets.map(w => w.form_id).filter(Boolean).map(id => id.toString ? id.toString() : String(id)))];
    const validFormIds = formIds.filter(id => ObjectId.isValid(id));
    const forms = validFormIds.length > 0 ? await db.collection('forms').find({
      _id: { $in: validFormIds.map(id => new ObjectId(id)) }
    }).toArray() : [];
    const formMap = {};
    forms.forEach(f => {
      formMap[f._id.toString()] = f.name;
    });

    // Build member data with worksheet details
    const memberData = members.map(member => {
      const memberId = member._id.toString();
      const memberWorksheets = worksheets.filter(w => w.employee_id === memberId);
      const attendance = attendanceMap[memberId];

      // Aggregate worksheet data
      let totalHours = 0;
      let totalImageCount = 0;
      let totalPleoCount = 0;

      // Calculate totals first
      memberWorksheets.forEach(ws => {
        totalHours += ws.total_hours || 0;
        if (ws.form_responses) {
          ws.form_responses.forEach(resp => {
            if (resp.field_id === 'image_count' ||
                (resp.field_label && resp.field_label.toLowerCase().includes('image'))) {
              totalImageCount += parseInt(resp.value) || 0;
            }
            if (resp.field_id === 'pleo_validation_count' ||
                resp.field_id === 'pleo_count' ||
                (resp.field_label && (resp.field_label.toLowerCase().includes('pleo') ||
                 resp.field_label.toLowerCase().includes('validation')))) {
              totalPleoCount += parseInt(resp.value) || 0;
            }
          });
        }
      });

      // Limit worksheet details to most recent 15
      const worksheetDetails = memberWorksheets.slice(0, 15).map(ws => ({
        id: ws._id.toString(),
        date: ws.date,
        form_name: ws.form_id ? formMap[ws.form_id.toString ? ws.form_id.toString() : String(ws.form_id)] || null : null,
        status: ws.status,
        total_hours: ws.total_hours || 0
      }));

      return {
        id: memberId,
        name: member.full_name,
        employee_id: member.employee_id,
        email: member.email,
        role: member.role,
        department: member.department,
        is_logged_in: attendance ? ['active', 'on_break'].includes(attendance.status) : false,
        login_time: attendance?.login_time || null,
        total_worksheets: memberWorksheets.length,
        total_hours: Math.round(totalHours * 100) / 100,
        total_image_count: totalImageCount,
        total_pleo_validation: totalPleoCount,
        worksheets: worksheetDetails
      };
    });

    res.json({
      managers: allManagers.map(m => ({
        id: m._id.toString(),
        name: m.full_name
      })),
      selected_manager_id: targetManagerId,
      date_range: { start: startDate, end: endDate },
      generated_at: moment.tz(IST).format(),
      data: memberData
    });
  } catch (error) {
    console.error('Get manager members report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/export/productivity - Export productivity report as CSV
app.get('/reports/export/productivity', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    // Get the report data
    const reportResponse = await fetch(`http://localhost:${config.PORT}/reports/productivity?${new URLSearchParams(req.query)}`);
    const reportData = await reportResponse.json();

    // Convert to CSV
    const csvRows = [];
    csvRows.push('Employee Name,Email,Department,Tasks Completed,Tasks In Progress,Total Tasks,Completion Rate,Total Work Hours,Avg Hours/Day');

    for (const emp of reportData.data) {
      csvRows.push([
        emp.employee_name,
        emp.employee_email,
        emp.department,
        emp.tasks_completed,
        emp.tasks_in_progress,
        emp.total_tasks,
        emp.completion_rate,
        emp.total_work_hours,
        emp.average_hours_per_day
      ].join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=productivity_report_${moment().format('YYYYMMDD')}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export productivity report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/export/attendance - Export attendance report as CSV
app.get('/reports/export/attendance', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    // Get the report data
    const reportResponse = await fetch(`http://localhost:${config.PORT}/reports/attendance?${new URLSearchParams(req.query)}`);
    const reportData = await reportResponse.json();

    // Convert to CSV
    const csvRows = [];
    csvRows.push('Employee Name,Email,Department,Expected Days,Days Present,Days Absent,Attendance Rate,Total Work Hours,Avg Hours/Day,Total Break Minutes,Total Overtime,Late Arrivals,Early Departures');

    for (const emp of reportData.data) {
      csvRows.push([
        emp.employee_name,
        emp.employee_email,
        emp.department,
        emp.expected_days,
        emp.days_present,
        emp.days_absent,
        emp.attendance_rate,
        emp.total_work_hours,
        emp.average_hours_per_day,
        emp.total_break_minutes,
        emp.total_overtime_hours,
        emp.late_arrivals,
        emp.early_departures
      ].join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDD')}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export attendance report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /reports/export/overtime - Export overtime report as CSV
app.get('/reports/export/overtime', authenticate, requireRoles([UserRole.ADMIN, UserRole.DELIVERY_MANAGER, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req, res) => {
  try {
    // Get the report data
    const reportResponse = await fetch(`http://localhost:${config.PORT}/reports/overtime?${new URLSearchParams(req.query)}`);
    const reportData = await reportResponse.json();

    // Convert to CSV
    const csvRows = [];
    csvRows.push('Employee Name,Email,Department,Total Overtime Hours,Days With Overtime,Avg Overtime/Day');

    for (const emp of reportData.data) {
      csvRows.push([
        emp.employee_name,
        emp.employee_email,
        emp.department,
        emp.total_overtime_hours,
        emp.days_with_overtime,
        emp.average_overtime_per_day
      ].join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=overtime_report_${moment().format('YYYYMMDD')}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export overtime report error:', error);
    res.status(500).json({ detail: error.message });
  }
});

// ==================== START SERVER ====================

async function startServer() {
  try {
    await connectToMongo();

    app.listen(config.PORT, () => {
      console.log(`\n${config.APP_NAME} - Express Server`);
      console.log(`Server running on http://localhost:${config.PORT}`);
      console.log(`Health check: http://localhost:${config.PORT}/health`);
      console.log('\nAvailable endpoints:');
      console.log('  POST   /auth/register-admin');
      console.log('  POST   /auth/login');
      console.log('  GET    /auth/me');
      console.log('  [+150 more endpoints...]');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

startServer();

module.exports = app;
