const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, requireRole('admin', 'manager'), teamController.getTeams);
router.post('/', auth, requireRole('admin', 'manager'), teamController.createTeam);
router.get('/my-team', auth, requireRole('team_lead'), teamController.getMyTeam);
router.get('/:id', auth, requireRole('admin', 'manager'), teamController.getTeam);
router.put('/:id', auth, requireRole('admin', 'manager'), teamController.updateTeam);
router.delete('/:id', auth, requireRole('admin', 'manager'), teamController.deleteTeam);
router.post('/:id/members', auth, requireRole('admin', 'manager'), teamController.addMember);
router.delete('/:teamId/members/:employeeId', auth, requireRole('admin', 'manager'), teamController.removeMember);

module.exports = router;
