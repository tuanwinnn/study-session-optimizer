'use client';

/**
 * StudySync — Dashboard
 * ---------------------
 * High-level overview page that shows auth'd user's task stats,
 * quick actions, and upcoming deadlines. Comments aim for clarity
 * without clutter.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

// Task model expected from the backend
interface Task {
  _id: string;
  title: string;
  subject: string;
  priority: string; // 'high' | 'medium' | 'low' (by convention)
  deadline: string; // ISO date string
  estimatedHours: number; // planned effort
  actualHours: number; // tracked effort (if available)
  status: string; // 'pending' | 'in-progress' | 'completed'
}

export default function Dashboard() {
  // Auth context + router for navigation
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();

  // Local UI/data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    totalHours: 0,
  });

  // Redirect if unauthenticated once auth finishes resolving
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Fetch tasks whenever we have a token (user logged in)
  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token]);

  // Pull tasks from your API and compute summary stats
  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data);
        calculateStats(data);
      }
      // NOTE: You might also want to handle non-OK responses explicitly
      // (e.g., show an error banner, handle 401 by logging out, etc.)
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Simple derived aggregates for the stats cards
  const calculateStats = (tasks: Task[]) => {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress').length;

    // Using estimatedHours for the total; consider actualHours when you have tracking
    const totalHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);

    setStats({
      totalTasks: tasks.length,
      completedTasks: completed,
      pendingTasks: pending,
      totalHours,
    });
  };

  // Clear auth state and go back to landing
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Initial auth-resolving splash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50  flex items-center justify-center">
        <div className="text-xl text-gray-600 ">Loading...</div>
      </div>
    );
  }

  // If user is not available yet (brief flash), render nothing — redirect is handled above
  if (!user) {
    return null;
  }

  // Build a small list of soonest-deadline tasks for display
  const upcomingTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 ">
      {/* Header / Nav */}
      <header className="bg-white  shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-purple-600">📚 StudySync</h1>
            <nav className="flex gap-6">
              <Link href="/dashboard" className="text-purple-600 font-semibold">
                Dashboard
              </Link>
              <Link href="/tasks" className="text-gray-600  hover:text-purple-600">
                Tasks
              </Link>
              <Link href="/schedule" className="text-gray-600  hover:text-purple-600">
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome copy */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800  mb-2">Welcome back, {user.name}! 👋</h2>
          <p className="text-gray-600 ">Here&apos;s your study overview for today</p>
        </div>

        {/* KPI / Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600  text-sm font-medium mb-1">Total Tasks</div>
            <div className="text-3xl font-bold text-gray-800 ">{stats.totalTasks}</div>
          </div>

          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600  text-sm font-medium mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{stats.completedTasks}</div>
          </div>

          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600  text-sm font-medium mb-1">Pending</div>
            <div className="text-3xl font-bold text-orange-600">{stats.pendingTasks}</div>
          </div>

          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600  text-sm font-medium mb-1">Total Hours</div>
            <div className="text-3xl font-bold text-purple-600">{stats.totalHours}h</div>
          </div>
        </div>

        {/* Quick actions + Upcoming list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800  mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/tasks"
                className="block w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors text-center"
              >
                ➕ Add New Task
              </Link>
              <Link
                href="/schedule"
                className="block w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors text-center"
              >
                🤖 Generate AI Schedule
              </Link>
            </div>
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-white  rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800  mb-4">Upcoming Deadlines</h3>
            {loadingTasks ? (
              <div className="text-gray-500">Loading tasks...</div>
            ) : upcomingTasks.length === 0 ? (
              // Empty state if no pending items
              <div className="text-gray-500 text-center py-8">
                <div className="text-4xl mb-2">🎉</div>
                <div>No pending tasks!</div>
                <Link href="/tasks" className="text-purple-600 hover:underline text-sm mt-2 inline-block">
                  Create your first task
                </Link>
              </div>
            ) : (
              // List of soonest deadlines with urgency chips
              <div className="space-y-3">
                {upcomingTasks.map((task) => {
                  // Days until deadline (ceil: anything due today shows as 0)
                  const daysUntil = Math.ceil(
                    (new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUrgent = daysUntil <= 2;

                  return (
                    <div
                      key={task._id}
                      className={`p-3 rounded-lg border-l-4 ${
                        isUrgent ? 'bg-red-50 border-red-500' : 'bg-gray-50  border-purple-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800  ">{task.title}</div>
                          <div className="text-sm text-gray-600 ">{task.subject}</div>
                        </div>
                        <div
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            isUrgent ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
