import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// If timer tick gap is > 2 seconds, screen was likely locked/sleeping
const SCREEN_LOCK_THRESHOLD_MS = 2000;

const ScreenActiveTime = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, screen_locked, completed, not_clocked_in

  // Refs for tracking state without causing re-renders
  const intervalRef = useRef(null);
  const lastTickTimeRef = useRef(Date.now());
  const screenActiveSecondsRef = useRef(0);
  const sessionRef = useRef(null);
  const isPageVisibleRef = useRef(!document.hidden);

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
        lastTickTimeRef.current = Date.now();
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
  }, []);

  // Handle visibility change - only used to refresh session when page becomes visible
  // NOT used to pause timer (tab switch should not pause timer)
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    isPageVisibleRef.current = isVisible;

    if (isVisible) {
      // Page visible again - refresh session to get latest status
      fetchCurrentSession(true);
      console.log('Screen Active Time: Page visible - refreshing session');
    }
    // Note: We do NOT pause timer on page hidden (tab switch)
    // Screen lock is detected via timer gap, not visibility
  }, [fetchCurrentSession]);

  // Setup event listeners and session polling
  useEffect(() => {
    fetchCurrentSession();

    // Listen for visibility changes (screen lock/unlock)
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
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const currentSession = sessionRef.current;
    const isSessionActive = currentSession && (currentSession.status === 'active' || currentSession.status === 'on_break');

    if (!isSessionActive) {
      // Not clocked in or session completed - don't run timer
      if (!currentSession || currentSession.status !== 'completed') {
        screenActiveSecondsRef.current = 0;
        setScreenActiveSeconds(0);
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

      // Check if screen was locked (timer was suspended by browser)
      // When screen locks, browser suspends JS timers
      // When unlocked, timer resumes with a large gap (> 2 seconds)
      // Tab switching does NOT suspend timers, so gap stays ~1 second
      const screenWasLocked = elapsed > SCREEN_LOCK_THRESHOLD_MS;

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
      } else if (screenWasLocked) {
        // Screen was locked/sleeping - DON'T count
        // This is detected by timer gap, NOT by visibility change
        // So tab switching will NOT trigger this
        newStatus = 'screen_locked';
        shouldCount = false;
        console.log(`Screen Active Time: Screen was locked for ~${Math.round(elapsed / 1000)}s - NOT counted`);
      } else {
        // Normal operation - screen ON, not on break
        // Timer keeps running even when tab is switched
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
      case 'running': return 'Timer running - screen is ON';
      case 'on_break': return 'Timer paused - you are on break';
      case 'screen_locked': return 'Timer paused - screen locked/off';
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
