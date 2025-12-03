const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRATION
  });
};

exports.login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      return res.status(400).json({ detail: 'Email/username and password are required' });
    }

    // Find user by email or employee_id
    const user = await User.findOne({
      $or: [{ email: loginIdentifier }, { employee_id: loginIdentifier }],
      is_active: true
    });

    if (!user) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

exports.getCurrentUser = async (req, res, next) => {
  try {
    res.json(req.user.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, department } = req.body;

    req.user.full_name = full_name || req.user.full_name;
    req.user.phone = phone !== undefined ? phone : req.user.phone;
    req.user.department = department !== undefined ? department : req.user.department;

    await req.user.save();

    res.json(req.user.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;

    const isValidPassword = await req.user.comparePassword(old_password);

    if (!isValidPassword) {
      return res.status(400).json({ detail: 'Invalid current password' });
    }

    req.user.password = new_password;
    await req.user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};
