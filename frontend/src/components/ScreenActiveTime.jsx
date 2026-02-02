import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// 3 minutes of no mouse/keyboard activity = inactive
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 180000ms = 3 minutes

const ScreenActiveTime = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [isScreenOn, setIsScreenOn] = useState(true);
  const [isUserActive, setIsUserActive] = useState(true);

  // Refs for tracking state without causing re-renders
  const intervalRef = useRef(null);
  const lastActivityTimeRef = useRef(Date.now());
  const isPageVisibleRef = useRef(!document.hidden);
  const isWindowFocusedRef = useRef(document.hasFocus());
  const screenActiveSecondsRef = useRef(0);
  const sessionRef = useRef(null);
  const wasActiveRef = useRef(true);

  // Fetch current session
  const fetchCurrentSession = useCallback(async (silent = false) => {
    try {
      const response = await attendanceService.getCurrentSession();
      const newSession = response.data;

      // Detect new clock-in (reset counter)
      if (newSession && newSession.status === 'active' &&
          (!sessionRef.current || sessionRef.current.status !== 'active' ||
           sessionRef.current._id !== newSession._id)) {
        screenActiveSecondsRef.current = 0;
        setScreenActiveSeconds(0);
      }

      sessionRef.current = newSession;
      setSession(newSession);
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Check if screen should be considered ON (not locked/sleeping)
  const checkScreenStatus = useCallback(() => {
    const pageVisible = isPageVisibleRef.current;
    const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
    const userActiveRecently = timeSinceLastActivity < IDLE_TIMEOUT_MS;

    // Screen is ON when page is visible
    // (when screen locks/sleeps, page becomes hidden)
    const screenOn = pageVisible;

    // User is active ONLY if there was recent mouse/keyboard activity (within 3 mins)
    const userActive = userActiveRecently;

    setIsScreenOn(screenOn);
    setIsUserActive(userActive);

    // Timer should run only when screen is ON AND user is active
    return screenOn && userActive;
  }, []);

  // Record user activity (mouse/keyboard events)
  const recordActivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    setIsUserActive(true);
  }, []);

  // Handle page visibility change (screen lock/unlock, tab switch)
  const handleVisibilityChange = useCallback(() => {
    isPageVisibleRef.current = !document.hidden;

    if (!document.hidden) {
      // Page became visible (screen unlocked or tab focused)
      recordActivity();
    }

    checkScreenStatus();
  }, [recordActivity, checkScreenStatus]);

  // Handle window focus
  const handleWindowFocus = useCallback(() => {
    isWindowFocusedRef.current = true;
    recordActivity();
    checkScreenStatus();
  }, [recordActivity, checkScreenStatus]);

  // Handle window blur
  const handleWindowBlur = useCallback(() => {
    isWindowFocusedRef.current = false;
    checkScreenStatus();
  }, [checkScreenStatus]);

  // Setup event listeners
  useEffect(() => {
    fetchCurrentSession();

    // Mouse and keyboard activity events
    const activityEvents = [
      'mousedown', 'mousemove', 'keydown', 'keyup',
      'touchstart', 'touchmove', 'scroll', 'click', 'wheel'
    ];

    const handleActivity = () => {
      recordActivity();
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Page visibility (detects screen lock/sleep/tab hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Window focus/blur
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    // Also listen to pageshow/pagehide for better detection
    window.addEventListener('pageshow', handleWindowFocus);
    window.addEventListener('pagehide', handleWindowBlur);

    // Poll for session updates every 30 seconds
    const sessionPollInterval = setInterval(() => {
      fetchCurrentSession(true);
    }, 30000);

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pageshow', handleWindowFocus);
      window.removeEventListener('pagehide', handleWindowBlur);
      clearInterval(sessionPollInterval);
    };
  }, [fetchCurrentSession, recordActivity, handleVisibilityChange, handleWindowFocus, handleWindowBlur]);

  // Main timer logic
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');

    if (!isSessionActive) {
      // Not clocked in or session completed - don't run timer
      if (!session || session.status !== 'completed') {
        screenActiveSecondsRef.current = 0;
        setScreenActiveSeconds(0);
      }
      return;
    }

    // Timer runs every second
    intervalRef.current = setInterval(() => {
      const pageVisible = isPageVisibleRef.current;
      const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
      const userActiveRecently = timeSinceLastActivity < IDLE_TIMEOUT_MS;

      // Determine if timer should increment
      // Screen must be ON (page visible = not locked/sleeping)
      // AND user must have mouse/keyboard activity within last 3 minutes
      const screenOn = pageVisible;
      const userActive = userActiveRecently; // Only mouse/keyboard activity counts
      const shouldIncrement = screenOn && userActive;

      // Update UI state
      setIsScreenOn(screenOn);
      setIsUserActive(userActive);

      // Log state changes for debugging (only when state changes)
      const currentlyActive = shouldIncrement;
      if (currentlyActive !== wasActiveRef.current) {
        wasActiveRef.current = currentlyActive;
        console.log(`Screen Active Time: ${currentlyActive ? 'RUNNING' : 'PAUSED'} | ` +
          `PageVisible: ${pageVisible}, ` +
          `LastActivity: ${Math.round(timeSinceLastActivity / 1000)}s ago`);
      }

      // Increment counter only when conditions are met
      if (shouldIncrement) {
        screenActiveSecondsRef.current += 1;
        setScreenActiveSeconds(screenActiveSecondsRef.current);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [session]);

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

  const getTimerRunning = () => {
    const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');
    return isSessionActive && isScreenOn && isUserActive;
  };

  const getStatusColor = () => {
    if (!session) return '#8c8c8c';
    if (session.status === 'completed') return '#1890ff';

    const timerRunning = getTimerRunning();
    if (timerRunning) return '#52c41a'; // Green - timer running
    return '#faad14'; // Orange - timer paused
  };

  const getStatusText = () => {
    if (!session) return 'Not Clocked In';
    if (session.status === 'completed') return 'Session Ended';

    if (!isScreenOn) return 'Screen Off';
    if (!isUserActive) return 'Inactive';
    return 'Screen ON';
  };

  const getStatusTagColor = () => {
    if (!session) return 'default';
    if (session.status === 'completed') return 'blue';

    const timerRunning = getTimerRunning();
    if (timerRunning) return 'green';
    return 'orange';
  };

  const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');
  const timerRunning = getTimerRunning();

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
          {timerRunning
            ? 'Timer running - screen ON & active'
            : !isScreenOn
              ? 'Timer paused - screen locked/off'
              : 'Timer paused - inactive for 3+ mins'}
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
