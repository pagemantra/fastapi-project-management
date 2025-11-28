const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');

router.get('/', auth, notificationController.getNotifications);
router.get('/count', auth, notificationController.getCount);
router.put('/:id/read', auth, notificationController.markAsRead);
router.post('/mark-all-read', auth, notificationController.markAllAsRead);
router.delete('/:id', auth, notificationController.deleteNotification);
router.delete('/', auth, notificationController.deleteAll);

module.exports = router;
