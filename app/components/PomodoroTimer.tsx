'use client';

import { useState, useEffect, useRef } from 'react';

interface PomodoroTimerProps {
  taskId: string;
  taskTitle: string;
  onComplete: () => void;
  onCancel: () => void;
  token: string;
}

export default function PomodoroTimer({ taskId, taskTitle, onComplete, onCancel, token }: PomodoroTimerProps) {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 * 60 -> 25 minutes in seconds. 
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start a new study session in the database
  const startSession = async () => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId }),
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(data._id);
        console.log('Session started:', data._id);
      } else {
        console.error('Failed to start session');
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  // Complete the session in the database
  const completeSession = async (completed: boolean) => {
    if (!sessionId) {
      console.log('No session ID to complete');
      return;
    }

    try {
      console.log('Completing session:', sessionId, 'Pomodoros:', pomodorosCompleted);
      const response = await fetch('/api/sessions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          pomodorosCompleted,
          wasCompleted: completed,
        }),
      });

      if (response.ok) {
        console.log('Session completed successfully');
      } else {
        console.error('Failed to complete session');
      }
    } catch (error) {
      console.error('Error completing session:', error);
    }
  };

  // Timer countdown logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Timer finished
      handleTimerComplete();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  const handleTimerComplete = () => {
    setIsRunning(false);

    if (!isBreak) {
      // Pomodoro completed, start break
      const newPomodoros = pomodorosCompleted + 1;
      setPomodorosCompleted(newPomodoros);
      
      // Determine break length
      const breakTime = newPomodoros % 4 === 0 ? 15 * 60 : 5 * 60; // 15 min after 4 pomodoros, 5 min otherwise
      setTimeLeft(breakTime);
      setIsBreak(true);
      
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Pomodoro Complete! 🎉', {
          body: `Time for a ${breakTime / 60} minute break!`,
        });
      }
    } else {
      // Break completed, start new pomodoro
      setTimeLeft(25 * 60);
      setIsBreak(false);
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Break Over! 💪', {
          body: 'Ready for another Pomodoro?',
        });
      }
    }
  };

  const handleStart = () => {
    if (!sessionId) {
      startSession();
    }
    setIsRunning(true);
    setIsPaused(false);

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const handlePause = () => {
    setIsRunning(false);
    setIsPaused(true);
  };

  const handleComplete = async () => {
    await completeSession(true);
    onComplete();
  };

  const handleCancel = async () => {
    await completeSession(false);
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = isBreak
    ? ((pomodorosCompleted % 4 === 0 ? 15 * 60 : 5 * 60) - timeLeft) / (pomodorosCompleted % 4 === 0 ? 15 * 60 : 5 * 60) * 100
    : (25 * 60 - timeLeft) / (25 * 60) * 100;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-2">{taskTitle}</h3>
          <p className="text-gray-600">
            {isBreak ? '☕ Break Time' : '📚 Focus Time'}
          </p>
        </div>

        {/* Timer Display */}
        <div className="text-center mb-6">
          <div className="text-6xl font-bold text-purple-600 mb-4">
            {formatTime(timeLeft)}
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
            <div
              className="bg-purple-600 h-3 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-sm text-gray-600">
            Pomodoro {pomodorosCompleted + 1} {!isBreak && 'in progress'}
          </p>
        </div>

        {/* Pomodoro Counter */}
        <div className="flex justify-center gap-2 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i < pomodorosCompleted % 4 ? 'bg-purple-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          {!isRunning && !isPaused && (
            <button
              onClick={handleStart}
              className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              Start
            </button>
          )}

          {isRunning && (
            <button
              onClick={handlePause}
              className="flex-1 bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 transition-colors"
            >
              Pause
            </button>
          )}

          {isPaused && (
            <button
              onClick={handleStart}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors"
            >
              Resume
            </button>
          )}

          {!isBreak && (
            <button
              onClick={handleComplete}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors"
            >
              Complete
            </button>
          )}

          <button
            onClick={handleCancel}
            className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Total time */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Total study time: {Math.floor((pomodorosCompleted * 25) / 60)}h {(pomodorosCompleted * 25) % 60}m
        </div>
      </div>
    </div>
  );
}