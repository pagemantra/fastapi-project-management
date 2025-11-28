const Task = require('../models/Task');

exports.getTasks = async (req, res, next) => {
  try {
    const { status, priority, assigned_to, skip = 0, limit = 100 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assigned_to) query.assigned_to = assigned_to;

    const tasks = await Task.find(query)
      .populate('assigned_to', 'full_name email')
      .populate('assigned_by', 'full_name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ created_at: -1 });

    res.json(tasks.map(t => t.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const { title, description, assigned_to, status, priority, due_date, estimated_hours } = req.body;

    const task = new Task({
      title,
      description,
      assigned_to,
      assigned_by: req.userId,
      status: status || 'pending',
      priority: priority || 'medium',
      due_date,
      estimated_hours
    });

    await task.save();

    res.status(201).json(task.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assigned_to', 'full_name email')
      .populate('assigned_by', 'full_name email');

    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    res.json(task.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const { title, description, status, priority, due_date, estimated_hours, actual_hours } = req.body;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (status) task.status = status;
    if (priority) task.priority = priority;
    if (due_date !== undefined) task.due_date = due_date;
    if (estimated_hours !== undefined) task.estimated_hours = estimated_hours;
    if (actual_hours !== undefined) task.actual_hours = actual_hours;

    await task.save();

    res.json(task.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ detail: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getMyTasks = async (req, res, next) => {
  try {
    const { status, skip = 0, limit = 100 } = req.query;

    const query = { assigned_to: req.userId };
    if (status) query.status = status;

    const tasks = await Task.find(query)
      .populate('assigned_by', 'full_name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ priority: -1, due_date: 1 });

    res.json(tasks.map(t => t.toJSON()));
  } catch (error) {
    next(error);
  }
};
