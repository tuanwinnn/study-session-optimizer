import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StudySession from '@/models/StudySession';
import Task from '@/models/Task';
import { verifyToken } from '@/lib/auth';

/**
 * Extract the authenticated user's ID from a Bearer token in the Authorization header.
 * Returns null if the header is missing/invalid or token verification fails.
 *
 * NOTE: Consider wrapping verifyToken in try/catch to handle malformed/expired JWTs gracefully.
 */
async function getUserIdFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token); // TODO: handle thrown errors in verifyToken
  return decoded?.userId || null;
}

/**
 * GET /api/...  — Fetch all study sessions for the authenticated user.
 * - Requires a valid Bearer token.
 * - Populates the related Task document.
 * - Sorts by most recently created. Requires timestamps on the schema.
 */
export async function GET(request: Request) {
  try {
    await connectDB(); // Safe to call per-request; your helper should reuse existing connection.

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await StudySession.find({ userId })
      .populate('taskId')
      .sort({ createdAt: -1 });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

/**
 * POST /api/...  — Start a new study session for a task.
 * Body: { taskId: string }
 * - Ensures the user has no active session (endTime === null).
 * - Creates a session with startTime = now.
 */
export async function POST(request: Request) {
  try {
    await connectDB();

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await request.json(); 

    // Check if there's an active session (no endTime set) for this user.
    const activeSession = await StudySession.findOne({
      userId,
      endTime: null,
    });

    if (activeSession) {
      return NextResponse.json(
        { error: 'You already have an active session' },
        { status: 400 }
      );
    }

    const session = await StudySession.create({
      userId,
      taskId,
      startTime: new Date(), // Server time; OK for duration math.
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * PUT /api/...  — Stop/pause/complete an existing session and update aggregates.
 * Body: {
 *   sessionId: string;
 *   pomodorosCompleted?: number;
 *   wasCompleted?: boolean;
 *   notes?: string;
 * }
 * - Sets endTime to now and computes totalMinutes from startTime.
 * - Persists per-session metadata (pomodorosCompleted, wasCompleted, notes).
 * - Increments Task.actualHours by totalMinutes / 60.
 *
 */
export async function PUT(request: Request) {
  try {
    await connectDB();

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, pomodorosCompleted, wasCompleted, notes } = await request.json();

    // Ensure the session exists and belongs to the user.
    const session = await StudySession.findOne({ _id: sessionId, userId });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const endTime = new Date();
    const totalMinutes = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 60000
    );

    // Update session fields.
    session.endTime = endTime;
    session.pomodorosCompleted = pomodorosCompleted;
    session.totalMinutes = totalMinutes;
    session.wasCompleted = wasCompleted;
    if (notes) session.notes = notes;

    await session.save();

    // Update related Task's actualHours (aggregate of work).
    const task = await Task.findById(session.taskId);
    if (task) {
      task.actualHours = (task.actualHours || 0) + totalMinutes / 60;
      await task.save();
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Error updating session:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}
