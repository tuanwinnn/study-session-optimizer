/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import connectDB from '@/lib/mongodb';
import Task from '@/models/Task';
import { verifyToken } from '@/lib/auth';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Helper function to get userId from request
async function getUserIdFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  return decoded?.userId || null;
}

interface UserPreferences {
  studyHoursPerDay: number;
  preferredTimes: string[];
  breakDuration: number;
}

interface TaskDocument {
  _id: string;
  title: string;
  subject: string;
  priority: string;
  deadline: Date;
  estimatedHours: number;
  actualHours: number;
  status: string;
}

export async function POST(request: Request) {
  try {
    await connectDB();

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's pending tasks
    const tasks = await Task.find({ 
      userId, 
      status: { $in: ['pending', 'in-progress'] } 
    }).sort({ deadline: 1 });

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: 'No pending tasks to schedule' },
        { status: 400 }
      );
    }

    // Get availability from request body (optional for now)
    const body = await request.json();
    const preferences: UserPreferences = body.preferences || {
      studyHoursPerDay: 4,
      preferredTimes: ['morning', 'evening'],
      breakDuration: 5,
    };

    // Build the AI prompt
    const prompt = buildSchedulePrompt(tasks, preferences);

    // Call OpenAI
    console.log('Calling OpenAI API...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheaper and faster than GPT-4
      messages: [
        {
          role: 'system',
          content: 'You are an expert study scheduler that helps students optimize their study time. You understand spaced repetition, priority management, and effective time blocking.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0].message.content;
    console.log('OpenAI Response:', responseText);

    // Parse AI response
    const schedule = JSON.parse(responseText || '{}');

    // FILTER OUT PAST DATES - AI sometimes ignores instructions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const filteredSchedule = (schedule.schedule || []).filter((block: any) => {
      const blockDate = new Date(block.date);
      blockDate.setHours(0, 0, 0, 0);
      return blockDate >= today; // Only keep today and future dates
    });

    console.log('Original schedule items:', schedule.schedule?.length || 0);
    console.log('Filtered schedule items:', filteredSchedule.length);

    return NextResponse.json({
      message: 'Schedule generated successfully',
      schedule: filteredSchedule,
      insights: schedule.insights || [],
      totalStudyHours: schedule.totalStudyHours || 0,
    });

  } catch (error) {
    console.error('Error generating schedule:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate schedule', details: errorMessage },
      { status: 500 }
    );
  }
}

// Build the prompt for OpenAI
function buildSchedulePrompt(tasks: TaskDocument[], preferences: UserPreferences): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const tasksDescription = tasks.map((task, index) => {
    const daysUntilDeadline = Math.ceil(
      (new Date(task.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return `
Task ${index + 1}:
- Title: ${task.title}
- Subject: ${task.subject}
- Priority: ${task.priority}
- Deadline: ${new Date(task.deadline).toLocaleDateString()} (${daysUntilDeadline} days from now)
- Estimated Hours: ${task.estimatedHours}
- Already Spent: ${task.actualHours} hours
- Remaining: ${task.estimatedHours - task.actualHours} hours
- Status: ${task.status}
`;
  }).join('\n');

  return `
You are helping a college student optimize their study schedule for the next 7 days.

CURRENT DATE: ${today.toLocaleDateString()} (IMPORTANT: Do NOT schedule anything before this date)
SCHEDULE PERIOD: ${today.toLocaleDateString()} to ${nextWeek.toLocaleDateString()}

CRITICAL RULE: Only schedule study sessions from TODAY (${today.toLocaleDateString()}) onwards. Never schedule on past dates.

STUDENT'S TASKS:
${tasksDescription}

STUDENT'S PREFERENCES:
- Maximum study hours per day: ${preferences.studyHoursPerDay} hours
- Preferred study times: ${preferences.preferredTimes.join(', ')}
- Break duration between sessions: ${preferences.breakDuration} minutes

SCHEDULING RULES:
1. **NEVER schedule tasks on dates before ${today.toLocaleDateString()}** - only schedule from today onwards
2. Prioritize tasks with closer deadlines
3. Give more time to high-priority tasks
4. Break large tasks into multiple study sessions (max 2 hours per session)
5. Schedule difficult subjects during preferred times
6. Include breaks between study sessions
7. Don't exceed the maximum daily study hours
8. Use spaced repetition: spread studying for the same subject across multiple days
9. Leave buffer time before deadlines (don't schedule on the deadline day itself)

RESPONSE FORMAT (Must be valid JSON):
{
  "schedule": [
    {
      "taskId": "task_id_here",
      "taskTitle": "Task title",
      "subject": "Subject name",
      "date": "2025-10-21",
      "startTime": "09:00",
      "endTime": "11:00",
      "duration": 2,
      "priority": "high",
      "reasoning": "Why scheduled at this time"
    }
  ],
  "insights": [
    "You have 3 high-priority tasks due this week - focus on these first",
    "Consider starting the Math assignment earlier as you tend to underestimate math tasks"
  ],
  "totalStudyHours": 24.5
}

Generate an optimal study schedule following these rules. Be specific with dates and times.
`;
}