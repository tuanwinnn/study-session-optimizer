import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

/**
 * Extract the authenticated user's ID from a Bearer token in the Authorization header.
 * Returns null if the header is missing/invalid or token verification fails.
 */
async function getUserIdFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  return decoded?.userId || null;
}

/**
 * GET /api/sessions — Fetch all study sessions for the authenticated user.
 * - Requires a valid Bearer token.
 * - Includes the related Task record.
 * - Sorts by most recently created.
 */
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await prisma.studySession.findMany({
      where: { userId },
      include: { task: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

/**
 * POST /api/sessions — Start a new study session for a task.
 * Body: { taskId: string }
 * - Ensures the user has no active session (endTime === null).
 * - Creates a session with startTime = now.
 */
export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await request.json();

    // Check if there's an active session (no endTime set) for this user.
    const activeSession = await prisma.studySession.findFirst({
      where: { userId, endTime: null },
    });

    if (activeSession) {
      return NextResponse.json(
        { error: 'You already have an active session' },
        { status: 400 }
      );
    }

    const session = await prisma.studySession.create({
      data: {
        userId,
        taskId,
        startTime: new Date(), // Server time; OK for duration math.
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * PUT /api/sessions — Stop/pause/complete an existing session and update aggregates.
 * Body: {
 *   sessionId: string;
 *   pomodorosCompleted?: number;
 *   wasCompleted?: boolean;
 *   notes?: string;
 * }
 * - Sets endTime to now and computes totalMinutes from startTime.
 * - Persists per-session metadata (pomodorosCompleted, wasCompleted, notes).
 * - Increments Task.actualHours by totalMinutes / 60.
 */
export async function PUT(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, pomodorosCompleted, wasCompleted, notes } = await request.json();

    // Ensure the session exists and belongs to the user.
    const session = await prisma.studySession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const endTime = new Date();
    const totalMinutes = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 60000
    );

    const updatedSession = await prisma.studySession.update({
      where: { id: session.id },
      data: {
        endTime,
        pomodorosCompleted,
        totalMinutes,
        wasCompleted,
        ...(notes ? { notes } : {}),
      },
    });

    // Update related Task's actualHours (atomic increment, aggregate of work).
    await prisma.task.update({
      where: { id: session.taskId },
      data: { actualHours: { increment: totalMinutes / 60 } },
    });

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error('Error updating session:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}
