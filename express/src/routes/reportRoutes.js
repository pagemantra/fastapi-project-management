const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/productivity', auth, requireRole('admin', 'manager'), reportController.getProductivityReport);
router.get('/attendance', auth, requireRole('admin', 'manager'), reportController.getAttendanceReport);
router.get('/overtime', auth, requireRole('admin', 'manager'), reportController.getOvertimeReport);
router.get('/worksheet-analytics', auth, requireRole('admin', 'manager'), reportController.getWorksheetAnalytics);
router.get('/team-performance', auth, requireRole('admin', 'manager'), reportController.getTeamPerformance);

module.exports = router;
