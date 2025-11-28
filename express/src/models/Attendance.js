const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  login_time: Date,
  logout_time: Date,
  breaks: [{
    break_type: String,
    start_time: Date,
    end_time: Date,
    duration_minutes: Number
  }],
  total_work_hours: {
    type: Number,
    default: 0
  },
  total_break_minutes: {
    type: Number,
    default: 0
  },
  overtime_hours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'on_break', 'completed', 'incomplete'],
    default: 'active'
  },
  worksheet_submitted: {
    type: Boolean,
    default: false
  },
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

attendanceSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
