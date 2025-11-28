const Worksheet = require('../models/Worksheet');
const User = require('../models/User');

exports.getWorksheets = async (req, res, next) => {
  try {
    const { status, employee_id, start_date, end_date, skip = 0, limit = 100 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (employee_id) query.employee_id = employee_id;
    if (start_date || end_date) {
      query.date = {};
      if (start_date) query.date.$gte = new Date(start_date);
      if (end_date) query.date.$lte = new Date(end_date);
    }

    const worksheets = await Worksheet.find(query)
      .populate('employee_id', 'full_name email employee_id')
      .populate('form_id', 'name')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const results = worksheets.map(w => {
      const json = w.toJSON();
      json.employee_name = w.employee_id?.full_name;
      json.form_name = w.form_id?.name;
      return json;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
};

exports.createWorksheet = async (req, res, next) => {
  try {
    const { date, form_id, form_responses, tasks_completed, notes } = req.body;

    // Calculate total hours from form responses
    let total_hours = 0;
    if (form_responses) {
      const hoursField = form_responses.find(r =>
        r.field_label.toLowerCase().includes('hour') ||
        r.field_label.toLowerCase().includes('time')
      );
      if (hoursField) {
        total_hours = parseFloat(hoursField.value) || 0;
      }
    }

    const worksheet = new Worksheet({
      employee_id: req.userId,
      date,
      form_id,
      form_responses,
      tasks_completed,
      notes,
      total_hours,
      status: 'draft'
    });

    await worksheet.save();

    res.status(201).json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getWorksheet = async (req, res, next) => {
  try {
    const worksheet = await Worksheet.findById(req.params.id)
      .populate('employee_id', 'full_name email')
      .populate('form_id', 'name')
      .populate('tasks_completed', 'title');

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateWorksheet = async (req, res, next) => {
  try {
    const { form_responses, tasks_completed, notes } = req.body;

    const worksheet = await Worksheet.findById(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== 'draft') {
      return res.status(400).json({ detail: 'Can only update draft worksheets' });
    }

    if (form_responses) worksheet.form_responses = form_responses;
    if (tasks_completed) worksheet.tasks_completed = tasks_completed;
    if (notes !== undefined) worksheet.notes = notes;

    await worksheet.save();

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.deleteWorksheet = async (req, res, next) => {
  try {
    const worksheet = await Worksheet.findByIdAndDelete(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    res.json({ message: 'Worksheet deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.submitWorksheet = async (req, res, next) => {
  try {
    const worksheet = await Worksheet.findById(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== 'draft') {
      return res.status(400).json({ detail: 'Worksheet already submitted' });
    }

    worksheet.status = 'submitted';
    await worksheet.save();

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.verifyWorksheet = async (req, res, next) => {
  try {
    const worksheet = await Worksheet.findById(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== 'submitted') {
      return res.status(400).json({ detail: 'Can only verify submitted worksheets' });
    }

    worksheet.status = 'tl_verified';
    worksheet.tl_verified_by = req.userId;
    worksheet.tl_verified_at = new Date();
    await worksheet.save();

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.approveWorksheet = async (req, res, next) => {
  try {
    const worksheet = await Worksheet.findById(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    if (worksheet.status !== 'tl_verified') {
      return res.status(400).json({ detail: 'Can only approve verified worksheets' });
    }

    worksheet.status = 'manager_approved';
    worksheet.manager_approved_by = req.userId;
    worksheet.manager_approved_at = new Date();
    await worksheet.save();

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.rejectWorksheet = async (req, res, next) => {
  try {
    const { rejection_reason } = req.body;

    const worksheet = await Worksheet.findById(req.params.id);

    if (!worksheet) {
      return res.status(404).json({ detail: 'Worksheet not found' });
    }

    worksheet.status = 'rejected';
    worksheet.rejection_reason = rejection_reason;
    await worksheet.save();

    res.json(worksheet.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.bulkApprove = async (req, res, next) => {
  try {
    const { worksheet_ids } = req.body;

    await Worksheet.updateMany(
      { _id: { $in: worksheet_ids }, status: 'tl_verified' },
      {
        status: 'manager_approved',
        manager_approved_by: req.userId,
        manager_approved_at: new Date()
      }
    );

    res.json({ message: `${worksheet_ids.length} worksheets approved` });
  } catch (error) {
    next(error);
  }
};

exports.getMyWorksheets = async (req, res, next) => {
  try {
    const { status, skip = 0, limit = 100 } = req.query;

    const query = { employee_id: req.userId };
    if (status) query.status = status;

    const worksheets = await Worksheet.find(query)
      .populate('form_id', 'name')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const results = worksheets.map(w => {
      const json = w.toJSON();
      json.form_name = w.form_id?.name;
      return json;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
};

exports.getPendingVerification = async (req, res, next) => {
  try {
    // Get team members for the team lead
    const user = await User.findById(req.userId);
    const Team = require('../models/Team');
    const team = await Team.findOne({ team_lead_id: req.userId });

    if (!team) {
      return res.json([]);
    }

    const worksheets = await Worksheet.find({
      employee_id: { $in: team.members },
      status: 'submitted'
    })
      .populate('employee_id', 'full_name email')
      .populate('form_id', 'name')
      .sort({ date: -1 });

    const results = worksheets.map(w => {
      const json = w.toJSON();
      json.employee_name = w.employee_id?.full_name;
      json.form_name = w.form_id?.name;
      return json;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
};

exports.getPendingApproval = async (req, res, next) => {
  try {
    const worksheets = await Worksheet.find({ status: 'tl_verified' })
      .populate('employee_id', 'full_name email')
      .populate('form_id', 'name')
      .populate('tl_verified_by', 'full_name')
      .sort({ date: -1 });

    const results = worksheets.map(w => {
      const json = w.toJSON();
      json.employee_name = w.employee_id?.full_name;
      json.form_name = w.form_id?.name;
      json.tl_verified_by = w.tl_verified_by?.full_name;
      return json;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
};
