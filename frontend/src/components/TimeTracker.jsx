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
import screenLockDetector from '../utils/screenLockDetector';

const { Text } = Typography;
const { TextArea } = Input;

// Heartbeat interval - 10 seconds (keeps session alive)
const HEARTBEAT_INTERVAL = 10000;

const TimeTracker = () => {
  const navigate = useNavigate();
  const { user, dataVersion } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [breakType, setBreakType] = useState('short_break');
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [breakComment, setBreakComment] = useState('');
  const [currentSystemTime, setCurrentSystemTime] = useState(dayjs());
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const [lockSleepSeconds, setLockSleepSeconds] = useState(0);

  // Refs
  const heartbeatIntervalRef = useRef(null);
  const sessionRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const wakeLockRef = useRef(null);
  const detectorInitializedRef = useRef(false);
  const detectorCleanupRef = useRef(null); // Cleanup function from detector.init()
  const pendingInactiveSecondsRef = useRef(0); // Track inactive time sent but not yet confirmed
  const lastConfirmedInactiveRef = useRef(0); // Track last confirmed inactive_seconds from server
  const lockStartTimeRef = useRef(null); // Track when lock started (client-side timestamp)
  const isLockedRef = useRef(false); // Track lock state in ref for accurate timing
  const currentScreenActiveRef = useRef(0); // Always track current screen active seconds
  const screenActiveAtLockRef = useRef(0); // Store screen active time when lock started
  const lockEventIdRef = useRef(null); // Unique ID for current lock event to prevent double-counting
  const inactiveTimeReportedRef = useRef(false); // Flag to prevent double-reporting inactive time

  // Keep refs in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Keep screen active ref in sync for callbacks
  useEffect(() => {
    currentScreenActiveRef.current = screenActiveSeconds;
  }, [screenActiveSeconds]);

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

  // Recover inactive time from app close (after app close/reopen)
  // IMPORTANT: Only add time to Lock/Sleep if screen was LOCKED when app closed
  // If screen was ACTIVE when app closed, timer keeps running (screen active time continues)
  const recoverAppCloseTime = useCallback(async (sessionData) => {
    try {
      const savedState = localStorage.getItem('timeTracker_appCloseState');
      if (!savedState) {
        console.log('[TimeTracker] No app close state found');
        return;
      }

      const closeState = JSON.parse(savedState);
      console.log('[TimeTracker] Found app close state:', closeState);

      // Only process TRUE app close events (set via beforeunload with isAppClose flag)
      if (!closeState.isAppClose) {
        console.log('[TimeTracker] State is not from app close (likely old format), clearing');
        localStorage.removeItem('timeTracker_appCloseState');
        localStorage.removeItem('timeTracker_lockState');
        return;
      }

      // Verify the close state is for today's session
      if (closeState.sessionDate !== sessionData?.date) {
        console.log('[TimeTracker] Close state is from different date, clearing');
        localStorage.removeItem('timeTracker_appCloseState');
        localStorage.removeItem('timeTracker_lockState');
        return;
      }

      // Check if too old (more than 24 hours) - safety check
      const now = Date.now();
      const stateAge = now - closeState.closeTime;
      if (stateAge > 24 * 60 * 60 * 1000) {
        console.log('[TimeTracker] Close state too old, clearing');
        localStorage.removeItem('timeTracker_appCloseState');
        localStorage.removeItem('timeTracker_lockState');
        return;
      }

      // CRITICAL: Only add to Lock/Sleep time if screen was LOCKED when app closed
      // If screen was ACTIVE, the time while app was closed counts as SCREEN ACTIVE time
      // (timer conceptually keeps running - we don't add anything to inactive)
      if (!closeState.wasLocked) {
        console.log('[TimeTracker] Screen was ACTIVE when app closed - no inactive time to add');
        console.log('[TimeTracker] Screen Active timer conceptually kept running while app was closed');
        localStorage.removeItem('timeTracker_appCloseState');
        localStorage.removeItem('timeTracker_lockState');
        return;
      }

      // Screen was LOCKED when app closed - calculate lock duration
      // Use lockStartTime (when screen locked) as the start point
      const lockStartTime = closeState.lockStartTime || closeState.closeTime;
      const lockDuration = Math.floor((now - lockStartTime) / 1000);
      console.log('[TimeTracker] Screen was LOCKED when app closed');
      console.log('[TimeTracker] Lock started at:', new Date(lockStartTime).toLocaleTimeString());
      console.log('[TimeTracker] Lock/Sleep duration:', lockDuration, 's');

      // Only add if significant (more than 10 seconds)
      if (lockDuration > 10 && sessionData?.status === 'active') {
        try {
          await attendanceService.addInactiveTime({ inactive_seconds_to_add: lockDuration });
          console.log('[TimeTracker] Added', lockDuration, 's to Lock/Sleep time on server');

          // Show user-friendly message
          const hours = Math.floor(lockDuration / 3600);
          const mins = Math.floor((lockDuration % 3600) / 60);
          const secs = lockDuration % 60;
          let timeStr = '';
          if (hours > 0) {
            timeStr = `${hours}h ${mins}m`;
          } else if (mins > 0) {
            timeStr = `${mins}m ${secs}s`;
          } else {
            timeStr = `${secs}s`;
          }
          message.info(`Added ${timeStr} to Lock/Sleep time (screen was locked)`);
        } catch (err) {
          console.error('[TimeTracker] Failed to add inactive time:', err);
        }
      } else {
        console.log('[TimeTracker] Lock duration too short, not adding:', lockDuration, 's');
      }

      // Clear ALL saved states after recovery
      localStorage.removeItem('timeTracker_appCloseState');
      localStorage.removeItem('timeTracker_lockState');
    } catch (error) {
      console.error('[TimeTracker] Error recovering app close state:', error);
      localStorage.removeItem('timeTracker_appCloseState');
      localStorage.removeItem('timeTracker_lockState');
    }
  }, []);

  // Fetch current session
  const fetchCurrentSession = useCallback(async (isInitialLoad = false) => {
    try {
      const response = await attendanceService.getCurrentSession();
      const sessionData = response.data;
      setSession(sessionData);

      // Initialize lastConfirmedInactiveRef if this is the first load or session changed
      if (sessionData && sessionData.inactive_seconds !== undefined) {
        // Only update if server has more than what we've confirmed
        // This handles the case when session is refreshed after unlock
        if (sessionData.inactive_seconds >= lastConfirmedInactiveRef.current + pendingInactiveSecondsRef.current) {
          lastConfirmedInactiveRef.current = sessionData.inactive_seconds;
          pendingInactiveSecondsRef.current = 0;
        }
      }

      // On initial load, check for any app close time to recover as inactive time
      if (isInitialLoad && sessionData?.status === 'active') {
        await recoverAppCloseTime(sessionData);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      message.error('Failed to load attendance session');
    } finally {
      setLoading(false);
    }
  }, [recoverAppCloseTime]);

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
      const cleanup = await screenLockDetector.init({
        onLock: () => {
          console.log('[TimeTracker] Screen locked - timer paused at:', currentScreenActiveRef.current);
          // Only start tracking if not already locked (prevent duplicate lock events)
          if (!isLockedRef.current) {
            screenActiveAtLockRef.current = currentScreenActiveRef.current;
            lockStartTimeRef.current = Date.now();
            lockEventIdRef.current = Date.now(); // Unique ID for this lock event
            isLockedRef.current = true;
            inactiveTimeReportedRef.current = false; // Reset the reported flag
            console.log('[TimeTracker] Lock event started with ID:', lockEventIdRef.current);

            // Persist lock state to localStorage and notify service worker
            const lockState = {
              isLocked: true,
              lockStartTime: lockStartTimeRef.current,
              sessionDate: sessionRef.current?.date,
              savedAt: Date.now()
            };
            localStorage.setItem('timeTracker_lockState', JSON.stringify(lockState));
            notifyServiceWorker('SET_LOCK_STATE', lockState);
          }
          setIsScreenLocked(true);
        },

        onUnlock: (duration) => {
          console.log('[TimeTracker] Screen unlocked - was locked for', duration, 's');
          console.log('[TimeTracker] Screen active at lock was:', screenActiveAtLockRef.current);
          console.log('[TimeTracker] Already reported?', inactiveTimeReportedRef.current);

          // Skip if already reported (prevents double-counting from sleep/wake + lock/unlock)
          if (inactiveTimeReportedRef.current) {
            console.log('[TimeTracker] Skipping unlock - inactive time already reported for this lock event');
            // Just clear the lock state
            lockStartTimeRef.current = null;
            lockEventIdRef.current = null;
            isLockedRef.current = false;
            setIsScreenLocked(false);
            return;
          }

          // Calculate actual lock duration from our client-side tracking
          let actualDuration = duration;
          if (lockStartTimeRef.current) {
            actualDuration = Math.floor((Date.now() - lockStartTimeRef.current) / 1000);
            console.log('[TimeTracker] Client-side lock duration:', actualDuration, 's');
          }

          // Use the larger of the two durations (detector vs client-side)
          const finalDuration = Math.max(duration, actualDuration);

          // Mark as reported to prevent duplicate reports
          inactiveTimeReportedRef.current = true;

          // Add lock time to pending (to prevent time jump during API call)
          if (finalDuration > 0) {
            pendingInactiveSecondsRef.current += finalDuration;
            console.log('[TimeTracker] Pending inactive seconds:', pendingInactiveSecondsRef.current);
          }

          // Add lock time to server
          if (finalDuration > 0 && sessionRef.current?.status === 'active') {
            const eventId = lockEventIdRef.current;
            attendanceService.addInactiveTime({ inactive_seconds_to_add: finalDuration })
              .then(() => {
                console.log('[TimeTracker] Added', finalDuration, 's to Lock/Sleep on server (event:', eventId, ')');
                fetchCurrentSession();
              })
              .catch(err => {
                console.error('[TimeTracker] Failed to add inactive time:', err);
                // Revert pending on error
                pendingInactiveSecondsRef.current = Math.max(0, pendingInactiveSecondsRef.current - finalDuration);
                // Also reset reported flag so it can retry
                inactiveTimeReportedRef.current = false;
              });
          }

          // Clear lock tracking
          lockStartTimeRef.current = null;
          lockEventIdRef.current = null;
          isLockedRef.current = false;
          setIsScreenLocked(false);

          // Clear persisted lock state
          localStorage.removeItem('timeTracker_lockState');
          notifyServiceWorker('SET_LOCK_STATE', { isLocked: false });
        },

        onSleep: () => {
          console.log('[TimeTracker] System sleep detected at:', currentScreenActiveRef.current);
          // Only start tracking if not already locked (screen lock already captures this)
          if (!isLockedRef.current) {
            screenActiveAtLockRef.current = currentScreenActiveRef.current;
            lockStartTimeRef.current = Date.now();
            lockEventIdRef.current = Date.now();
            isLockedRef.current = true;
            inactiveTimeReportedRef.current = false;
            console.log('[TimeTracker] Sleep event started with ID:', lockEventIdRef.current);

            // Persist lock state to localStorage and notify service worker
            const lockState = {
              isLocked: true,
              lockStartTime: lockStartTimeRef.current,
              sessionDate: sessionRef.current?.date,
              savedAt: Date.now()
            };
            localStorage.setItem('timeTracker_lockState', JSON.stringify(lockState));
            notifyServiceWorker('SET_LOCK_STATE', lockState);
          }
          setIsScreenLocked(true);
        },

        onWake: (duration) => {
          console.log('[TimeTracker] System wake - was sleeping for', duration, 's');
          console.log('[TimeTracker] Screen active at sleep was:', screenActiveAtLockRef.current);
          console.log('[TimeTracker] Already reported?', inactiveTimeReportedRef.current);

          // Skip if already reported (prevents double-counting from sleep/wake + lock/unlock)
          if (inactiveTimeReportedRef.current) {
            console.log('[TimeTracker] Skipping wake - inactive time already reported for this lock event');
            // Just clear the lock state
            lockStartTimeRef.current = null;
            lockEventIdRef.current = null;
            isLockedRef.current = false;
            setIsScreenLocked(false);
            return;
          }

          // Calculate actual sleep duration from our client-side tracking
          let actualDuration = duration;
          if (lockStartTimeRef.current) {
            actualDuration = Math.floor((Date.now() - lockStartTimeRef.current) / 1000);
            console.log('[TimeTracker] Client-side sleep duration:', actualDuration, 's');
          }

          // Use the larger of the two durations
          const finalDuration = Math.max(duration, actualDuration);

          // Mark as reported to prevent duplicate reports
          inactiveTimeReportedRef.current = true;

          // Add sleep time to pending (to prevent time jump during API call)
          if (finalDuration > 0) {
            pendingInactiveSecondsRef.current += finalDuration;
            console.log('[TimeTracker] Pending inactive seconds:', pendingInactiveSecondsRef.current);
          }

          // Add sleep time to server
          if (finalDuration > 0 && sessionRef.current?.status === 'active') {
            const eventId = lockEventIdRef.current;
            attendanceService.addInactiveTime({ inactive_seconds_to_add: finalDuration })
              .then(() => {
                console.log('[TimeTracker] Added', finalDuration, 's sleep time on server (event:', eventId, ')');
                fetchCurrentSession();
              })
              .catch(err => {
                console.error('[TimeTracker] Failed to add sleep time:', err);
                // Revert pending on error
                pendingInactiveSecondsRef.current = Math.max(0, pendingInactiveSecondsRef.current - finalDuration);
                // Also reset reported flag so it can retry
                inactiveTimeReportedRef.current = false;
              });
          }

          // Clear lock tracking
          lockStartTimeRef.current = null;
          lockEventIdRef.current = null;
          isLockedRef.current = false;
          setIsScreenLocked(false);

          // Clear persisted lock state
          localStorage.removeItem('timeTracker_lockState');
          notifyServiceWorker('SET_LOCK_STATE', { isLocked: false });
        },

        onError: (err) => {
          console.error('[TimeTracker] Detector error:', err);
        }
      });

      detectorCleanupRef.current = cleanup;
      detectorInitializedRef.current = true;
      console.log('[TimeTracker] Screen lock detector initialized');
    };

    initDetector();
  }, [session?.status, fetchCurrentSession, notifyServiceWorker]);

  // Track user activity (mouse movement, keyboard, clicks, touch)
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

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

  // Send heartbeat to server
  const sendHeartbeat = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.status !== 'active') {
      return;
    }

    const isLocked = screenLockDetector.isLocked();

    try {
      await attendanceService.sendHeartbeat({
        timestamp: new Date().toISOString(),
        is_active: !isLocked,
        screen_locked: isLocked
      });
      setHeartbeatActive(true);
      console.log('[Heartbeat] Sent at', new Date().toLocaleTimeString(), '- locked:', isLocked);
    } catch (error) {
      console.log('[Heartbeat] Failed (will retry):', error.message || 'Network error');
      setHeartbeatActive(false);
    }
  }, []);

  // Heartbeat management
  useEffect(() => {
    if (session && session.status === 'active') {
      console.log('[Heartbeat] Starting...');
      sendHeartbeat();

      const token = localStorage.getItem('token');
      if (token) {
        notifyServiceWorker('SET_AUTH_TOKEN', { token });
        notifyServiceWorker('SET_SESSION_ACTIVE', { active: true });
      }

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
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      setHeartbeatActive(false);
      notifyServiceWorker('SET_SESSION_ACTIVE', { active: false });
      releaseWakeLock();
    }
  }, [session?.status, sendHeartbeat, notifyServiceWorker, requestWakeLock, releaseWakeLock]);

  // Handle visibility change - refresh session when page becomes visible
  // IMPORTANT: Tab switch/minimize does NOT add inactive time - only screen lock/sleep does
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden && sessionRef.current?.status === 'active') {
        console.log('[TimeTracker] Page visible - refreshing session');

        // Only recover inactive time from TRUE app close (beforeunload)
        // Tab switches should NOT add inactive time - timer keeps running
        // The appCloseState is set in beforeunload and recoverAppCloseTime handles initial load
        // Here we just clear any stale visibility-based state and refresh

        // If screen was locked when hidden, the lock detector handles that via onUnlock
        // We don't double-count here

        requestWakeLock();
        sendHeartbeat();
        fetchCurrentSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendHeartbeat, requestWakeLock, fetchCurrentSession]);

  // Send final heartbeat and persist app close time on page unload
  // IMPORTANT: Only beforeunload saves close state - NOT visibility changes (tab switch)
  // Tab switch/minimize keeps the timer running - timer only pauses on screen lock/sleep
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionRef.current?.status === 'active') {
        const token = localStorage.getItem('token');
        const now = Date.now();

        // Save app close state for recovery when app reopens
        // CRITICAL: We need to know if screen was locked when app closed
        // - If screen was ACTIVE: Screen Active timer keeps running (no inactive time)
        // - If screen was LOCKED: Lock/Sleep timer keeps running (add to inactive time)
        const appCloseState = {
          closeTime: now,
          sessionDate: sessionRef.current?.date,
          wasLocked: isLockedRef.current,
          lockStartTime: isLockedRef.current ? lockStartTimeRef.current : null,
          isAppClose: true
        };
        localStorage.setItem('timeTracker_appCloseState', JSON.stringify(appCloseState));
        console.log('[TimeTracker] Saved app close state:', appCloseState);
        console.log('[TimeTracker] Screen was', isLockedRef.current ? 'LOCKED' : 'ACTIVE', 'when app closed');

        // Clear the separate lock state to avoid double-counting
        localStorage.removeItem('timeTracker_lockState');

        if (token) {
          const apiBase = 'https://fastapi-project-management-production-22e0.up.railway.app';

          // Send final heartbeat
          const heartbeatData = JSON.stringify({
            timestamp: new Date().toISOString(),
            is_active: !isLockedRef.current,
            is_closing: true,
            screen_locked: isLockedRef.current,
            token: token
          });
          navigator.sendBeacon(
            `${apiBase}/attendance/heartbeat`,
            new Blob([heartbeatData], { type: 'application/json' })
          );
        }
      }
    };

    // DO NOT save state on visibility change - tab switch/minimize should NOT add inactive time
    // Timer keeps running even when tab is in background or minimized
    // Only screen lock/sleep pauses the timer (handled by screenLockDetector)

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Reset and refetch session when user changes
  useEffect(() => {
    setSession(null);
    setScreenActiveSeconds(0);
    setLockSleepSeconds(0);
    setHeartbeatActive(false);
    setIsScreenLocked(false);
    sessionRef.current = null;
    pendingInactiveSecondsRef.current = 0;
    lastConfirmedInactiveRef.current = 0;
    lockStartTimeRef.current = null;
    isLockedRef.current = false;
    currentScreenActiveRef.current = 0;
    screenActiveAtLockRef.current = 0;
    lockEventIdRef.current = null;
    inactiveTimeReportedRef.current = false;

    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchCurrentSession(true); // Initial load - check for lock state recovery
  }, [user?.id, dataVersion, fetchCurrentSession]);

  // Cleanup detector callbacks on unmount
  useEffect(() => {
    return () => {
      if (detectorInitializedRef.current && detectorCleanupRef.current) {
        // Remove our callbacks but don't destroy the detector
        // since ScreenActiveTime might still be using it
        detectorCleanupRef.current();
        detectorCleanupRef.current = null;
        detectorInitializedRef.current = false;
      }
    };
  }, []);

  // Calculate screen active time and lock/sleep time every second
  useEffect(() => {
    let interval;
    if (session && (session.status === 'active' || session.status === 'on_break')) {
      const calculateTimes = () => {
        try {
          let loginTime;
          if (session.login_time) {
            loginTime = dayjs.utc(session.login_time).isValid()
              ? dayjs.utc(session.login_time).tz('Asia/Kolkata')
              : dayjs(session.login_time).tz('Asia/Kolkata');
          } else {
            setScreenActiveSeconds(0);
            setLockSleepSeconds(0);
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
                const breakStart = dayjs.utc(b.start_time).isValid()
                  ? dayjs.utc(b.start_time).tz('Asia/Kolkata')
                  : dayjs(b.start_time).tz('Asia/Kolkata');
                breakSeconds += Math.max(0, now.diff(breakStart, 'second'));
              }
            });
          }

          // Get inactive seconds (lock/sleep time) from session (already saved to server)
          const savedInactiveSeconds = session.inactive_seconds || 0;

          // Check if server has confirmed the pending inactive seconds
          // If savedInactiveSeconds increased, clear the corresponding pending amount
          if (savedInactiveSeconds > lastConfirmedInactiveRef.current) {
            const confirmedAmount = savedInactiveSeconds - lastConfirmedInactiveRef.current;
            pendingInactiveSecondsRef.current = Math.max(0, pendingInactiveSecondsRef.current - confirmedAmount);
            lastConfirmedInactiveRef.current = savedInactiveSeconds;
            console.log('[TimeTracker] Server confirmed inactive time. Saved:', savedInactiveSeconds, 'Pending:', pendingInactiveSecondsRef.current);
          }

          // Check if screen is currently locked
          // Only use isLockedRef which we control directly from callbacks
          const isCurrentlyLocked = isLockedRef.current;

          // Calculate current lock duration from our client-side tracking
          let currentLockDur = 0;
          if (isCurrentlyLocked && lockStartTimeRef.current) {
            currentLockDur = Math.floor((Date.now() - lockStartTimeRef.current) / 1000);
          }
          // Note: We don't use screenLockDetector.getCurrentLockDuration() here
          // because it might be out of sync with our state

          // Total lock/sleep time = saved + pending (not yet confirmed) + current ongoing lock
          const totalLockSleepSecs = savedInactiveSeconds + pendingInactiveSecondsRef.current + currentLockDur;
          setLockSleepSeconds(totalLockSleepSecs);

          // Update screen locked state for UI
          setIsScreenLocked(isCurrentlyLocked);

          // Screen Active Time = total elapsed - breaks - lock/sleep time
          // This naturally "freezes" during lock because currentLockDur grows at same rate as totalSeconds
          const activeSeconds = Math.max(0, totalSeconds - breakSeconds - totalLockSleepSecs);

          // Save current value for reference
          currentScreenActiveRef.current = activeSeconds;

          setScreenActiveSeconds(activeSeconds);
          setCurrentSystemTime(now);
        } catch (error) {
          console.error('[TimeTracker] Error calculating times:', error);
          // Don't reset to 0 on error - keep previous values
        }
      };

      calculateTimes();
      interval = setInterval(calculateTimes, 1000);
    } else {
      setScreenActiveSeconds(0);
      setLockSleepSeconds(0);
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
      notifyServiceWorker('CLEAR_SESSION', {});
      message.success('Clocked out successfully!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to clock out');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBreak = async () => {
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
        <Col xs={24} md={5}>
          <Statistic
            title={
              <span>
                Screen Active Time{' '}
                {session?.status === 'active' && (
                  <Tag color={isScreenLocked ? 'red' : 'green'} style={{ fontSize: '10px', marginLeft: 4 }}>
                    {isScreenLocked ? 'PAUSED' : 'RUNNING'}
                  </Tag>
                )}
              </span>
            }
            value={formatTime(Math.max(0, screenActiveSeconds))}
            prefix={<ClockCircleOutlined />}
            styles={{ value: { fontSize: 24, color: isScreenLocked ? '#ff4d4f' : (session?.status === 'active' ? '#52c41a' : '#1890ff') } }}
          />
        </Col>
        <Col xs={24} md={5}>
          <Statistic
            title={
              <span>
                Lock/Sleep Time{' '}
                {isScreenLocked && session?.status === 'active' && (
                  <Tag color="orange" style={{ fontSize: '10px', marginLeft: 4 }}>
                    RUNNING
                  </Tag>
                )}
              </span>
            }
            value={formatTime(lockSleepSeconds)}
            prefix={<LockOutlined />}
            styles={{ value: { fontSize: 24, color: isScreenLocked ? '#faad14' : '#8c8c8c' } }}
          />
        </Col>
        <Col xs={24} md={4}>
          <Statistic
            title="Break Time"
            value={(() => {
              if (!session) return '0 min';
              let totalMins = session.total_break_minutes || 0;
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
        <Col xs={24} md={10}>
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
      {session?.status === 'active' && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {isScreenLocked
              ? '⏸️ Screen Active timer is PAUSED. Lock/Sleep timer is running. Timer will resume when you unlock your screen.'
              : '▶️ Screen Active timer is RUNNING. It will pause automatically when your screen locks or goes to sleep. Tab minimize/switch does NOT pause the timer.'}
          </Text>
        </div>
      )}

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
