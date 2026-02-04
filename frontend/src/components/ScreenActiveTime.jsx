import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// Save to backend every 10 seconds
const SAVE_INTERVAL_MS = 10000;

// Threshold for detecting lock/sleep (in milliseconds)
// Tab switch: browser throttles timer but still fires every 1-10 seconds
// Lock/sleep: timer completely stops, gaps are 30+ seconds
// Using 15 seconds as threshold to distinguish between the two
const LOCK_SLEEP_THRESHOLD_MS = 15000;

const ScreenActiveTime = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, completed, not_clocked_in

  // Refs for tracking state without causing re-renders
  const intervalRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const lastTickTimeRef = useRef(Date.now());
  const screenActiveSecondsRef = useRef(0);
  const sessionRef = useRef(null);
  const lastSavedSecondsRef = useRef(0);
  const sessionIdRef = useRef(null);

  // Lock/Sleep detection ref - tracks when page became hidden
  const lastVisibilityChangeRef = useRef(Date.now());

  // Save screen active time to backend
  const saveScreenActiveTime = useCallback(async (seconds) => {
    if (!sessionRef.current || sessionRef.current.status === 'completed') {
      return;
    }

    // Only save if value has changed
    if (seconds === lastSavedSecondsRef.current) {
      return;
    }

    try {
      await attendanceService.updateScreenActiveTime({ screen_active_seconds: seconds });
      lastSavedSecondsRef.current = seconds;
      console.log(`Screen Active Time: Saved ${seconds}s to backend`);
    } catch (error) {
      console.error('Failed to save screen active time:', error);
    }
  }, []);

  // Fetch current session
  const fetchCurrentSession = useCallback(async (silent = false) => {
    try {
      const response = await attendanceService.getCurrentSession();
      const newSession = response.data;

      // Detect new clock-in (different session ID means new session)
      if (newSession && newSession.id !== sessionIdRef.current) {
        // New session - load persisted value or reset
        sessionIdRef.current = newSession.id;

        // Load persisted screen_active_seconds from backend
        const persistedSeconds = newSession.screen_active_seconds || 0;
        screenActiveSecondsRef.current = persistedSeconds;
        lastSavedSecondsRef.current = persistedSeconds;
        setScreenActiveSeconds(persistedSeconds);
        lastTickTimeRef.current = Date.now();

        console.log(`Screen Active Time: Loaded ${persistedSeconds}s from backend for session ${newSession.id}`);
      }

      // Detect session ended
      if (!newSession && sessionRef.current) {
        // Session ended - save final value
        await saveScreenActiveTime(screenActiveSecondsRef.current);
        sessionIdRef.current = null;
      }

      sessionRef.current = newSession;
      setSession(newSession);

      // Update timer status based on session
      if (!newSession) {
        setTimerStatus('not_clocked_in');
      } else if (newSession.status === 'completed') {
        setTimerStatus('completed');
      } else if (newSession.status === 'on_break') {
        setTimerStatus('on_break');
      } else if (newSession.status === 'active') {
        setTimerStatus('running');
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [saveScreenActiveTime]);

  // Handle visibility change - detect lock/sleep vs tab switch
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    const now = Date.now();
    const timeSinceLastChange = now - lastVisibilityChangeRef.current;
    lastVisibilityChangeRef.current = now;

    if (!isVisible) {
      // Page became hidden (tab switch or lock/sleep)
      // Save current value before leaving
      if (sessionRef.current &&
          (sessionRef.current.status === 'active' || sessionRef.current.status === 'on_break')) {
        saveScreenActiveTime(screenActiveSecondsRef.current);
      }
      // Timer CONTINUES running for tab switch - we'll check time gap on return
      console.log('Screen Active Time: Page hidden - timer continues (tab switch)');

    } else {
      // Page became visible again
      // Check if it was lock/sleep (large time gap) or just tab switch (small gap)
      const wasLockOrSleep = timeSinceLastChange > LOCK_SLEEP_THRESHOLD_MS;

      if (wasLockOrSleep) {
        // LOCK/SLEEP detected - DON'T count the gap time
        console.log(`Screen Active Time: Detected LOCK/SLEEP (${Math.round(timeSinceLastChange / 1000)}s gap) - NOT counting that time`);
        // Reset last tick time to NOW so next tick only counts from now
        lastTickTimeRef.current = now;
      } else {
        // TAB SWITCH - count all elapsed time (timer continued)
        console.log(`Screen Active Time: Tab switch (${Math.round(timeSinceLastChange / 1000)}s) - time was counted`);
      }

      // Restore running status if session is active
      if (sessionRef.current?.status === 'active') {
        setTimerStatus('running');
      }

      // Refresh session to get latest status
      fetchCurrentSession(true);
    }
  }, [fetchCurrentSession, saveScreenActiveTime]);

  // Setup event listeners and session polling
  useEffect(() => {
    fetchCurrentSession();

    // Listen for visibility changes (for saving data)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Poll for session updates every 2 seconds for quick break detection
    const sessionPollInterval = setInterval(() => {
      fetchCurrentSession(true);
    }, 2000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(sessionPollInterval);
    };
  }, [fetchCurrentSession, handleVisibilityChange]);

  // Main timer logic
  useEffect(() => {
    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }

    const currentSession = sessionRef.current;
    const isSessionActive = currentSession && (currentSession.status === 'active' || currentSession.status === 'on_break');

    if (!isSessionActive) {
      // Not clocked in or session completed - don't run timer
      if (!currentSession || currentSession.status !== 'completed') {
        // Don't reset counter for completed sessions (keep showing final value)
        if (!currentSession) {
          screenActiveSecondsRef.current = 0;
          setScreenActiveSeconds(0);
          lastSavedSecondsRef.current = 0;
        }
      }
      return;
    }

    // Reset last tick time when starting
    lastTickTimeRef.current = Date.now();

    // Timer runs every second
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastTickTimeRef.current;
      const elapsedSeconds = Math.round(elapsedMs / 1000);

      // Get current states
      const currentSessionStatus = sessionRef.current?.status;
      const isOnBreak = currentSessionStatus === 'on_break';

      // Detect if screen was locked/sleeping (large time gap indicates system was suspended)
      // Note: Tab switch has small time gaps, lock/sleep has large gaps (> 3 seconds)
      const wasLockOrSleep = elapsedMs > LOCK_SLEEP_THRESHOLD_MS;

      // Determine if we should count
      let secondsToAdd = 0;
      let newStatus = 'running';

      if (!currentSessionStatus || currentSessionStatus === 'completed') {
        // Session ended
        newStatus = 'completed';
        secondsToAdd = 0;
      } else if (isOnBreak) {
        // User is on break - DON'T count
        newStatus = 'on_break';
        secondsToAdd = 0;
      } else if (wasLockOrSleep) {
        // LOCK/SLEEP detected (large time gap) - DON'T count the gap
        // Only add 1 second to resume counting from now
        newStatus = 'running';
        secondsToAdd = 1;
        console.log(`Screen Active Time: Lock/sleep detected (${elapsedSeconds}s gap) - only counting 1s`);
      } else {
        // Normal operation OR tab switch - count ALL elapsed time
        // Tab switch: timer continues, count the time spent in other tab
        newStatus = 'running';
        secondsToAdd = elapsedSeconds > 0 ? elapsedSeconds : 1;
      }

      // Always update last tick time
      lastTickTimeRef.current = now;

      // Update status
      setTimerStatus(newStatus);

      // Add seconds to counter
      if (secondsToAdd > 0) {
        screenActiveSecondsRef.current += secondsToAdd;
        setScreenActiveSeconds(screenActiveSecondsRef.current);
      }
    }, 1000);

    // Setup periodic save interval
    saveIntervalRef.current = setInterval(() => {
      if (sessionRef.current &&
          (sessionRef.current.status === 'active' || sessionRef.current.status === 'on_break')) {
        saveScreenActiveTime(screenActiveSecondsRef.current);
      }
    }, SAVE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      // Save on unmount
      if (sessionRef.current &&
          (sessionRef.current.status === 'active' || sessionRef.current.status === 'on_break')) {
        saveScreenActiveTime(screenActiveSecondsRef.current);
      }
    };
  }, [session, saveScreenActiveTime]);

  // Save on page unload/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionRef.current &&
          (sessionRef.current.status === 'active' || sessionRef.current.status === 'on_break')) {
        // Use synchronous XHR for beforeunload
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/attendance/screen-active-time', false); // false makes it synchronous
          xhr.setRequestHeader('Content-Type', 'application/json');
          const token = localStorage.getItem('token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.send(JSON.stringify({ screen_active_seconds: screenActiveSecondsRef.current }));
        } catch (e) {
          console.error('Failed to save on unload:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusColor = () => {
    switch (timerStatus) {
      case 'running': return '#52c41a'; // Green
      case 'on_break': return '#faad14'; // Orange
      case 'completed': return '#1890ff'; // Blue
      default: return '#8c8c8c'; // Gray
    }
  };

  const getStatusText = () => {
    switch (timerStatus) {
      case 'running': return 'Running';
      case 'on_break': return 'On Break';
      case 'completed': return 'Session Ended';
      default: return 'Not Clocked In';
    }
  };

  const getStatusTagColor = () => {
    switch (timerStatus) {
      case 'running': return 'green';
      case 'on_break': return 'orange';
      case 'completed': return 'blue';
      default: return 'default';
    }
  };

  const getStatusMessage = () => {
    switch (timerStatus) {
      case 'running': return 'Timer running (continues on tab switch, pauses on lock/sleep)';
      case 'on_break': return 'Timer paused - you are on break';
      case 'completed': return 'Session ended';
      default: return '';
    }
  };

  const getStatusIcon = () => {
    switch (timerStatus) {
      case 'on_break': return <PauseCircleOutlined />;
      default: return <DesktopOutlined />;
    }
  };

  const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');

  return (
    <Card loading={loading} style={{ height: '100%' }}>
      <Statistic
        title={
          <Space>
            {getStatusIcon()}
            <span>Screen Active Time</span>
          </Space>
        }
        value={session ? formatTime(screenActiveSeconds) : '--'}
        valueStyle={{
          color: getStatusColor(),
          fontSize: '24px'
        }}
        suffix={
          <Tag
            color={getStatusTagColor()}
            style={{ marginLeft: 8, fontSize: '12px' }}
          >
            {getStatusText()}
          </Tag>
        }
      />
      {isSessionActive && (
        <Text
          type="secondary"
          style={{ fontSize: '12px', marginTop: 8, display: 'block' }}
        >
          {getStatusMessage()}
        </Text>
      )}
      {session && session.login_time && (
        <Text type="secondary" style={{ fontSize: '11px', marginTop: 4, display: 'block' }}>
          Clocked in: {dayjs.utc(session.login_time).tz('Asia/Kolkata').format('hh:mm A')}
        </Text>
      )}
    </Card>
  );
};

export default ScreenActiveTime;
