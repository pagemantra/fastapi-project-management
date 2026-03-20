/**
 * Electron Bridge - Unified API for both Electron and Browser environments
 *
 * This module provides a consistent interface for:
 * - Screen lock/sleep detection
 * - Session persistence
 * - Close prevention
 *
 * In Electron: Uses native OS APIs via IPC
 * In Browser: Falls back to existing PWA methods (IdleDetector, Page Lifecycle, etc.)
 */

// Check if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

// Initialize screen lock detection
export const initLockDetection = (callbacks) => {
  const { onLock, onUnlock, onSuspend, onResume } = callbacks;

  if (isElectron()) {
    console.log('[ElectronBridge] Using native Electron lock detection');

    const cleanupFns = [];

    // Screen lock/unlock
    const lockCleanup = window.electronAPI.onScreenLockChanged((data) => {
      console.log('[ElectronBridge] Screen lock event:', data);
      if (data.isLocked) {
        onLock && onLock({ timestamp: data.timestamp });
      } else {
        onUnlock && onUnlock({
          timestamp: data.timestamp,
          lockDuration: data.lockDuration
        });
      }
    });
    cleanupFns.push(lockCleanup);

    // System suspend/resume
    const suspendCleanup = window.electronAPI.onSystemSuspend((data) => {
      console.log('[ElectronBridge] System suspend:', data);
      onSuspend && onSuspend(data);
    });
    cleanupFns.push(suspendCleanup);

    const resumeCleanup = window.electronAPI.onSystemResume((data) => {
      console.log('[ElectronBridge] System resume:', data);
      onResume && onResume(data);
    });
    cleanupFns.push(resumeCleanup);

    return () => {
      cleanupFns.forEach(fn => fn && fn());
    };
  } else {
    // Browser fallback - use existing screenLockDetector
    console.log('[ElectronBridge] Using browser lock detection (IdleDetector/Page Lifecycle)');
    // Return no-op - browser detection is handled by screenLockDetector.js
    return () => {};
  }
};

// Notify clock status (for close prevention)
export const setClockStatus = (isClockedIn) => {
  if (isElectron()) {
    window.electronAPI.setClockStatus(isClockedIn);
    console.log('[ElectronBridge] Clock status updated:', isClockedIn);
  }
};

// Get lock state
export const getLockState = async () => {
  if (isElectron()) {
    return await window.electronAPI.getLockState();
  }
  return { isLocked: false, isSuspended: false };
};

// Session data management
export const saveSessionData = (data) => {
  if (isElectron()) {
    window.electronAPI.saveSessionData(data);
  }
  // Also save to localStorage as backup
  try {
    localStorage.setItem('timeTracker_electronSession', JSON.stringify(data));
  } catch (e) {
    console.error('[ElectronBridge] Failed to save to localStorage:', e);
  }
};

export const getSessionData = async () => {
  if (isElectron()) {
    return await window.electronAPI.getSessionData();
  }
  // Fallback to localStorage
  try {
    const data = localStorage.getItem('timeTracker_electronSession');
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const clearSessionData = () => {
  if (isElectron()) {
    window.electronAPI.clearSessionData();
  }
  localStorage.removeItem('timeTracker_electronSession');
};

// Check for unexpected shutdown
export const checkUnexpectedShutdown = async () => {
  if (isElectron()) {
    return await window.electronAPI.checkUnexpectedShutdown();
  }
  // Browser fallback - check localStorage
  const shutdownState = localStorage.getItem('timeTracker_unexpectedClose');
  if (shutdownState) {
    localStorage.removeItem('timeTracker_unexpectedClose');
    try {
      return { hadUnexpectedShutdown: true, ...JSON.parse(shutdownState) };
    } catch (e) {
      return { hadUnexpectedShutdown: false };
    }
  }
  return { hadUnexpectedShutdown: false };
};

// Minimize to tray (Electron only)
export const minimizeToTray = () => {
  if (isElectron()) {
    window.electronAPI.minimizeToTray();
    return true;
  }
  return false;
};

// Get app version
export const getAppVersion = () => {
  if (isElectron()) {
    return window.electronAPI.getAppVersion();
  }
  return 'PWA';
};

// Get platform info
export const getPlatform = () => {
  if (isElectron()) {
    return {
      isElectron: true,
      platform: window.electronAPI.platform,
      version: getAppVersion()
    };
  }
  return {
    isElectron: false,
    platform: 'browser',
    version: 'PWA'
  };
};

export default {
  isElectron,
  initLockDetection,
  setClockStatus,
  getLockState,
  saveSessionData,
  getSessionData,
  clearSessionData,
  checkUnexpectedShutdown,
  minimizeToTray,
  getAppVersion,
  getPlatform
};
