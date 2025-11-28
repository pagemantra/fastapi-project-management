const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, taskController.getTasks);
router.post('/', auth, requireRole('admin', 'manager', 'team_lead'), taskController.createTask);
router.get('/my-tasks', auth, requireRole('employee'), taskController.getMyTasks);
router.get('/:id', auth, taskController.getTask);
router.put('/:id', auth, taskController.updateTask);
router.delete('/:id', auth, requireRole('admin', 'manager', 'team_lead'), taskController.deleteTask);

module.exports = router;
