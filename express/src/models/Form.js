const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  fields: [{
    field_id: String,
    field_type: String,
    label: String,
    placeholder: String,
    required: Boolean,
    options: [String],
    validation: mongoose.Schema.Types.Mixed,
    order: Number
  }],
  assigned_teams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  is_active: {
    type: Boolean,
    default: true
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

formSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Form', formSchema);
