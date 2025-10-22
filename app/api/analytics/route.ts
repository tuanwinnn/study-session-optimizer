/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StudySession from '@/models/StudySession';
import Task from '@/models/Task';
import { verifyToken } from '@/lib/auth';

async function getUserIdFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = verifyToken(token);
    return decoded?.userId || null;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    await connectDB();

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all completed sessions
    const sessions = await StudySession.find({
      userId,
      endTime: { $ne: null },
    }).populate('taskId');

    // Get all tasks for this user
    const tasks = await Task.find({ userId });

    // Filter sessions from last 7 days for weekly stats
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentSessions = sessions.filter(s => new Date(s.startTime) >= sevenDaysAgo);

    // Calculate total stats
    const totalPomodoros = sessions.reduce((sum, s) => sum + s.pomodorosCompleted, 0);
    const weeklyPomodoros = recentSessions.reduce((sum, s) => sum + s.pomodorosCompleted, 0);
    const totalMinutesStudied = sessions.reduce((sum, s) => sum + s.totalMinutes, 0);
    const totalHoursStudied = totalMinutesStudied / 60;

    // Calculate estimated vs actual by task
    const taskAccuracy = tasks.map(task => {
      const estimated = task.estimatedHours ?? 0;
      const actual = task.actualHours ?? 0;
      const difference = actual - estimated;
      const accuracyPercent = estimated > 0 
        ? ((estimated - Math.abs(difference)) / estimated) * 100 
        : 0;

      return {
        taskId: task._id,
        title: task.title,
        subject: task.subject,
        estimated,
        actual,
        difference,
        accuracyPercent: Math.max(0, accuracyPercent),
      };
    });

    // Overall accuracy
    const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
    const totalActual = tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);
    const overallAccuracy = totalEstimated > 0 
      ? ((totalEstimated - Math.abs(totalActual - totalEstimated)) / totalEstimated) * 100 
      : 0;

    // Study time by subject
    const subjectData: { [key: string]: number } = {};
    sessions.forEach(session => {
      if (session.taskId && typeof session.taskId === 'object' && 'subject' in session.taskId) {
        const subject = (session.taskId as any).subject;
        subjectData[subject] = (subjectData[subject] || 0) + session.totalMinutes / 60;
      }
    });

    // Study time by hour of day
    const hourlyData: { [key: number]: number } = {};
    sessions.forEach(session => {
      const hour = new Date(session.startTime).getHours();
      hourlyData[hour] = (hourlyData[hour] || 0) + session.totalMinutes / 60;
    });

    // Find most productive hour
    let mostProductiveHour = 0;
    let maxHours = 0;
    Object.entries(hourlyData).forEach(([hour, hours]) => {
      if (hours > maxHours) {
        maxHours = hours;
        mostProductiveHour = parseInt(hour);
      }
    });

    // Study sessions by day (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const dailyStudyTime: { [key: string]: number } = {};
    last7Days.forEach(day => {
      dailyStudyTime[day] = 0;
    });

    sessions.forEach(session => {
      const day = new Date(session.startTime).toISOString().split('T')[0];
      if (Object.prototype.hasOwnProperty.call(dailyStudyTime, day)) {
        dailyStudyTime[day] += session.totalMinutes / 60;
      }
    });

    // Calculate streak (consecutive days with at least 1 session)
    let currentStreak = 0;
    let tempStreak = 0;
    const today = new Date().toISOString().split('T')[0];
    
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toISOString().split('T')[0];
      
      const hasSessions = sessions.some(s => 
        new Date(s.startTime).toISOString().split('T')[0] === dayStr
      );

      if (hasSessions) {
        tempStreak++;
      } else {
        if (dayStr === today) {
          // Today doesn't have sessions yet, don't break streak
          continue;
        }
        break;
      }
    }
    currentStreak = tempStreak;

    // AI Insights
    const insights = [];

    // Use weekly count for "this week" stat
    if (weeklyPomodoros > 0) {
      insights.push(`You've completed ${weeklyPomodoros} Pomodoros this week! 🎉`);
    }

    if (overallAccuracy < 50) {
      insights.push('⚠️ Your time estimates are often off. Try adding 30% buffer time to your estimates.');
    } else if (overallAccuracy > 80) {
      insights.push('🎯 Great job! Your time estimates are very accurate.');
    }

    if (mostProductiveHour || mostProductiveHour === 0) {
      const meridiem = mostProductiveHour >= 12 ? 'PM' : 'AM';
      const hour12 = ((mostProductiveHour + 11) % 12) + 1;
      const hourFormatted = `${hour12} ${meridiem}`;
      insights.push(`📊 Your peak productivity is around ${hourFormatted}. Schedule important tasks then!`);
    }

    if (currentStreak > 0) {
      insights.push(`🔥 You're on a ${currentStreak}-day study streak!`);
    }

    // Find subjects where actual > estimated consistently
    const underestimatedSubjects = Object.entries(
      tasks.reduce((acc: { [key: string]: { estimated: number; actual: number; count: number } }, task) => {
        const subj = task.subject ?? 'Unknown';
        if (!acc[subj]) {
          acc[subj] = { estimated: 0, actual: 0, count: 0 };
        }
        acc[subj].estimated += task.estimatedHours ?? 0;
        acc[subj].actual += task.actualHours ?? 0;
        acc[subj].count++;
        return acc;
      }, {})
    ).filter(([_, data]) => data.actual > data.estimated * 1.2 && data.count >= 2);

    if (underestimatedSubjects.length > 0) {
      const subjectNames = underestimatedSubjects.map(([name]) => name).join(', ');
      insights.push(`💡 You consistently underestimate ${subjectNames} tasks. Consider adding more time.`);
    }

    return NextResponse.json({
      summary: {
        totalPomodoros,
        totalHoursStudied: parseFloat(totalHoursStudied.toFixed(1)),
        overallAccuracy: parseFloat(overallAccuracy.toFixed(1)),
        currentStreak,
        sessionsCount: sessions.length,
      },
      taskAccuracy,
      subjectData,
      hourlyData,
      dailyStudyTime,
      mostProductiveHour,
      insights,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}