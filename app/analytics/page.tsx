'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

interface AnalyticsData {
  summary: {
    totalPomodoros: number;
    totalHoursStudied: number;
    overallAccuracy: number;
    currentStreak: number;
    sessionsCount: number;
  };
  taskAccuracy: Array<{
    taskId: string;
    title: string;
    subject: string;
    estimated: number;
    actual: number;
    difference: number;
    accuracyPercent: number;
  }>;
  subjectData: { [key: string]: number };
  hourlyData: { [key: number]: number };
  dailyStudyTime: { [key: string]: number };
  mostProductiveHour: number;
  insights: string[];
}

export default function AnalyticsPage() {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    const fetchAnalytics = async () => {
      try {
        const response = await fetch('/api/analytics', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as AnalyticsData;
        setAnalytics(data);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error fetching analytics:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Memoize chart data - must be before early returns
  const subjectChartData = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.subjectData).map(([subject, hours]) => ({
      subject,
      hours: parseFloat(hours.toFixed(1)),
    }));
  }, [analytics]);

  const dailyChartData = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.dailyStudyTime)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, hours]) => ({
        date: new Date(date).toLocaleDateString(navigator?.language || 'en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        hours: parseFloat(hours.toFixed(1)),
      }));
  }, [analytics]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading analytics...</div>
      </div>
    );
  }

  if (!user) return null;

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">No analytics data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-purple-600">📚 StudySync</h1>
            <nav className="flex gap-6">
              <Link href="/dashboard" className="text-gray-600 hover:text-purple-600">
                Dashboard
              </Link>
              <Link href="/tasks" className="text-gray-600 hover:text-purple-600">
                Tasks
              </Link>
              <Link href="/schedule" className="text-gray-600 hover:text-purple-600">
                Schedule
              </Link>
              <Link href="/analytics" className="text-purple-600 font-semibold">
                Analytics
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">👋 {user.name ?? 'User'}</span>
            <button onClick={handleLogout} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">📊 Study Analytics</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm font-medium mb-2 opacity-90">Total Pomodoros</div>
            <div className="text-4xl font-bold mb-1">{analytics.summary.totalPomodoros}</div>
            <div className="text-sm opacity-75">{analytics.summary.sessionsCount} sessions</div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm font-medium mb-2 opacity-90">Hours Studied</div>
            <div className="text-4xl font-bold mb-1">{analytics.summary.totalHoursStudied}h</div>
            <div className="text-sm opacity-75">Total focus time</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm font-medium mb-2 opacity-90">Accuracy</div>
            <div className="text-4xl font-bold mb-1">{analytics.summary.overallAccuracy}%</div>
            <div className="text-sm opacity-75">Time estimation</div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm font-medium mb-2 opacity-90">Study Streak</div>
            <div className="text-4xl font-bold mb-1">{analytics.summary.currentStreak} 🔥</div>
            <div className="text-sm opacity-75">Consecutive days</div>
          </div>
        </div>

        {/* AI Insights */}
        {analytics.insights.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
              <span>💡</span> AI Insights
            </h3>
            <ul className="space-y-2">
              {analytics.insights.map((insight, index) => (
                <li key={`${index}-${insight.slice(0, 16)}`} className="text-blue-800 flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Daily Study Time */}
          {dailyChartData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📅 Daily Study Time (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={2} name="Study Hours" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Study Time by Subject */}
          {subjectChartData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📚 Study Time by Subject</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={subjectChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="subject" />
                  <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hours" fill="#8b5cf6" name="Study Hours" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Task Accuracy Table */}
        {analytics.taskAccuracy.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🎯 Task Estimation Accuracy</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Task</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Subject</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Estimated</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Actual</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Difference</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.taskAccuracy.map((task) => (
                    <tr key={task.taskId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 font-medium">{task.title}</td>
                    <td className="py-3 px-4 text-gray-600">{task.subject}</td>
                    <td className="py-3 px-4 text-right text-gray-900 font-medium">{task.estimated.toFixed(1)}h</td>
                    <td className="py-3 px-4 text-right text-gray-900 font-medium">{task.actual.toFixed(1)}h</td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          task.difference > 0
                            ? 'text-red-600'
                            : task.difference < 0
                            ? 'text-green-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {task.difference > 0 ? '+' : ''}
                        {task.difference.toFixed(1)}h
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            task.accuracyPercent >= 80
                              ? 'bg-green-100 text-green-700'
                              : task.accuracyPercent >= 60
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {task.accuracyPercent.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}