import mongoose from 'mongoose';

const StudySessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    default: null, // null means session is still active
  },
  pomodorosCompleted: {
    type: Number,
    default: 0,
  },
  totalMinutes: {
    type: Number,
    default: 0,
  },
  wasCompleted: {
    type: Boolean,
    default: false,
  },
  notes: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.StudySession || mongoose.model('StudySession', StudySessionSchema);