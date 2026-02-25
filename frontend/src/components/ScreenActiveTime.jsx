import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined, PauseCircleOutlined, CoffeeOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from '../utils/dayjs';

const { Text } = Typography;

// Poll session every 5 seconds to stay in sync
const SESSION_POLL_INTERVAL_MS = 5000;

const ScreenActiveTime = () => {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, completed, not_clocked_in

  // Refs
  const sessionRef = useRef(null);
  const intervalRef = useRef(null);

  // Calculate screen active time based on server data
  // Formula: (now - login_time) - break_minutes - inactive_seconds (from screen lock/sleep)
  // Time runs continuously until clock out
  // Pauses ONLY for: breaks (explicit) and screen lock/sleep (detected by client)
  const calculateScreenActiveTime = useCallback((sessionData) => {
    if (!sessionData || !sessionData.login_time) {
      return 0;
    }

    // Use timestamps for accurate calculation (avoids timezone issues)
    const nowMs = Date.now();
    const loginTimeMs = new Date(sessionData.login_time).getTime();

    // Total elapsed seconds since login
    const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);

    // Break time in seconds - calculate from breaks array for accuracy
    let breakSeconds = 0;
    if (sessionData.breaks && Array.isArray(sessionData.breaks)) {
      sessionData.breaks.forEach(b => {
        if (b.duration_minutes && b.duration_minutes > 0) {
          breakSeconds += Math.round(b.duration_minutes * 60);
        } else if (b.start_time && !b.end_time) {
          // Ongoing break - calculate duration
          const breakStartMs = new Date(b.start_time).getTime();
          breakSeconds += Math.floor((nowMs - breakStartMs) / 1000);
        }
      });
    } else {
      // Fallback to total_break_minutes
      breakSeconds = (sessionData.total_break_minutes || 0) * 60;
    }

    // Inactive time from screen lock/sleep (detected by client)
    const inactiveSeconds = sessionData.inactive_seconds || 0;

    // Screen active = elapsed - breaks - inactive (screen lock/sleep)
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

  // Handle visibility change - refresh session when page becomes visible
  // Time continues running regardless of tab visibility
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;

    if (isVisible) {
      // Page became visible - refresh session to get latest data
      console.log('Screen Active Time: Page visible - refreshing session');

      // Immediately update the displayed time
      if (sessionRef.current && sessionRef.current.status === 'active') {
        const activeSeconds = calculateScreenActiveTime(sessionRef.current);
        setScreenActiveSeconds(activeSeconds);
      }

      // Refresh session to get latest data from server
      fetchCurrentSession(true);
    }
  }, [fetchCurrentSession, calculateScreenActiveTime]);

  // Setup visibility listener and session polling - reset when user changes
  useEffect(() => {
    if (!user) {
      // User logged out - reset all state
      setSession(null);
      setLoading(false);
      setScreenActiveSeconds(0);
      setTimerStatus('not_clocked_in');
      sessionRef.current = null;
      return;
    }

    // User changed or logged in - reset and fetch fresh session
    setLoading(true);
    setSession(null);
    setScreenActiveSeconds(0);
    setTimerStatus('not_clocked_in');
    sessionRef.current = null;
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
  }, [user, fetchCurrentSession, handleVisibilityChange]);

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
    switch (timerStatus) {
      case 'running': return 'Timer runs until clock out (pauses on break or screen lock/sleep)';
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
