const Attendance = require('../models/Attendance');
const Worksheet = require('../models/Worksheet');
const Task = require('../models/Task');
const Team = require('../models/Team');
const User = require('../models/User');

exports.getProductivityReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const dateFilter = {};
    if (start_date) dateFilter.$gte = new Date(start_date);
    if (end_date) dateFilter.$lte = new Date(end_date);

    const users = await User.find({ role: 'employee', is_active: true });
    const data = [];

    for (const user of users) {
      const tasks = await Task.find({
        assigned_to: user._id,
        ...(Object.keys(dateFilter).length > 0 && { created_at: dateFilter })
      });

      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const attendance = await Attendance.find({
        employee_id: user._id,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
      });

      const totalHours = attendance.reduce((sum, a) => sum + (parseFloat(a.total_work_hours) || 0), 0);
      const overtimeHours = attendance.reduce((sum, a) => sum + (parseFloat(a.overtime_hours) || 0), 0);

      data.push({
        employee_id: user._id,
        employee_name: user.full_name,
        department: user.department,
        tasks_completed: completedTasks,
        total_tasks: tasks.length,
        completion_rate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
        days_worked: attendance.length,
        total_work_hours: totalHours.toFixed(2),
        total_overtime_hours: overtimeHours.toFixed(2)
      });
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

exports.getAttendanceReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const query = {};
    if (start_date || end_date) {
      query.date = {};
      if (start_date) query.date.$gte = new Date(start_date);
      if (end_date) query.date.$lte = new Date(end_date);
    }

    const records = await Attendance.find(query)
      .populate('employee_id', 'full_name email')
      .sort({ date: -1 });

    const data = records.map(r => ({
      employee_id: r.employee_id._id,
      employee_name: r.employee_id.full_name,
      date: r.date.toISOString().split('T')[0],
      login_time: r.login_time,
      logout_time: r.logout_time,
      total_work_hours: r.total_work_hours,
      total_break_minutes: r.total_break_minutes,
      overtime_hours: r.overtime_hours,
      status: r.status
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

exports.getOvertimeReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const matchStage = {};
    if (start_date || end_date) {
      matchStage.date = {};
      if (start_date) matchStage.date.$gte = new Date(start_date);
      if (end_date) matchStage.date.$lte = new Date(end_date);
    }

    const overtimeData = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$employee_id',
          total_overtime_hours: { $sum: { $toDouble: '$overtime_hours' } },
          overtime_days: {
            $sum: { $cond: [{ $gt: [{ $toDouble: '$overtime_hours' }, 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = await Promise.all(overtimeData.map(async (item) => {
      const user = await User.findById(item._id);
      return {
        employee_id: item._id,
        employee_name: user?.full_name || 'Unknown',
        department: user?.department,
        total_overtime_hours: item.total_overtime_hours.toFixed(2),
        overtime_days: item.overtime_days,
        average_overtime_per_day: item.overtime_days > 0
          ? (item.total_overtime_hours / item.overtime_days).toFixed(2)
          : 0
      };
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

exports.getWorksheetAnalytics = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const matchStage = {};
    if (start_date || end_date) {
      matchStage.date = {};
      if (start_date) matchStage.date.$gte = new Date(start_date);
      if (end_date) matchStage.date.$lte = new Date(end_date);
    }

    const worksheets = await Worksheet.find(matchStage);

    const statusDistribution = worksheets.reduce((acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    }, {});

    const totalWorksheets = worksheets.length;
    const approved = statusDistribution.manager_approved || 0;
    const rejected = statusDistribution.rejected || 0;

    const summary = {
      total_worksheets: totalWorksheets,
      approved,
      rejected,
      pending_verification: statusDistribution.submitted || 0,
      pending_approval: statusDistribution.tl_verified || 0,
      rejection_rate: totalWorksheets > 0 ? ((rejected / totalWorksheets) * 100).toFixed(2) : 0
    };

    // Daily trend
    const dailyTrend = worksheets.reduce((acc, w) => {
      const date = w.date.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, submitted: 0 };
      }
      if (w.status !== 'draft') {
        acc[date].submitted++;
      }
      return acc;
    }, {});

    res.json({
      summary,
      status_distribution: statusDistribution,
      daily_trend: Object.values(dailyTrend)
    });
  } catch (error) {
    next(error);
  }
};

exports.getTeamPerformance = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const teams = await Team.find({ is_active: true })
      .populate('team_lead_id', 'full_name');

    const data = await Promise.all(teams.map(async (team) => {
      const tasks = await Task.find({
        assigned_to: { $in: team.members },
        ...(start_date && { created_at: { $gte: new Date(start_date) } })
      });

      const worksheets = await Worksheet.find({
        employee_id: { $in: team.members },
        ...(start_date && { date: { $gte: new Date(start_date) } })
      });

      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const approvedWorksheets = worksheets.filter(w => w.status === 'manager_approved').length;

      const attendance = await Attendance.find({
        employee_id: { $in: team.members },
        ...(start_date && { date: { $gte: new Date(start_date) } })
      });

      const totalHours = attendance.reduce((sum, a) => sum + (parseFloat(a.total_work_hours) || 0), 0);

      return {
        team_id: team._id,
        team_name: team.name,
        team_lead: team.team_lead_id?.full_name,
        member_count: team.members.length,
        tasks_completed: completedTasks,
        total_tasks: tasks.length,
        task_completion_rate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
        worksheets_submitted: worksheets.length,
        worksheets_approved: approvedWorksheets,
        worksheet_approval_rate: worksheets.length > 0 ? Math.round((approvedWorksheets / worksheets.length) * 100) : 0,
        total_work_hours: totalHours.toFixed(2)
      };
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};
