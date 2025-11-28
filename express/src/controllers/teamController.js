const Team = require('../models/Team');
const User = require('../models/User');

exports.getTeams = async (req, res, next) => {
  try {
    const { is_active, skip = 0, limit = 100 } = req.query;

    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const teams = await Team.find(query)
      .populate('team_lead_id', 'full_name email')
      .populate('manager_id', 'full_name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ created_at: -1 });

    res.json(teams.map(t => t.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name, description, team_lead_id, manager_id } = req.body;

    const team = new Team({
      name,
      description,
      team_lead_id,
      manager_id: manager_id || req.userId,
      members: []
    });

    await team.save();

    res.status(201).json(team.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getTeam = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('team_lead_id', 'full_name email')
      .populate('manager_id', 'full_name email')
      .populate('members', 'full_name email employee_id');

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    res.json(team.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { name, description, team_lead_id, is_active } = req.body;

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    if (team_lead_id) team.team_lead_id = team_lead_id;
    if (is_active !== undefined) team.is_active = is_active;

    await team.save();

    res.json(team.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    team.is_active = false;
    await team.save();

    res.json({ message: 'Team deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

exports.addMember = async (req, res, next) => {
  try {
    const { employee_id } = req.body;

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    if (team.members.includes(employee_id)) {
      return res.status(400).json({ detail: 'Employee already in team' });
    }

    team.members.push(employee_id);
    await team.save();

    res.json(team.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    team.members = team.members.filter(m => m.toString() !== req.params.employeeId);
    await team.save();

    res.json(team.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.getMyTeam = async (req, res, next) => {
  try {
    const team = await Team.findOne({ team_lead_id: req.userId })
      .populate('members', 'full_name email employee_id');

    if (!team) {
      return res.status(404).json({ detail: 'Team not found' });
    }

    res.json(team.toJSON());
  } catch (error) {
    next(error);
  }
};
