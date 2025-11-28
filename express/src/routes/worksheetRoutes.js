const express = require('express');
const router = express.Router();
const worksheetController = require('../controllers/worksheetController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, requireRole('admin', 'manager'), worksheetController.getWorksheets);
router.post('/', auth, worksheetController.createWorksheet);
router.get('/my-worksheets', auth, requireRole('employee'), worksheetController.getMyWorksheets);
router.get('/pending-verification', auth, requireRole('team_lead'), worksheetController.getPendingVerification);
router.get('/pending-approval', auth, requireRole('admin', 'manager'), worksheetController.getPendingApproval);
router.post('/bulk-approve', auth, requireRole('admin', 'manager'), worksheetController.bulkApprove);
router.get('/:id', auth, worksheetController.getWorksheet);
router.put('/:id', auth, worksheetController.updateWorksheet);
router.delete('/:id', auth, worksheetController.deleteWorksheet);
router.post('/:id/submit', auth, worksheetController.submitWorksheet);
router.post('/:id/verify', auth, requireRole('team_lead'), worksheetController.verifyWorksheet);
router.post('/:id/approve', auth, requireRole('admin', 'manager'), worksheetController.approveWorksheet);
router.post('/:id/reject', auth, requireRole('team_lead', 'admin', 'manager'), worksheetController.rejectWorksheet);

module.exports = router;
