import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined, PauseCircleOutlined, CoffeeOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// Threshold for detecting lock/sleep (in milliseconds)
// If hidden for more than 30 seconds, treat as lock/sleep
const LOCK_SLEEP_THRESHOLD_MS = 30000;

// Poll session every 5 seconds to stay in sync
const SESSION_POLL_INTERVAL_MS = 5000;

const ScreenActiveTime = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, completed, not_clocked_in
  const [lastLockSleepSkipped, setLastLockSleepSkipped] = useState(0);

  // Refs
  const sessionRef = useRef(null);
  const intervalRef = useRef(null);
  const pageHiddenTimeRef = useRef(null);
  const inactiveSecondsAtHideRef = useRef(0); // inactive_seconds when page was hidden

  // Calculate screen active time based on server data
  // Formula: (now - login_time) - break_minutes - inactive_seconds
  const calculateScreenActiveTime = useCallback((sessionData) => {
    if (!sessionData || !sessionData.login_time) {
      return 0;
    }

    const now = dayjs();
    const loginTime = dayjs(sessionData.login_time);

    // Total elapsed seconds since login
    const totalElapsedSeconds = now.diff(loginTime, 'second');

    // Break time in seconds
    const breakSeconds = (sessionData.total_break_minutes || 0) * 60;

    // Inactive time (lock/sleep) in seconds
    const inactiveSeconds = sessionData.inactive_seconds || 0;

    // Screen active = elapsed - breaks - inactive
    const activeSeconds = Math.max(0, totalElapsedSeconds - breakSeconds - inactiveSeconds);

    return activeSeconds;
  }, []);

  // Fetch current session from server
  const fetchCurrentSession = useCallback(async (silent = false) => {
    try {
      const response = await attendanceService.getCurrentSession();
      const newSession = response.data;

      sessionRef.current = newSession;
      setSession(newSession);

      // Update timer status based on session
      if (!newSession) {
        setTimerStatus('not_clocked_in');
        setScreenActiveSeconds(0);
      } else if (newSession.status === 'completed') {
        setTimerStatus('completed');
        // Show final value
        setScreenActiveSeconds(calculateScreenActiveTime(newSession));
      } else if (newSession.status === 'on_break') {
        setTimerStatus('on_break');
        setScreenActiveSeconds(calculateScreenActiveTime(newSession));
      } else if (newSession.status === 'active') {
        setTimerStatus('running');
        setScreenActiveSeconds(calculateScreenActiveTime(newSession));
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [calculateScreenActiveTime]);

  // Add inactive time to server when lock/sleep detected
  const addInactiveTime = useCallback(async (seconds) => {
    if (!sessionRef.current || seconds <= 0) return;

    try {
      await attendanceService.addInactiveTime({ inactive_seconds_to_add: seconds });
      console.log(`Added ${seconds}s inactive time to server`);
      // Refresh session to get updated values
      await fetchCurrentSession(true);
    } catch (error) {
      console.error('Failed to add inactive time:', error);
    }
  }, [fetchCurrentSession]);

  // Handle visibility change - detect lock/sleep
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    const now = Date.now();

    if (!isVisible) {
      // Page became hidden - record the time
      pageHiddenTimeRef.current = now;
      inactiveSecondsAtHideRef.current = sessionRef.current?.inactive_seconds || 0;
      console.log('Screen Active Time: Page hidden');
    } else {
      // Page became visible again
      if (pageHiddenTimeRef.current) {
        const hiddenDuration = now - pageHiddenTimeRef.current;
        const hiddenSeconds = Math.round(hiddenDuration / 1000);

        if (hiddenDuration > LOCK_SLEEP_THRESHOLD_MS) {
          // Lock/sleep detected - add this time as inactive
          console.log(`Screen Active Time: Lock/sleep detected (${hiddenSeconds}s) - adding to inactive time`);
          setLastLockSleepSkipped(hiddenSeconds);
          addInactiveTime(hiddenSeconds);
        } else {
          // Tab switch - time continues normally (already counted in elapsed)
          console.log(`Screen Active Time: Tab switch (${hiddenSeconds}s) - time continues`);
          setLastLockSleepSkipped(0);
        }
      }

      pageHiddenTimeRef.current = null;

      // Refresh session to get latest data
      fetchCurrentSession(true);
    }
  }, [addInactiveTime, fetchCurrentSession]);

  // Setup visibility listener and session polling
  useEffect(() => {
    fetchCurrentSession();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Poll session periodically to stay in sync
    const sessionPollInterval = setInterval(() => {
      if (!document.hidden) {
        fetchCurrentSession(true);
      }
    }, SESSION_POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(sessionPollInterval);
    };
  }, [fetchCurrentSession, handleVisibilityChange]);

  // Timer that updates display every second
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const currentSession = sessionRef.current;
    const isSessionActive = currentSession &&
      (currentSession.status === 'active' || currentSession.status === 'on_break');

    if (!isSessionActive) {
      return;
    }

    // Update display every second by recalculating from server data
    intervalRef.current = setInterval(() => {
      const sess = sessionRef.current;
      if (!sess) return;

      if (sess.status === 'on_break') {
        // On break - don't increment, just show current value
        setTimerStatus('on_break');
      } else if (sess.status === 'active') {
        // Active - recalculate based on login time
        const activeSeconds = calculateScreenActiveTime(sess);
        setScreenActiveSeconds(activeSeconds);
        setTimerStatus('running');
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [session, calculateScreenActiveTime]);

  // Handle page unload - try to save any pending inactive time
  useEffect(() => {
    const handleBeforeUnload = () => {
      // If page was hidden when closing, the hidden time becomes inactive
      if (pageHiddenTimeRef.current && sessionRef.current) {
        const hiddenDuration = Date.now() - pageHiddenTimeRef.current;
        if (hiddenDuration > LOCK_SLEEP_THRESHOLD_MS) {
          const hiddenSeconds = Math.round(hiddenDuration / 1000);
          // Use synchronous XHR for beforeunload
          try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/attendance/inactive-time', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            const token = localStorage.getItem('token');
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.send(JSON.stringify({ inactive_seconds_to_add: hiddenSeconds }));
          } catch (e) {
            console.error('Failed to save inactive time on unload:', e);
          }
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
      case 'running': return 'Active';
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

  const getStatusIcon = () => {
    switch (timerStatus) {
      case 'on_break': return <CoffeeOutlined />;
      case 'running': return <DesktopOutlined />;
      default: return <PauseCircleOutlined />;
    }
  };

  const getStatusMessage = () => {
    if (lastLockSleepSkipped > 0) {
      const mins = Math.floor(lastLockSleepSkipped / 60);
      const secs = lastLockSleepSkipped % 60;
      return `Resumed - paused ${mins > 0 ? mins + 'm ' : ''}${secs}s (lock/sleep)`;
    }
    switch (timerStatus) {
      case 'running': return 'Timer runs continuously, pauses only on break/lock/sleep';
      case 'on_break': return 'Timer paused - you are on break';
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
      {(isSessionActive || lastLockSleepSkipped > 0) && (
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
