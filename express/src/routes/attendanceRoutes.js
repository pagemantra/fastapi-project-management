const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { auth, requireRole } = require('../middleware/auth');

router.post('/login', auth, attendanceController.login);
router.post('/logout', auth, attendanceController.logout);
router.post('/break/start', auth, attendanceController.startBreak);
router.post('/break/end', auth, attendanceController.endBreak);
router.get('/current', auth, attendanceController.getCurrentAttendance);
router.get('/history', auth, attendanceController.getHistory);
router.get('/break-settings/:teamId', auth, requireRole('admin', 'manager'), attendanceController.getBreakSettings);
router.post('/break-settings', auth, requireRole('admin', 'manager'), attendanceController.createBreakSettings);
router.put('/break-settings/:teamId', auth, requireRole('admin', 'manager'), attendanceController.updateBreakSettings);

module.exports = router;
