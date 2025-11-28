const Attendance = require('../models/Attendance');
const BreakSettings = require('../models/BreakSettings');

exports.login = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({
      employee_id: req.userId,
      date: { $gte: today }
    });

    if (attendance) {
      return res.status(400).json({ detail: 'Already logged in today' });
    }

    attendance = new Attendance({
      employee_id: req.userId,
      date: new Date(),
      login_time: new Date(),
      status: 'active',
      breaks: []
    });

    await attendance.save();

    res.json(attendance.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee_id: req.userId,
      date: { $gte: today },
      status: { $in: ['active', 'on_break'] }
    });

    if (!attendance) {
      return res.status(400).json({ detail: 'No active attendance record found' });
    }

    // End any active break
    if (attendance.status === 'on_break' && attendance.breaks.length > 0) {
      const lastBreak = attendance.breaks[attendance.breaks.length - 1];
      if (!lastBreak.end_time) {
        lastBreak.end_time = new Date();
        lastBreak.duration_minutes = Math.floor((lastBreak.end_time - lastBreak.start_time) / 60000);
      }
    }

    attendance.logout_time = new Date();
    attendance.status = 'completed';

    // Calculate total work hours
    const workMs = attendance.logout_time - attendance.login_time;
    const totalBreakMs = attendance.breaks.reduce((sum, b) => sum + (b.duration_minutes || 0) * 60000, 0);
    attendance.total_work_hours = ((workMs - totalBreakMs) / 3600000).toFixed(2);
    attendance.total_break_minutes = Math.floor(totalBreakMs / 60000);

    // Calculate overtime (assuming 8 hours is standard)
    const overtimeHours = Math.max(0, attendance.total_work_hours - 8);
    attendance.overtime_hours = overtimeHours.toFixed(2);

    await attendance.save();

    res.json(attendance.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.startBreak = async (req, res, next) => {
  try {
    const { break_type } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee_id: req.userId,
      date: { $gte: today },
      status: 'active'
    });

    if (!attendance) {
      return res.status(400).json({ detail: 'No active attendance record found' });
    }

    attendance.breaks.push({
      break_type: break_type || 'short',
      start_time: new Date()
    });

    attendance.status = 'on_break';
    await attendance.save();

    res.json(attendance.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.endBreak = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee_id: req.userId,
      date: { $gte: today },
      status: 'on_break'
    });

    if (!attendance) {
      return res.status(400).json({ detail: 'No active break found' });
    }

    const lastBreak = attendance.breaks[attendance.breaks.length - 1];
    lastBreak.end_time = new Date();
    lastBreak.duration_minutes = Math.floor((lastBreak.end_time - lastBreak.start_time) / 60000);

    attendance.status = 'active';
    attendance.total_break_minutes = attendance.breaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);

    await attendance.save();

    res.json(attendance.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getCurrentAttendance = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee_id: req.userId,
      date: { $gte: today }
    });

    res.json(attendance ? attendance.toJSON() : null);
  } catch (error) {
    next(error);
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const { start_date, end_date, employee_id, skip = 0, limit = 100 } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'employee') {
      query.employee_id = req.userId;
    } else if (employee_id) {
      query.employee_id = employee_id;
    }

    if (start_date || end_date) {
      query.date = {};
      if (start_date) query.date.$gte = new Date(start_date);
      if (end_date) query.date.$lte = new Date(end_date);
    }

    const records = await Attendance.find(query)
      .populate('employee_id', 'full_name email employee_id')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const results = records.map(r => {
      const json = r.toJSON();
      json.employee_name = r.employee_id?.full_name;
      return json;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
};

exports.getBreakSettings = async (req, res, next) => {
  try {
    const settings = await BreakSettings.findOne({ team_id: req.params.teamId });
    res.json(settings ? settings.toJSON() : null);
  } catch (error) {
    next(error);
  }
};

exports.createBreakSettings = async (req, res, next) => {
  try {
    const { team_id, enforce_limits, max_breaks_per_day, max_break_duration_minutes, lunch_break_duration, short_break_duration } = req.body;

    const settings = new BreakSettings({
      team_id,
      enforce_limits,
      max_breaks_per_day,
      max_break_duration_minutes,
      lunch_break_duration,
      short_break_duration
    });

    await settings.save();

    res.status(201).json(settings.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateBreakSettings = async (req, res, next) => {
  try {
    const { enforce_limits, max_breaks_per_day, max_break_duration_minutes, lunch_break_duration, short_break_duration } = req.body;

    const settings = await BreakSettings.findOne({ team_id: req.params.teamId });

    if (!settings) {
      return res.status(404).json({ detail: 'Break settings not found' });
    }

    if (enforce_limits !== undefined) settings.enforce_limits = enforce_limits;
    if (max_breaks_per_day !== undefined) settings.max_breaks_per_day = max_breaks_per_day;
    if (max_break_duration_minutes !== undefined) settings.max_break_duration_minutes = max_break_duration_minutes;
    if (lunch_break_duration !== undefined) settings.lunch_break_duration = lunch_break_duration;
    if (short_break_duration !== undefined) settings.short_break_duration = short_break_duration;

    await settings.save();

    res.json(settings.toJSON());
  } catch (error) {
    next(error);
  }
};
