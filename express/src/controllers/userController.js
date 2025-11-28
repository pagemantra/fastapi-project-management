const User = require('../models/User');

exports.getUsers = async (req, res, next) => {
  try {
    const { role, is_active, skip = 0, limit = 100 } = req.query;

    const query = {};
    if (role) query.role = role;
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const users = await User.find(query)
      .populate('manager_id', 'full_name email')
      .populate('team_lead_id', 'full_name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ created_at: -1 });

    res.json(users.map(u => u.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { email, employee_id, password, full_name, role, phone, department, manager_id, team_lead_id } = req.body;

    const user = new User({
      email,
      employee_id,
      password,
      full_name,
      role,
      phone,
      department,
      manager_id,
      team_lead_id
    });

    await user.save();

    res.status(201).json(user.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('manager_id', 'full_name email')
      .populate('team_lead_id', 'full_name email');

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    res.json(user.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { full_name, phone, department, role, is_active, manager_id, team_lead_id } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    if (full_name) user.full_name = full_name;
    if (phone !== undefined) user.phone = phone;
    if (department !== undefined) user.department = department;
    if (role) user.role = role;
    if (is_active !== undefined) user.is_active = is_active;
    if (manager_id !== undefined) user.manager_id = manager_id || null;
    if (team_lead_id !== undefined) user.team_lead_id = team_lead_id || null;

    await user.save();

    res.json(user.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    user.is_active = false;
    await user.save();

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getManagers = async (req, res, next) => {
  try {
    const managers = await User.find({ role: 'manager', is_active: true })
      .select('full_name email role')
      .sort({ full_name: 1 });

    res.json(managers.map(m => m.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.getTeamLeads = async (req, res, next) => {
  try {
    const teamLeads = await User.find({ role: 'team_lead', is_active: true })
      .select('full_name email role')
      .sort({ full_name: 1 });

    res.json(teamLeads.map(tl => tl.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.getEmployees = async (req, res, next) => {
  try {
    const employees = await User.find({ role: 'employee', is_active: true })
      .select('full_name email role department')
      .sort({ full_name: 1 });

    res.json(employees.map(e => e.toJSON()));
  } catch (error) {
    next(error);
  }
};
