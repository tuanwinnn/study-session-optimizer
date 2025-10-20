import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  preferences: {
    studyHoursPerDay: {
      type: Number,
      default: 4,
    },
    preferredTimes: {
      type: [String],
      default: ['morning', 'evening'],
    },
    breakDuration: {
      type: Number,
      default: 5,
    },
    pomodoroLength: {
      type: Number,
      default: 25,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);