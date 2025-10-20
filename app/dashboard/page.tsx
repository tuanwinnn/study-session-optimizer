'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

interface Task {
  _id: string;
  title: string;
  subject: string;
  priority: string;
  deadline: string;
  estimatedHours: number;
  actualHours: number;
  status: string;
}

export default function Dashboard() {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    totalHours: 0,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token]);

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data);
        calculateStats(data);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const calculateStats = (tasks: Task[]) => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
    const totalHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);

    setStats({
      totalTasks: tasks.length,
      completedTasks: completed,
      pendingTasks: pending,
      totalHours,
    });
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const upcomingTasks = tasks
    .filter(t => t.status !== 'completed')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-purple-600">📚 StudySync</h1>
            <nav className="flex gap-6">
              <Link href="/dashboard" className="text-purple-600 font-semibold">
                Dashboard
              </Link>
              <Link href="/tasks" className="text-gray-600 hover:text-purple-600">
                Tasks
              </Link>
              <Link href="/schedule" className="text-gray-600 hover:text-purple-600">
                Schedule
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">👋 {user.name}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Welcome back, {user.name}! 👋
          </h2>
          <p className="text-gray-600">
            Here&apos;s your study overview for today
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600 text-sm font-medium mb-1">Total Tasks</div>
            <div className="text-3xl font-bold text-gray-800">{stats.totalTasks}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600 text-sm font-medium mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{stats.completedTasks}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600 text-sm font-medium mb-1">Pending</div>
            <div className="text-3xl font-bold text-orange-600">{stats.pendingTasks}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="text-gray-600 text-sm font-medium mb-1">Total Hours</div>
            <div className="text-3xl font-bold text-purple-600">{stats.totalHours}h</div>
          </div>
        </div>

        {/* Quick Actions & Upcoming Tasks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h3>
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

          {/* Upcoming Tasks */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Upcoming Deadlines</h3>
            {loadingTasks ? (
              <div className="text-gray-500">Loading tasks...</div>
            ) : upcomingTasks.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                <div className="text-4xl mb-2">🎉</div>
                <div>No pending tasks!</div>
                <Link href="/tasks" className="text-purple-600 hover:underline text-sm mt-2 inline-block">
                  Create your first task
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => {
                  const daysUntil = Math.ceil(
                    (new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUrgent = daysUntil <= 2;

                  return (
                    <div
                      key={task._id}
                      className={`p-3 rounded-lg border-l-4 ${
                        isUrgent ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-purple-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{task.title}</div>
                          <div className="text-sm text-gray-600">{task.subject}</div>
                        </div>
                        <div className={`text-xs font-semibold px-2 py-1 rounded ${
                          isUrgent ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                        }`}>
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