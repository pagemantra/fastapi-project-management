import { useEffect, useCallback, useRef } from 'react';

/**
 * useElectron - Hook to interact with Electron APIs
 *
 * This hook provides access to native OS features when running in Electron:
 * - Screen lock/unlock detection
 * - System suspend/resume detection
 * - Session persistence
 * - Close prevention
 *
 * When running in browser (PWA), these features fall back to browser APIs
 */

// Check if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

// Main hook for Electron integration
export const useElectron = ({
  onScreenLock,
  onScreenUnlock,
  onSystemSuspend,
  onSystemResume,
  onSystemShutdown,
} = {}) => {
  const cleanupFns = useRef([]);

  useEffect(() => {
    if (!isElectron()) {
      console.log('[useElectron] Not running in Electron, skipping native setup');
      return;
    }

    console.log('[useElectron] Setting up Electron event listeners');

    // Screen lock events
    if (onScreenLock || onScreenUnlock) {
      const cleanup = window.electronAPI.onScreenLockChanged((data) => {
        console.log('[useElectron] Screen lock changed:', data);
        if (data.isLocked && onScreenLock) {
          onScreenLock(data);
        } else if (!data.isLocked && onScreenUnlock) {
          onScreenUnlock(data);
        }
      });
      cleanupFns.current.push(cleanup);
    }

    // System suspend
    if (onSystemSuspend) {
      const cleanup = window.electronAPI.onSystemSuspend((data) => {
        console.log('[useElectron] System suspend:', data);
        onSystemSuspend(data);
      });
      cleanupFns.current.push(cleanup);
    }

    // System resume
    if (onSystemResume) {
      const cleanup = window.electronAPI.onSystemResume((data) => {
        console.log('[useElectron] System resume:', data);
        onSystemResume(data);
      });
      cleanupFns.current.push(cleanup);
    }

    // System shutdown
    if (onSystemShutdown) {
      const cleanup = window.electronAPI.onSystemShutdown((data) => {
        console.log('[useElectron] System shutdown:', data);
        onSystemShutdown(data);
      });
      cleanupFns.current.push(cleanup);
    }

    return () => {
      cleanupFns.current.forEach(fn => fn && fn());
      cleanupFns.current = [];
    };
  }, [onScreenLock, onScreenUnlock, onSystemSuspend, onSystemResume, onSystemShutdown]);

  // Set clock status
  const setClockStatus = useCallback((isClockedIn) => {
    if (isElectron()) {
      window.electronAPI.setClockStatus(isClockedIn);
    }
  }, []);

  // Get session data
  const getSessionData = useCallback(async () => {
    if (isElectron()) {
      return await window.electronAPI.getSessionData();
    }
    return null;
  }, []);

  // Save session data
  const saveSessionData = useCallback((data) => {
    if (isElectron()) {
      window.electronAPI.saveSessionData(data);
    }
  }, []);

  // Clear session data
  const clearSessionData = useCallback(() => {
    if (isElectron()) {
      window.electronAPI.clearSessionData();
    }
  }, []);

  // Check for unexpected shutdown
  const checkUnexpectedShutdown = useCallback(async () => {
    if (isElectron()) {
      return await window.electronAPI.checkUnexpectedShutdown();
    }
    return { hadUnexpectedShutdown: false };
  }, []);

  // Get current lock state
  const getLockState = useCallback(async () => {
    if (isElectron()) {
      return await window.electronAPI.getLockState();
    }
    return { isLocked: false, isSuspended: false };
  }, []);

  // Minimize to tray
  const minimizeToTray = useCallback(() => {
    if (isElectron()) {
      window.electronAPI.minimizeToTray();
    }
  }, []);

  return {
    isElectron: isElectron(),
    setClockStatus,
    getSessionData,
    saveSessionData,
    clearSessionData,
    checkUnexpectedShutdown,
    getLockState,
    minimizeToTray,
  };
};

export default useElectron;
