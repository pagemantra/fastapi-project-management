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
  const [isScreenLocked, setIsScreenLocked] = useState(false);

  // Refs for tracking state without causing re-renders
  const intervalRef = useRef(null);
  const lastTickTimeRef = useRef(Date.now());
  const screenActiveSecondsRef = useRef(0);
  const sessionRef = useRef(null);

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
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Setup event listeners and session polling
  useEffect(() => {
    fetchCurrentSession();

    // Poll for session updates every 10 seconds to catch break status changes
    const sessionPollInterval = setInterval(() => {
      fetchCurrentSession(true);
    }, 10000);

    return () => {
      clearInterval(sessionPollInterval);
    };
  }, [fetchCurrentSession]);

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

    // Reset last tick time when starting
    lastTickTimeRef.current = Date.now();

    // Timer runs every second
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;

      // Check if screen was locked (timer was suspended by browser)
      // When screen locks, browser suspends JS timers
      // When it unlocks, the timer resumes with a big gap
      const screenWasLocked = elapsed > SCREEN_LOCK_THRESHOLD_MS;

      // Check if user is on break
      const isOnBreak = sessionRef.current?.status === 'on_break';

      if (screenWasLocked) {
        // Screen was locked - don't count this time
        setIsScreenLocked(true);
        console.log(`Screen Active Time: Screen was locked for ~${Math.round(elapsed / 1000)}s - not counted`);

        // Reset the locked state after a short delay
        setTimeout(() => setIsScreenLocked(false), 1000);
      } else if (isOnBreak) {
        // User is on break - don't count
        // Timer keeps checking but doesn't increment
      } else {
        // Normal tick - screen is ON and user is not on break
        setIsScreenLocked(false);
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

  const getTimerStatus = () => {
    if (!session) return 'not_clocked_in';
    if (session.status === 'completed') return 'completed';
    if (session.status === 'on_break') return 'on_break';
    if (isScreenLocked) return 'screen_locked';
    return 'running';
  };

  const getStatusColor = () => {
    const status = getTimerStatus();
    switch (status) {
      case 'running': return '#52c41a'; // Green
      case 'on_break': return '#faad14'; // Orange
      case 'screen_locked': return '#ff4d4f'; // Red
      case 'completed': return '#1890ff'; // Blue
      default: return '#8c8c8c'; // Gray
    }
  };

  const getStatusText = () => {
    const status = getTimerStatus();
    switch (status) {
      case 'running': return 'Screen ON';
      case 'on_break': return 'On Break';
      case 'screen_locked': return 'Screen Off';
      case 'completed': return 'Session Ended';
      default: return 'Not Clocked In';
    }
  };

  const getStatusTagColor = () => {
    const status = getTimerStatus();
    switch (status) {
      case 'running': return 'green';
      case 'on_break': return 'orange';
      case 'screen_locked': return 'red';
      case 'completed': return 'blue';
      default: return 'default';
    }
  };

  const getStatusMessage = () => {
    const status = getTimerStatus();
    switch (status) {
      case 'running': return 'Timer running - screen is ON';
      case 'on_break': return 'Timer paused - you are on break';
      case 'screen_locked': return 'Timer paused - screen was locked';
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
