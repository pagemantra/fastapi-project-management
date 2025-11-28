const mongoose = require('mongoose');

const worksheetSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  form_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  form_responses: [{
    field_id: String,
    field_label: String,
    value: mongoose.Schema.Types.Mixed
  }],
  tasks_completed: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  total_hours: {
    type: Number,
    default: 0
  },
  notes: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'tl_verified', 'manager_approved', 'rejected'],
    default: 'draft'
  },
  tl_verified_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tl_verified_at: Date,
  manager_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  manager_approved_at: Date,
  rejection_reason: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

worksheetSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Worksheet', worksheetSchema);
