import { useEffect, useRef, useCallback } from 'react';
import { attendanceService } from '../api/services';

// Heartbeat interval in milliseconds (10 seconds)
const HEARTBEAT_INTERVAL = 10000;

// Heartbeat service hook - tracks screen active time via server heartbeats
const useHeartbeat = (session, isAuthenticated) => {
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatRef = useRef(null);
  const isVisibleRef = useRef(true);

  // Send heartbeat to server
  const sendHeartbeat = useCallback(async () => {
    if (!session || session.status !== 'active') {
      return;
    }

    try {
      const now = Date.now();
      await attendanceService.sendHeartbeat({
        timestamp: new Date().toISOString(),
        is_visible: isVisibleRef.current
      });
      lastHeartbeatRef.current = now;
      console.log('[Heartbeat] Sent at', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('[Heartbeat] Failed to send:', error);
    }
  }, [session]);

  // Start heartbeat tracking
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    console.log('[Heartbeat] Started tracking');
  }, [sendHeartbeat]);

  // Stop heartbeat tracking
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    console.log('[Heartbeat] Stopped tracking');
  }, []);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      console.log('[Heartbeat] Visibility changed:', isVisibleRef.current ? 'visible' : 'hidden');

      // Send heartbeat immediately on visibility change
      if (session && session.status === 'active') {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, sendHeartbeat]);

  // Start/stop heartbeat based on session status
  useEffect(() => {
    if (isAuthenticated && session && session.status === 'active') {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }

    return () => {
      stopHeartbeat();
    };
  }, [isAuthenticated, session, startHeartbeat, stopHeartbeat]);

  // Send final heartbeat on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (session && session.status === 'active') {
        // Use sendBeacon for reliable delivery on page unload
        const token = localStorage.getItem('token');
        if (token) {
          const data = JSON.stringify({
            timestamp: new Date().toISOString(),
            is_visible: false,
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
  }, [session]);

  return {
    lastHeartbeat: lastHeartbeatRef.current,
    isTracking: !!heartbeatIntervalRef.current
  };
};

export default useHeartbeat;
