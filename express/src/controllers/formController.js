const Form = require('../models/Form');

exports.getForms = async (req, res, next) => {
  try {
    const { is_active, skip = 0, limit = 100 } = req.query;

    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const forms = await Form.find(query)
      .populate('created_by', 'full_name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ created_at: -1 });

    res.json(forms.map(f => f.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.createForm = async (req, res, next) => {
  try {
    const { name, description, fields, assigned_teams } = req.body;

    const form = new Form({
      name,
      description,
      fields,
      assigned_teams,
      created_by: req.userId
    });

    await form.save();

    res.status(201).json(form.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getForm = async (req, res, next) => {
  try {
    const form = await Form.findById(req.params.id);

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    res.json(form.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateForm = async (req, res, next) => {
  try {
    const { name, description, fields, assigned_teams, is_active } = req.body;

    const form = await Form.findById(req.params.id);

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    if (name) form.name = name;
    if (description !== undefined) form.description = description;
    if (fields) form.fields = fields;
    if (assigned_teams) form.assigned_teams = assigned_teams;
    if (is_active !== undefined) form.is_active = is_active;

    await form.save();

    res.json(form.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.deleteForm = async (req, res, next) => {
  try {
    const form = await Form.findById(req.params.id);

    if (!form) {
      return res.status(404).json({ detail: 'Form not found' });
    }

    form.is_active = false;
    await form.save();

    res.json({ message: 'Form deactivated successfully' });
  } catch (error) {
    next(error);
  }
};
