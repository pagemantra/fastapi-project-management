import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Button, Space, Typography, Tag, Statistic, Row, Col, Select, message, Modal, Input, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CoffeeOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { attendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from '../utils/dayjs';

const { Text } = Typography;
const { TextArea } = Input;

// Heartbeat interval - 10 seconds (keeps session alive)
const HEARTBEAT_INTERVAL = 10000;

// Lock/Sleep detection thresholds
// If heartbeat gap is more than this, it indicates sleep/lock (JS was frozen)
const SLEEP_DETECTION_THRESHOLD_MS = 15000; // 15 seconds (1.5x heartbeat interval)

// Minimum gap to consider as actual sleep (not just network delay)
const MIN_SLEEP_DURATION_MS = 20000; // 20 seconds

const TimeTracker = () => {
  const navigate = useNavigate();
  const { user, dataVersion } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [breakType, setBreakType] = useState('short_break');
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [breakComment, setBreakComment] = useState('');
  const [currentSystemTime, setCurrentSystemTime] = useState(dayjs());
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [isUserActive, setIsUserActive] = useState(true);
  const [isScreenLocked, setIsScreenLocked] = useState(false);

  // Refs
  const heartbeatIntervalRef = useRef(null);
  const sessionRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isUserActiveRef = useRef(true);
  const isScreenLockedRef = useRef(false);
  const screenLockStartRef = useRef(null); // Track when screen lock started (IdleDetector only)
  const pageHiddenTimeRef = useRef(null); // Track when page became hidden (for fallback detection)
  const lastHeartbeatTimeRef = useRef(Date.now()); // Track last successful heartbeat time
  const wakeLockRef = useRef(null);
  const idleDetectorRef = useRef(null);
  const idleDetectorAvailableRef = useRef(false); // Track if IdleDetector is working

  // Keep refs in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    isUserActiveRef.current = isUserActive;
  }, [isUserActive]);

  useEffect(() => {
    isScreenLockedRef.current = isScreenLocked;
  }, [isScreenLocked]);

  // Notify service worker about session state
  const notifyServiceWorker = useCallback((type, data) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type, data });
    }
  }, []);

  // Request Wake Lock to prevent sleep during active work
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.log('[WakeLock] Not supported');
      return;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired - screen will stay awake');

      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released');
      });
    } catch (error) {
      console.error('[WakeLock] Failed to acquire:', error);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Fetch current session - defined early so it can be used by other effects
  const fetchCurrentSession = useCallback(async () => {
    try {
      const response = await attendanceService.getCurrentSession();
      setSession(response.data);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      message.error('Failed to load attendance session');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Idle Detection API (Chrome 94+) - only when session is active
  useEffect(() => {
    // Only initialize when we have an active session
    if (!session || session.status !== 'active') {
      return;
    }

    const initIdleDetector = async () => {
      // Check if IdleDetector is available
      if (typeof window === 'undefined' || !('IdleDetector' in window)) {
        console.log('[IdleDetector] Not supported, using visibility fallback');
        idleDetectorAvailableRef.current = false;
        return;
      }

      try {
        // Request permission - this may throw or return 'denied'
        const permission = await IdleDetector.requestPermission();
        if (permission !== 'granted') {
          console.log('[IdleDetector] Permission denied, using visibility fallback');
          idleDetectorAvailableRef.current = false;
          return;
        }

        idleDetectorRef.current = new IdleDetector();

        idleDetectorRef.current.addEventListener('change', () => {
          if (!idleDetectorRef.current) return;

          const { userState, screenState } = idleDetectorRef.current;
          console.log('[IdleDetector] State changed:', { userState, screenState });

          // Detect screen lock - this should pause the timer
          if (screenState === 'locked') {
            if (!isScreenLockedRef.current) {
              // Screen just got locked - record the time
              screenLockStartRef.current = Date.now();
              console.log('[IdleDetector] Screen LOCKED at', new Date().toLocaleTimeString());
            }
            setIsScreenLocked(true);
            setIsUserActive(false);
          } else {
            // Screen unlocked
            if (isScreenLockedRef.current && screenLockStartRef.current) {
              // Calculate how long the screen was locked
              const lockDuration = Math.floor((Date.now() - screenLockStartRef.current) / 1000);
              console.log('[IdleDetector] Screen UNLOCKED - was locked for', lockDuration, 'seconds');

              // Send the lock duration to the server
              if (lockDuration > 0 && sessionRef.current?.status === 'active') {
                attendanceService.addInactiveTime({ inactive_seconds_to_add: lockDuration })
                  .then(() => {
                    console.log('[IdleDetector] Added', lockDuration, 's inactive time');
                    // Refresh session to get updated inactive_seconds
                    fetchCurrentSession();
                  })
                  .catch(err => console.error('[IdleDetector] Failed to add inactive time:', err));
              }
              screenLockStartRef.current = null;
            }
            setIsScreenLocked(false);
            lastActivityRef.current = Date.now();
            setIsUserActive(true);
          }
        });

        await idleDetectorRef.current.start({
          threshold: 30000, // 30 seconds idle threshold
        });
        idleDetectorAvailableRef.current = true;
        console.log('[IdleDetector] Started successfully - using native detection');
      } catch (error) {
        // Don't crash on IdleDetector errors - fallback is fine
        console.log('[IdleDetector] Not available, using visibility fallback:', error.message);
        idleDetectorAvailableRef.current = false;
      }
    };

    initIdleDetector();

    return () => {
      if (idleDetectorRef.current) {
        try {
          idleDetectorRef.current.stop();
        } catch {
          // Ignore errors when stopping
        }
        idleDetectorRef.current = null;
      }
      idleDetectorAvailableRef.current = false;
    };
  }, [session?.status]);

  // Track user activity (mouse movement, keyboard, clicks, touch)
  // This is now just for display purposes - time runs continuously regardless
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      if (!isUserActiveRef.current) {
        setIsUserActive(true);
      }
    };

    // Track all user interactions
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Send heartbeat to server - keeps session alive and detects sleep/lock via time gaps
  const sendHeartbeat = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.status !== 'active') {
      return;
    }

    const now = Date.now();
    const lastHeartbeat = lastHeartbeatTimeRef.current;
    const timeSinceLastHeartbeat = now - lastHeartbeat;

    // Detect sleep/lock: If time since last heartbeat is much larger than expected,
    // it means JavaScript was frozen (computer sleeping/screen locked)
    let sleepDetected = false;
    let sleepDuration = 0;

    if (timeSinceLastHeartbeat > SLEEP_DETECTION_THRESHOLD_MS) {
      // Large gap detected - computer was likely sleeping
      // The sleep duration is the gap minus one normal interval
      sleepDuration = Math.floor((timeSinceLastHeartbeat - HEARTBEAT_INTERVAL) / 1000);

      if (sleepDuration >= Math.floor(MIN_SLEEP_DURATION_MS / 1000)) {
        sleepDetected = true;
        console.log('[Heartbeat] SLEEP DETECTED! Gap:', Math.floor(timeSinceLastHeartbeat / 1000), 's, Sleep duration:', sleepDuration, 's');

        // Add the sleep time as inactive time
        try {
          await attendanceService.addInactiveTime({ inactive_seconds_to_add: sleepDuration });
          console.log('[Heartbeat] Added', sleepDuration, 's to Lock/Sleep time');
          // Refresh session to get updated inactive_seconds
          fetchCurrentSession();
        } catch (err) {
          console.error('[Heartbeat] Failed to add sleep time:', err);
        }
      }
    }

    // Report as inactive only if screen is locked (detected by IdleDetector)
    const isActive = !isScreenLockedRef.current;

    try {
      await attendanceService.sendHeartbeat({
        timestamp: new Date().toISOString(),
        is_active: isActive,
        screen_locked: isScreenLockedRef.current
      });
      setHeartbeatActive(true);

      if (!sleepDetected) {
        console.log('[Heartbeat] Sent at', new Date().toLocaleTimeString(), '- Gap:', Math.floor(timeSinceLastHeartbeat / 1000), 's');
      }

      // Update last heartbeat time on success
      lastHeartbeatTimeRef.current = now;
    } catch (error) {
      // Silently handle heartbeat failures - don't crash the app
      console.log('[Heartbeat] Failed (will retry):', error.message || 'Network error');
      setHeartbeatActive(false);
    }
  }, [fetchCurrentSession]);

  // Heartbeat management
  useEffect(() => {
    if (session && session.status === 'active') {
      // Start heartbeat
      console.log('[Heartbeat] Starting...');
      sendHeartbeat(); // Initial heartbeat

      // Notify service worker
      const token = localStorage.getItem('token');
      if (token) {
        notifyServiceWorker('SET_AUTH_TOKEN', { token });
        notifyServiceWorker('SET_SESSION_ACTIVE', { active: true });
      }

      // Request wake lock
      requestWakeLock();

      heartbeatIntervalRef.current = setInterval(() => {
        sendHeartbeat();
      }, HEARTBEAT_INTERVAL);

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        releaseWakeLock();
      };
    } else {
      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      setHeartbeatActive(false);
      notifyServiceWorker('SET_SESSION_ACTIVE', { active: false });
      releaseWakeLock();
    }
  }, [session?.status, sendHeartbeat, notifyServiceWorker, requestWakeLock, releaseWakeLock]);

  // Visibility change handler - detects sleep/lock when page becomes visible
  // The key insight: When computer sleeps, JavaScript freezes completely
  // When user comes back, there will be a large gap in heartbeat timing
  //
  // Tab switching: heartbeats continue normally, no gap → NO inactive time
  // Screen lock/sleep: heartbeats stop, large gap → ADD inactive time
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isActive = sessionRef.current?.status === 'active';

      if (document.hidden) {
        // Page became hidden - record the time
        pageHiddenTimeRef.current = Date.now();
        console.log('[Visibility] Page hidden at', new Date().toLocaleTimeString());
      } else {
        // Page became visible again
        const now = Date.now();
        const hiddenDuration = pageHiddenTimeRef.current ? now - pageHiddenTimeRef.current : 0;
        const hiddenSeconds = Math.floor(hiddenDuration / 1000);
        const heartbeatGap = now - lastHeartbeatTimeRef.current;
        const heartbeatGapSeconds = Math.floor(heartbeatGap / 1000);

        console.log('[Visibility] Page visible at', new Date().toLocaleTimeString());
        console.log('[Visibility] Hidden for:', hiddenSeconds, 's, Heartbeat gap:', heartbeatGapSeconds, 's');

        // Update activity timestamp
        lastActivityRef.current = now;
        setIsUserActive(true);

        // Detect sleep/lock based on heartbeat gap
        // If the gap is much larger than hidden duration, computer was sleeping
        // (because during normal tab switch, heartbeats continue in background)
        if (isActive && heartbeatGap > SLEEP_DETECTION_THRESHOLD_MS) {
          const sleepDuration = Math.floor((heartbeatGap - HEARTBEAT_INTERVAL) / 1000);

          if (sleepDuration >= Math.floor(MIN_SLEEP_DURATION_MS / 1000)) {
            console.log('[Visibility] SLEEP DETECTED! Adding', sleepDuration, 's to Lock/Sleep time');
            setIsScreenLocked(true);

            attendanceService.addInactiveTime({ inactive_seconds_to_add: sleepDuration })
              .then(() => {
                console.log('[Visibility] Added', sleepDuration, 's inactive time successfully');
                fetchCurrentSession();
              })
              .catch(err => console.error('[Visibility] Failed to add inactive time:', err))
              .finally(() => {
                setIsScreenLocked(false);
                // Update last heartbeat time to prevent double-counting
                lastHeartbeatTimeRef.current = now;
              });
          } else {
            console.log('[Visibility] Gap detected but below threshold - not adding inactive time');
          }
        } else {
          console.log('[Visibility] Normal tab switch - no inactive time added');
        }

        pageHiddenTimeRef.current = null;

        if (isActive) {
          // Re-acquire wake lock (may have been released when hidden)
          requestWakeLock();
          // Send heartbeat to sync with server (this also updates lastHeartbeatTimeRef)
          sendHeartbeat();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendHeartbeat, requestWakeLock, fetchCurrentSession]);


  // Send final heartbeat on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionRef.current?.status === 'active') {
        const token = localStorage.getItem('token');
        if (token) {
          const data = JSON.stringify({
            timestamp: new Date().toISOString(),
            is_active: false,
            is_closing: true
          });
          navigator.sendBeacon(
            '/api/attendance/heartbeat',
            new Blob([data], { type: 'application/json' })
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Reset and refetch session when user changes
  useEffect(() => {
    // Always reset state when user/dataVersion changes
    setSession(null);
    setElapsedTime(0);
    setHeartbeatActive(false);
    setIsUserActive(true);
    setIsScreenLocked(false);
    sessionRef.current = null;
    screenLockStartRef.current = null;
    pageHiddenTimeRef.current = null;
    lastHeartbeatTimeRef.current = Date.now();

    if (!user) {
      // User logged out
      setLoading(false);
      return;
    }

    // User changed or logged in - fetch fresh session
    setLoading(true);
    fetchCurrentSession();
  }, [user?.id, dataVersion, fetchCurrentSession]);

  useEffect(() => {
    let interval;
    if (session && (session.status === 'active' || session.status === 'on_break')) {
      // Calculate elapsed time immediately, then update every second
      const calculateElapsedTime = () => {
        try {
          // Parse login time - handle both UTC and local formats
          let loginTime;
          if (session.login_time) {
            // Try parsing as UTC first, then as local
            loginTime = dayjs.utc(session.login_time).isValid()
              ? dayjs.utc(session.login_time).tz('Asia/Kolkata')
              : dayjs(session.login_time).tz('Asia/Kolkata');
          } else {
            setElapsedTime(0);
            return;
          }

          const now = dayjs().tz('Asia/Kolkata');
          const totalSeconds = now.diff(loginTime, 'second');

          // Calculate break seconds including any ongoing break
          let breakSeconds = 0;
          if (session.breaks && Array.isArray(session.breaks) && session.breaks.length > 0) {
            session.breaks.forEach(b => {
              if (b.duration_minutes && typeof b.duration_minutes === 'number') {
                breakSeconds += Math.round(b.duration_minutes * 60);
              } else if (b.start_time && !b.end_time) {
                // Ongoing break - calculate duration in seconds
                const breakStart = dayjs.utc(b.start_time).isValid()
                  ? dayjs.utc(b.start_time).tz('Asia/Kolkata')
                  : dayjs(b.start_time).tz('Asia/Kolkata');
                breakSeconds += Math.max(0, now.diff(breakStart, 'second'));
              }
            });
          }

          // Get inactive seconds (lock/sleep time) from session
          const inactiveSeconds = session.inactive_seconds || 0;

          // Work time = total elapsed - breaks - inactive (lock/sleep)
          const elapsed = Math.max(0, totalSeconds - breakSeconds - inactiveSeconds);
          setElapsedTime(elapsed);
          setCurrentSystemTime(now);
        } catch (error) {
          console.error('[TimeTracker] Error calculating elapsed time:', error);
          setElapsedTime(0);
        }
      };

      // Calculate immediately
      calculateElapsedTime();

      // Then update every second
      interval = setInterval(calculateElapsedTime, 1000);
    } else {
      // Update system time every second even when not clocked in
      setElapsedTime(0);
      interval = setInterval(() => {
        setCurrentSystemTime(dayjs().tz('Asia/Kolkata'));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session]);

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const response = await attendanceService.clockIn();
      setSession(response.data);
      message.success('Clocked in successfully!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to clock in');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!session?.worksheet_submitted) {
      Modal.confirm({
        title: 'Worksheet Not Submitted',
        content: 'You need to submit your daily worksheet before clocking out. Would you like to submit it now?',
        okText: 'Go to Worksheet',
        cancelText: 'Cancel',
        onOk: () => {
          navigate('/worksheets');
        },
      });
      return;
    }

    setActionLoading(true);
    try {
      const response = await attendanceService.clockOut({});
      setSession(response.data);
      // Clear service worker session
      notifyServiceWorker('CLEAR_SESSION', {});
      message.success('Clocked out successfully!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to clock out');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBreak = async () => {
    // If break type is meeting or other, require comment
    if (breakType === 'meeting' || breakType === 'other') {
      setCommentModalVisible(true);
      return;
    }
    await startBreakWithComment(null);
  };

  const startBreakWithComment = async (comment) => {
    setActionLoading(true);
    try {
      const response = await attendanceService.startBreak({
        break_type: breakType,
        comment: comment
      });
      setSession(response.data);
      message.success('Break started!');
      setCommentModalVisible(false);
      setBreakComment('');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to start break');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommentSubmit = () => {
    if (!breakComment.trim()) {
      message.error('Please enter a comment for this break');
      return;
    }
    startBreakWithComment(breakComment);
  };

  const handleEndBreak = async () => {
    setActionLoading(true);
    try {
      const response = await attendanceService.endBreak();
      setSession(response.data);
      message.success('Break ended!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to end break');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const getStatusTag = () => {
    if (!session) return <Tag color="default">Not Clocked In</Tag>;
    const colors = {
      active: 'green',
      on_break: 'orange',
      completed: 'blue',
      incomplete: 'red',
    };
    return <Tag color={colors[session.status]}>{(session.status || '').replace('_', ' ').toUpperCase()}</Tag>;
  };

  const getActivityTag = () => {
    if (isScreenLocked) {
      return (
        <Tooltip title="Screen is locked - timer paused">
          <Tag color="red" icon={<LockOutlined />}>
            Screen Locked
          </Tag>
        </Tooltip>
      );
    }
    if (heartbeatActive) {
      return (
        <Tooltip title="Time running - pauses only on screen lock/sleep or break">
          <Tag color="green" icon={<HeartOutlined />}>
            Running
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tooltip title="Connecting...">
        <Tag color="default" icon={<HeartOutlined />}>
          Connecting
        </Tag>
      </Tooltip>
    );
  };

  const breakOptions = [
    { value: 'short_break', label: 'Short Break' },
    { value: 'lunch_break', label: 'Lunch Break' },
    { value: 'tea_break', label: 'Tea Break' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Time Tracker</span>
          {getStatusTag()}
        </Space>
      }
      loading={loading}
    >
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} md={6}>
          <Statistic
            title="Work Time"
            value={formatTime(Math.max(0, elapsedTime))}
            prefix={<ClockCircleOutlined />}
            styles={{ value: { fontSize: 28, color: session?.status === 'active' ? '#52c41a' : '#1890ff' } }}
          />
        </Col>
        <Col xs={24} md={6}>
          <Statistic
            title="Break Time"
            value={(() => {
              if (!session) return '0 min';
              let totalMins = session.total_break_minutes || 0;
              // Add ongoing break time if on break
              if (session.status === 'on_break' && session.breaks && Array.isArray(session.breaks)) {
                const ongoingBreak = session.breaks.find(b => b.start_time && !b.end_time);
                if (ongoingBreak) {
                  try {
                    const breakStart = dayjs.utc(ongoingBreak.start_time).isValid()
                      ? dayjs.utc(ongoingBreak.start_time).tz('Asia/Kolkata')
                      : dayjs(ongoingBreak.start_time).tz('Asia/Kolkata');
                    const now = dayjs().tz('Asia/Kolkata');
                    totalMins += Math.max(0, now.diff(breakStart, 'minute'));
                  } catch (e) {
                    console.error('[TimeTracker] Error calculating break time:', e);
                  }
                }
              }
              return `${Math.round(totalMins)} min`;
            })()}
            prefix={<CoffeeOutlined />}
          />
        </Col>
        <Col xs={24} md={6}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            {!session || session.status === 'completed' ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleClockIn}
                loading={actionLoading}
                size="large"
                block
              >
                Clock In
              </Button>
            ) : session.status === 'active' ? (
              <>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={breakType}
                    onChange={setBreakType}
                    options={breakOptions}
                    style={{ width: '60%' }}
                  />
                  <Button
                    type="default"
                    icon={<CoffeeOutlined />}
                    onClick={handleStartBreak}
                    loading={actionLoading}
                    style={{ width: '40%' }}
                  >
                    Break
                  </Button>
                </Space.Compact>
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={handleClockOut}
                  loading={actionLoading}
                  block
                >
                  Clock Out
                </Button>
              </>
            ) : session.status === 'on_break' ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleEndBreak}
                loading={actionLoading}
                size="large"
                block
              >
                End Break
              </Button>
            ) : null}
          </Space>
        </Col>
      </Row>
      <div style={{ marginTop: 16 }}>
        <Text type="secondary">
          Current System Time: <Text strong>{currentSystemTime.format('hh:mm A')}</Text>
        </Text>
        {session && (
          <>
            <Text type="secondary" style={{ marginLeft: 16 }}>
              | Logged in at: {dayjs.utc(session.login_time).tz('Asia/Kolkata').format('hh:mm A')}
            </Text>
            {session.worksheet_submitted && (
              <Tag color="green" style={{ marginLeft: 8 }}>Worksheet Submitted</Tag>
            )}
            {session.status === 'active' && (
              <span style={{ marginLeft: 8 }}>
                {getActivityTag()}
              </span>
            )}
          </>
        )}
      </div>

      {/* Comment Modal for Meeting/Other breaks */}
      <Modal
        title={`${breakType === 'meeting' ? 'Meeting' : 'Other'} Break - Enter Details`}
        open={commentModalVisible}
        onOk={handleCommentSubmit}
        onCancel={() => {
          setCommentModalVisible(false);
          setBreakComment('');
        }}
        okText="Start Break"
        cancelText="Cancel"
        confirmLoading={actionLoading}
      >
        <div style={{ marginBottom: 8 }}>
          <Text>Please provide details for this {breakType === 'meeting' ? 'meeting' : 'break'}:</Text>
        </div>
        <TextArea
          rows={3}
          placeholder={breakType === 'meeting' ? 'Enter meeting details...' : 'Enter reason for break...'}
          value={breakComment}
          onChange={(e) => setBreakComment(e.target.value)}
          maxLength={500}
          showCount
        />
      </Modal>
    </Card>
  );
};

export default TimeTracker;
