import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Statistic, Typography, Tag, Space } from 'antd';
import { DesktopOutlined, PauseCircleOutlined, CoffeeOutlined, LockOutlined } from '@ant-design/icons';
import { attendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from '../utils/dayjs';
import screenLockDetector from '../utils/screenLockDetector';

const { Text } = Typography;

// Poll session every 5 seconds to stay in sync
const SESSION_POLL_INTERVAL_MS = 5000;

const ScreenActiveTime = () => {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [currentLockSeconds, setCurrentLockSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState('not_clocked_in'); // running, on_break, screen_locked, completed, not_clocked_in

  // Refs
  const sessionRef = useRef(null);
  const intervalRef = useRef(null);
  const detectorInitializedRef = useRef(false);

  // Calculate screen active time based on server data
  // Formula: (now - login_time) - break_minutes - inactive_seconds - current_lock_duration
  const calculateScreenActiveTime = useCallback((sessionData, currentLockDuration = 0) => {
    if (!sessionData || !sessionData.login_time) {
      return 0;
    }

    const nowMs = Date.now();
    const loginTimeMs = new Date(sessionData.login_time).getTime();
    const totalElapsedSeconds = Math.floor((nowMs - loginTimeMs) / 1000);

    // Break time in seconds
    let breakSeconds = 0;
    if (sessionData.breaks && Array.isArray(sessionData.breaks)) {
      sessionData.breaks.forEach(b => {
        if (b.duration_minutes && b.duration_minutes > 0) {
          breakSeconds += Math.round(b.duration_minutes * 60);
        } else if (b.start_time && !b.end_time) {
          const breakStartMs = new Date(b.start_time).getTime();
          breakSeconds += Math.floor((nowMs - breakStartMs) / 1000);
        }
      });
    } else {
      breakSeconds = (sessionData.total_break_minutes || 0) * 60;
    }

    // Inactive time from server (past lock/sleep time)
    const inactiveSeconds = sessionData.inactive_seconds || 0;

    // Screen active = elapsed - breaks - past_inactive - current_lock
    const activeSeconds = Math.max(0, totalElapsedSeconds - breakSeconds - inactiveSeconds - currentLockDuration);

    return activeSeconds;
  }, []);

  // Fetch current session from server
  const fetchCurrentSession = useCallback(async (silent = false) => {
    try {
      const response = await attendanceService.getCurrentSession();
      const newSession = response.data;

      sessionRef.current = newSession;
      setSession(newSession);

      if (!newSession) {
        setTimerStatus('not_clocked_in');
        setScreenActiveSeconds(0);
      } else if (newSession.status === 'completed') {
        setTimerStatus('completed');
        setScreenActiveSeconds(calculateScreenActiveTime(newSession));
      } else if (newSession.status === 'on_break') {
        setTimerStatus('on_break');
        setScreenActiveSeconds(calculateScreenActiveTime(newSession));
      } else if (newSession.status === 'active') {
        // Check if screen is currently locked
        const lockDuration = screenLockDetector.getCurrentLockDuration();
        if (screenLockDetector.isLocked()) {
          setTimerStatus('screen_locked');
          setCurrentLockSeconds(lockDuration);
        } else {
          setTimerStatus('running');
          setCurrentLockSeconds(0);
        }
        setScreenActiveSeconds(calculateScreenActiveTime(newSession, lockDuration));
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [calculateScreenActiveTime]);

  // Initialize screen lock detector when session is active
  useEffect(() => {
    if (!session || session.status !== 'active') {
      return;
    }

    // Don't re-initialize if already done
    if (detectorInitializedRef.current) {
      return;
    }

    const initDetector = async () => {
      await screenLockDetector.init({
        onLock: () => {
          console.log('[ScreenActiveTime] Screen locked - pausing timer');
          setTimerStatus('screen_locked');
        },

        onUnlock: (duration) => {
          console.log('[ScreenActiveTime] Screen unlocked - was locked for', duration, 's');

          // Add lock time to server
          if (duration > 0 && sessionRef.current?.status === 'active') {
            attendanceService.addInactiveTime({ inactive_seconds_to_add: duration })
              .then(() => {
                console.log('[ScreenActiveTime] Added', duration, 's to Lock/Sleep');
                fetchCurrentSession(true);
              })
              .catch(err => console.error('[ScreenActiveTime] Failed to add inactive time:', err));
          }

          setTimerStatus('running');
          setCurrentLockSeconds(0);
        },

        onSleep: () => {
          console.log('[ScreenActiveTime] System sleep detected');
          setTimerStatus('screen_locked');
        },

        onWake: (duration) => {
          console.log('[ScreenActiveTime] System wake - was sleeping for', duration, 's');

          // Add sleep time to server
          if (duration > 0 && sessionRef.current?.status === 'active') {
            attendanceService.addInactiveTime({ inactive_seconds_to_add: duration })
              .then(() => {
                console.log('[ScreenActiveTime] Added', duration, 's sleep time');
                fetchCurrentSession(true);
              })
              .catch(err => console.error('[ScreenActiveTime] Failed to add sleep time:', err));
          }

          setTimerStatus('running');
          setCurrentLockSeconds(0);
        },

        onError: (err) => {
          console.error('[ScreenActiveTime] Detector error:', err);
        }
      });

      detectorInitializedRef.current = true;
      console.log('[ScreenActiveTime] Screen lock detector initialized');
    };

    initDetector();

    return () => {
      // Don't destroy on cleanup - we want to keep it running
      // It will be destroyed when component fully unmounts
    };
  }, [session?.status, fetchCurrentSession]);

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden) {
      console.log('[ScreenActiveTime] Page visible - refreshing');
      fetchCurrentSession(true);
    }
  }, [fetchCurrentSession]);

  // Setup visibility listener and session polling
  useEffect(() => {
    if (!user) {
      setSession(null);
      setLoading(false);
      setScreenActiveSeconds(0);
      setCurrentLockSeconds(0);
      setTimerStatus('not_clocked_in');
      sessionRef.current = null;
      return;
    }

    setLoading(true);
    setSession(null);
    setScreenActiveSeconds(0);
    setCurrentLockSeconds(0);
    setTimerStatus('not_clocked_in');
    sessionRef.current = null;
    fetchCurrentSession();

    document.addEventListener('visibilitychange', handleVisibilityChange);

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

  // Cleanup detector on full unmount
  useEffect(() => {
    return () => {
      if (detectorInitializedRef.current) {
        screenLockDetector.destroy();
        detectorInitializedRef.current = false;
      }
    };
  }, []);

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

    intervalRef.current = setInterval(() => {
      const sess = sessionRef.current;
      if (!sess) return;

      if (sess.status === 'on_break') {
        setTimerStatus('on_break');
      } else if (sess.status === 'active') {
        // Get current lock duration from detector
        const lockDuration = screenLockDetector.getCurrentLockDuration();

        if (screenLockDetector.isLocked()) {
          setCurrentLockSeconds(lockDuration);
          setTimerStatus('screen_locked');
        } else {
          setCurrentLockSeconds(0);
          setTimerStatus('running');
        }

        // Recalculate screen active time (subtracting current lock duration)
        const activeSeconds = calculateScreenActiveTime(sess, lockDuration);
        setScreenActiveSeconds(activeSeconds);
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
      case 'screen_locked': return '#ff4d4f'; // Red - screen locked
      case 'on_break': return '#faad14'; // Orange
      case 'completed': return '#1890ff'; // Blue
      default: return '#8c8c8c'; // Gray
    }
  };

  const getStatusText = () => {
    switch (timerStatus) {
      case 'running': return 'Active';
      case 'screen_locked': return 'Screen Locked';
      case 'on_break': return 'On Break';
      case 'completed': return 'Session Ended';
      default: return 'Not Clocked In';
    }
  };

  const getStatusTagColor = () => {
    switch (timerStatus) {
      case 'running': return 'green';
      case 'screen_locked': return 'red';
      case 'on_break': return 'orange';
      case 'completed': return 'blue';
      default: return 'default';
    }
  };

  const getStatusIcon = () => {
    switch (timerStatus) {
      case 'screen_locked': return <LockOutlined />;
      case 'on_break': return <CoffeeOutlined />;
      case 'running': return <DesktopOutlined />;
      default: return <PauseCircleOutlined />;
    }
  };

  const getStatusMessage = () => {
    switch (timerStatus) {
      case 'running': return 'Timer running - pauses on break or screen lock/sleep';
      case 'screen_locked': return `Timer PAUSED - screen locked (${formatTime(currentLockSeconds)})`;
      case 'on_break': return 'Timer paused - you are on break';
      case 'completed': return 'Session ended';
      default: return '';
    }
  };

  const isSessionActive = session && (session.status === 'active' || session.status === 'on_break');

  // Calculate total lock/sleep time (saved + current)
  const totalLockSleepSeconds = (session?.inactive_seconds || 0) + currentLockSeconds;

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
      {isSessionActive && totalLockSleepSeconds > 0 && (
        <Text
          type="secondary"
          style={{ fontSize: '12px', marginTop: 4, display: 'block' }}
        >
          Lock/Sleep: {formatTime(totalLockSleepSeconds)}
        </Text>
      )}
      {isSessionActive && (
        <Text
          type="secondary"
          style={{ fontSize: '12px', marginTop: 4, display: 'block' }}
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
