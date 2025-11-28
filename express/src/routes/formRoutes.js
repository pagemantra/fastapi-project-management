const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, formController.getForms);
router.post('/', auth, requireRole('admin', 'manager'), formController.createForm);
router.get('/:id', auth, formController.getForm);
router.put('/:id', auth, requireRole('admin', 'manager'), formController.updateForm);
router.delete('/:id', auth, requireRole('admin', 'manager'), formController.deleteForm);

module.exports = router;
