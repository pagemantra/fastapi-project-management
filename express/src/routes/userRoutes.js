const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, requireRole('admin', 'manager'), userController.getUsers);
router.post('/', auth, requireRole('admin', 'manager'), userController.createUser);
router.get('/managers', auth, requireRole('admin'), userController.getManagers);
router.get('/team-leads', auth, requireRole('admin', 'manager'), userController.getTeamLeads);
router.get('/employees', auth, requireRole('admin', 'manager'), userController.getEmployees);
router.get('/:id', auth, userController.getUser);
router.put('/:id', auth, requireRole('admin', 'manager'), userController.updateUser);
router.delete('/:id', auth, requireRole('admin', 'manager'), userController.deleteUser);

module.exports = router;
