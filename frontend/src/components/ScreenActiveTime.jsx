import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// Save to backend every 10 seconds
const SAVE_INTERVAL_MS = 10000;
// Threshold for detecting screen lock via timer gap (3 seconds)
const SCREEN_LOCK_THRESHOLD_MS = 3000;

const ScreenActiveTime = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, screen_locked, completed, not_clocked_in

  // Refs for tracking state without causing re-renders
  const intervalRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const lastTickTimeRef = useRef(Date.now());
  const screenActiveSecondsRef = useRef(0);
  const sessionRef = useRef(null);
  const lastSavedSecondsRef = useRef(0);
  const sessionIdRef = useRef(null);
  const isPageVisibleRef = useRef(!document.hidden);
  const pageHiddenTimeRef = useRef(null);

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

      // Update timer status based on session (only if page is visible)
      if (!newSession) {
        setTimerStatus('not_clocked_in');
      } else if (newSession.status === 'completed') {
        setTimerStatus('completed');
      } else if (newSession.status === 'on_break') {
        setTimerStatus('on_break');
      } else if (newSession.status === 'active') {
        // Only set to running if page is visible
        if (isPageVisibleRef.current) {
          setTimerStatus('running');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [saveScreenActiveTime]);

  // Handle visibility change - PAUSE timer when hidden, RESUME when visible
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    const wasVisible = isPageVisibleRef.current;
    isPageVisibleRef.current = isVisible;

    if (!isVisible && wasVisible) {
      // Page just became hidden (screen lock, sleep, tab switch, minimize)
      pageHiddenTimeRef.current = Date.now();

      // Save current value before going hidden
      if (sessionRef.current &&
          (sessionRef.current.status === 'active' || sessionRef.current.status === 'on_break')) {
        saveScreenActiveTime(screenActiveSecondsRef.current);
      }

      // Set status to screen_locked if we were running
      if (sessionRef.current?.status === 'active') {
        setTimerStatus('screen_locked');
        console.log('Screen Active Time: Page hidden - timer PAUSED');
      }
    } else if (isVisible && !wasVisible) {
      // Page just became visible again
      const hiddenDuration = pageHiddenTimeRef.current ? Date.now() - pageHiddenTimeRef.current : 0;
      console.log(`Screen Active Time: Page visible again after ${Math.round(hiddenDuration / 1000)}s - timer RESUMED`);

      // Reset last tick time to avoid counting hidden time
      lastTickTimeRef.current = Date.now();
      pageHiddenTimeRef.current = null;

      // Refresh session to get latest status
      fetchCurrentSession(true);

      // Resume timer if session is active
      if (sessionRef.current?.status === 'active') {
        setTimerStatus('running');
      }
    }
  }, [fetchCurrentSession, saveScreenActiveTime]);

  // Setup event listeners and session polling
  useEffect(() => {
    fetchCurrentSession();

    // Listen for visibility changes (screen lock, sleep, tab switch, minimize)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Poll for session updates every 2 seconds for quick break detection
    const sessionPollInterval = setInterval(() => {
      // Only poll when page is visible
      if (isPageVisibleRef.current) {
        fetchCurrentSession(true);
      }
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
      const elapsed = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;

      // Get current states
      const currentSessionStatus = sessionRef.current?.status;
      const isOnBreak = currentSessionStatus === 'on_break';
      const isPageVisible = isPageVisibleRef.current;

      // Check if there was a large gap (screen was locked/sleeping while timer was suspended)
      const hadLargeGap = elapsed > SCREEN_LOCK_THRESHOLD_MS;

      // Determine if we should count this second
      let shouldCount = false;
      let newStatus = 'running';

      if (!currentSessionStatus || currentSessionStatus === 'completed') {
        // Session ended
        newStatus = 'completed';
        shouldCount = false;
      } else if (isOnBreak) {
        // User is on break - DON'T count
        newStatus = 'on_break';
        shouldCount = false;
      } else if (!isPageVisible) {
        // Page is hidden (screen locked, sleep, tab switch, minimize) - DON'T count
        newStatus = 'screen_locked';
        shouldCount = false;
      } else if (hadLargeGap) {
        // Large gap detected (browser suspended timer) - DON'T count this tick
        // but resume counting next tick
        newStatus = 'running';
        shouldCount = false;
        console.log(`Screen Active Time: Large gap detected (${Math.round(elapsed / 1000)}s) - this tick NOT counted`);
      } else {
        // Normal operation - screen ON, not on break, page visible
        newStatus = 'running';
        shouldCount = true;
      }

      // Update status
      setTimerStatus(newStatus);

      // Increment counter only when we should count
      if (shouldCount) {
        screenActiveSecondsRef.current += 1;
        setScreenActiveSeconds(screenActiveSecondsRef.current);
      }
    }, 1000);

    // Setup periodic save interval
    saveIntervalRef.current = setInterval(() => {
      // Only save when page is visible
      if (isPageVisibleRef.current && sessionRef.current &&
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
      case 'screen_locked': return '#ff4d4f'; // Red
      case 'completed': return '#1890ff'; // Blue
      default: return '#8c8c8c'; // Gray
    }
  };

  const getStatusText = () => {
    switch (timerStatus) {
      case 'running': return 'Screen ON';
      case 'on_break': return 'On Break';
      case 'screen_locked': return 'Screen Off';
      case 'completed': return 'Session Ended';
      default: return 'Not Clocked In';
    }
  };

  const getStatusTagColor = () => {
    switch (timerStatus) {
      case 'running': return 'green';
      case 'on_break': return 'orange';
      case 'screen_locked': return 'red';
      case 'completed': return 'blue';
      default: return 'default';
    }
  };

  const getStatusMessage = () => {
    switch (timerStatus) {
      case 'running': return 'Timer running - screen is active';
      case 'on_break': return 'Timer paused - you are on break';
      case 'screen_locked': return 'Timer paused - screen locked/inactive';
      case 'completed': return 'Session ended';
      default: return '';
    }
  };

  const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');

  return (
    <Card loading={loading} style={{ height: '100%' }}>
      <Statistic
        title={
          <Space>
            <DesktopOutlined />
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
