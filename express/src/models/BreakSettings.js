const mongoose = require('mongoose');

const breakSettingsSchema = new mongoose.Schema({
  team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    unique: true
  },
  enforce_limits: {
    type: Boolean,
    default: false
  },
  max_breaks_per_day: Number,
  max_break_duration_minutes: Number,
  lunch_break_duration: {
    type: Number,
    default: 60
  },
  short_break_duration: {
    type: Number,
    default: 15
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

breakSettingsSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('BreakSettings', breakSettingsSchema);
