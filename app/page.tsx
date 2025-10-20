'use client';

// StudySync Auth Page
// --------------------
// A simple login/register screen for Next.js (App Router) using a custom
// auth context. Comments aim to explain the flow without being noisy.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  // UI mode: true => Login, false => Register
  const [isLogin, setIsLogin] = useState(true);

  // Controlled inputs for the auth form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UX state for errors + loading spinner
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Router for client-side navigation and auth API from context
  const router = useRouter();
  const { login } = useAuth();

  // Handle both Login and Register flows with one submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Block default form submission (page reload)
    setError('');
    setLoading(true);

    try {
      // Choose endpoint and request body based on mode
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { name, email, password };

      // Send JSON payload to your Next.js route handler(s)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        // Prefer server-provided error message when available
        throw new Error(data.error || 'Something went wrong');
      }

      // Persist auth in your app state (e.g., context/localStorage inside useAuth)
      // NOTE: For production, consider using secure, HttpOnly cookies set by the server
      //       rather than storing raw tokens in JS-accessible storage.
      login(data.token, data.user);

      // On success, take the user to their dashboard
      router.push('/dashboard');
    } catch (err) {
      // Normalize any thrown value into a user-friendly string
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false); // Always stop the spinner
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header / Branding */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">📚 StudySync</h1>
          <p className="text-purple-200">AI-Powered Study Session Optimizer</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                isLogin
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                !isLogin
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Register
            </button>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Only render Name when in Register mode */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required={!isLogin}
                />
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            {/* Password field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
              {/* TIP: Add client-side rules or hints for strong passwords in production */}
            </div>

            {/* Error banner (conditionally rendered) */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit button (disabled while submitting) */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-purple-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Simple feature highlights under the card */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="text-purple-200">
            <div className="text-2xl mb-1">🤖</div>
            <div className="text-sm">AI Scheduling</div>
          </div>
          <div className="text-purple-200">
            <div className="text-2xl mb-1">📅</div>
            <div className="text-sm">Smart Calendar</div>
          </div>
          <div className="text-purple-200">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-sm">Analytics</div>
          </div>
        </div>
      </div>
    </div>
  );
}
