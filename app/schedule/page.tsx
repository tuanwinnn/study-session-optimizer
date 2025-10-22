'use client';

/**
 * StudySync — Schedule Page
 * -------------------------
 * Displays an AI-generated weekly/day calendar (react-big-calendar) and
 * supporting insights. Comments aim to clarify the flow and key design
 * choices without being noisy.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { enUS } from 'date-fns/locale/en-US';

// Locales passed to the date-fns localizer for react-big-calendar
const locales = {
  'en-US': enUS,
};

// Bridge react-big-calendar to date-fns utilities
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Shape returned by your /api/schedule endpoint for each block
interface ScheduleBlock {
  taskId: string;
  taskTitle: string;
  subject: string;
  date: string; // ISO date (YYYY-MM-DD)
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  duration: number; // hours
  priority: string; // 'high' | 'medium' | 'low'
  reasoning: string; // brief explanation from AI
}

// Calendar event type consumed by react-big-calendar
interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  resource: ScheduleBlock; // keep original block for modal/details
}

export default function SchedulePage() {
  // Auth context: user + token, plus helpers
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();

  // UI + data state
  const [generating, setGenerating] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleBlock | null>(null);

  // Redirect unauthenticated users once auth has finished loading
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Call backend to build an AI schedule based on preferences
  const handleGenerateSchedule = async () => {
    setGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Bearer token for protected endpoint
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferences: {
            // Example static prefs; in production, consider making these user-configurable
            studyHoursPerDay: 4,
            preferredTimes: ['morning', 'evening'],
            breakDuration: 5,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Surface API-provided error message when available
        throw new Error(data.error || 'Failed to generate schedule');
      }

      // Populate UI with results
      setSchedule(data.schedule);
      setInsights(data.insights);
      setTotalHours(data.totalStudyHours);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
      // Helpful for debugging; safe to keep in dev
      console.error('Error generating schedule:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Simple logout + redirect
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // While we don't yet know auth status, show a placeholder spinner page
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50  flex items-center justify-center">
        <div className="text-xl text-gray-600 ">Loading...</div>
      </div>
    );
  }

  // If we got here unauthed (e.g., brief flash), render nothing (useEffect will redirect)
  if (!user) return null;

  // Transform backend schedule blocks into react-big-calendar events
  const events: CalendarEvent[] = schedule.map((block) => {
    const [hours, minutes] = block.startTime.split(':');
    const [endHours, endMinutes] = block.endTime.split(':');

    // Build concrete Date objects for the given day with the supplied time
    const startDate = new Date(block.date);
    startDate.setHours(parseInt(hours), parseInt(minutes), 0);

    const endDate = new Date(block.date);
    endDate.setHours(parseInt(endHours), parseInt(endMinutes), 0);

    return {
      title: `${block.subject}: ${block.taskTitle}`,
      start: startDate,
      end: endDate,
      resource: block,
    };
  });

// Color-code events by priority with better readability
const eventStyleGetter = (event: CalendarEvent) => {
  const colors: { [key: string]: { bg: string; text: string } } = {
    high: { bg: '#dc2626', text: '#ffffff' },      // Red with white text
    medium: { bg: '#f59e0b', text: '#ffffff' },    // Orange with white text
    low: { bg: '#10b981', text: '#ffffff' },       // Green with white text
  };

  const color = colors[event.resource.priority] || { bg: '#8b5cf6', text: '#ffffff' };

  return {
    style: {
      backgroundColor: color.bg,
      color: color.text,
      borderRadius: '6px',
      opacity: 1,
      border: 'none',
      display: 'block',
      fontSize: '14px',
      fontWeight: '700',
      padding: '6px 8px',
      lineHeight: '1.4',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    },
  };
};

  return (
    <div className="min-h-screen bg-gray-50 ">
      {/* Header / Nav */}
      <header className="bg-white  shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-purple-600">📚 StudySync</h1>
            <nav className="flex gap-6">
              <Link href="/dashboard" className="text-gray-600  hover:text-purple-600">
                Dashboard
              </Link>
              <Link href="/tasks" className="text-gray-600  hover:text-purple-600">
                Tasks
              </Link>
              <Link href="/schedule" className="text-purple-600 font-semibold">
                Schedule
              </Link>
              <Link href="/analytics" className="text-gray-600 hover:text-purple-600">
                Analytics
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">👋 {user.name}</span>
            <button onClick={handleLogout} className="px-4 py-2 text-sm text-gray-600  hover:text-gray-800 ">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page intro */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-800  mb-2">AI Study Schedule</h2>
          <p className="text-gray-600 ">Generate an optimized study schedule based on your tasks and deadlines</p>
        </div>

        {/* Generate button */}
        <div className="mb-6">
          <button
            onClick={handleGenerateSchedule}
            disabled={generating}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                {/* Simple inline spinner icon */}
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating AI Schedule...
              </span>
            ) : (
              <span>🤖 Generate AI Schedule</span>
            )}
          </button>
        </div>

        {/* Error banner with actionable link when no tasks exist */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
            <strong>Error:</strong> {error}
            {error.includes('No pending tasks') && (
              <div className="mt-2">
                <Link href="/tasks" className="text-red-800 underline font-semibold">
                  Go create some tasks first →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* AI insights summary */}
        {insights.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
              <span>💡</span> AI Insights
            </h3>
            <ul className="space-y-2">
              {insights.map((insight, index) => (
                <li key={index} className="text-blue-800 flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <span className="text-blue-900 font-semibold">
                Total Study Hours This Week: {totalHours.toFixed(1)} hours
              </span>
            </div>
          </div>
        )}

        {/* Calendar display */}
        {schedule.length > 0 ? (
          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 ">Your Optimized Schedule</h3>
              {/* Simple legend for priority colors */}
              <div className="flex gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500"></div>
                  <span>High Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500"></div>
                  <span>Medium Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span>Low Priority</span>
                </div>
              </div>
            </div>

            {/*
              react-big-calendar notes:
              - views: limit to week/day for focus
              - min/max: only the time-of-day is used; date portion is ignored by RBC
                (we pass a Date but it acts as a time template). Adjust as desired.
            */}
            <div style={{ height: '600px' }}>
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                eventPropGetter={eventStyleGetter}
                onSelectEvent={(event) => setSelectedEvent(event.resource)}
                views={['week', 'day']}
                defaultView="week"
                step={30}
                showMultiDayTimes
                min={new Date(2024, 1, 1, 7, 0, 0)}
                max={new Date(2024, 1, 1, 23, 0, 0)}
              />
            </div>
          </div>
        ) : (
          // Empty state encouraging the user to generate a schedule
          <div className="bg-white  rounded-xl shadow-sm p-12 text-center border border-gray-100">
            <div className="text-6xl mb-4">📅</div>
            <h3 className="text-xl font-semibold text-gray-800  mb-2">No Schedule Yet</h3>
            <p className="text-gray-600  mb-6">Click the button above to generate your AI-optimized study schedule!</p>
            <div className="text-sm text-gray-500">
              Make sure you have some pending tasks in your{' '}
              <Link href="/tasks" className="text-purple-600 hover:underline font-semibold">
                Tasks page
              </Link>
            </div>
          </div>
        )}

        {/* Event details modal (click an event to open) */}
        {selectedEvent && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="bg-white  rounded-2xl shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()} // prevent backdrop click from closing while interacting
            >
              <h3 className="text-2xl font-bold text-gray-800  mb-4">{selectedEvent.taskTitle}</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-semibold">Subject:</span>
                  <span>{selectedEvent.subject}</span>
                </div>

                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-semibold">Time:</span>
                  <span>{selectedEvent.startTime} - {selectedEvent.endTime}</span>
                </div>

                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-semibold">Duration:</span>
                  <span>{selectedEvent.duration} hours</span>
                </div>

                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-semibold">Priority:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedEvent.priority === 'high' ? 'bg-red-100 text-red-700' :
                      selectedEvent.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}
                  >
                    {selectedEvent.priority.toUpperCase()}
                  </span>
                </div>

                <div className="pt-3 border-t">
                  <span className="font-semibold text-gray-700 block mb-2">AI Reasoning:</span>
                  <p className="text-gray-600  italic">{selectedEvent.reasoning}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                className="mt-6 w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
