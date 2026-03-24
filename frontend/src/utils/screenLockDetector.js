/**
 * Screen Lock & Sleep Detector for PWA and Electron
 *
 * This utility provides robust detection of screen lock and system sleep events
 * using multiple APIs with proper fallback mechanisms:
 *
 * FOR ELECTRON (Native):
 * - Uses Electron's powerMonitor for lock-screen/unlock-screen events
 * - Uses suspend/resume events for system sleep
 * - These are 100% reliable native OS events
 *
 * FOR PWA/Browser:
 * 1. IdleDetector API (Chrome 94+) - Native screen lock detection
 *    - Maps to Windows WM_WTSSESSION_CHANGE (WTS_SESSION_LOCK/UNLOCK)
 *    - Provides screenState: 'locked' | 'unlocked'
 *
 * 2. Page Lifecycle API - Detects freeze/resume (system sleep/hibernate)
 *    - 'freeze' event fires when system suspends CPU
 *    - 'resume' event fires when system wakes
 *
 * 3. Heartbeat Gap Detection - Fallback for browsers without IdleDetector
 *    - Detects sleep by comparing expected vs actual heartbeat timing
 *    - When JS freezes (sleep), heartbeat gap >> expected interval
 *
 * References:
 * - Windows API: https://learn.microsoft.com/en-us/windows/win32/termserv/wm-wtssession-change
 * - IdleDetector: https://developer.chrome.com/docs/capabilities/web-apis/idle-detection
 * - Page Lifecycle: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
 * - Electron powerMonitor: https://www.electronjs.org/docs/latest/api/power-monitor
 */

// Constants
const IDLE_THRESHOLD_MS = 60000; // Minimum for IdleDetector (1 minute)
const HEARTBEAT_INTERVAL_MS = 5000; // Heartbeat check interval
const SLEEP_DETECTION_BUFFER_MS = 15000; // Buffer to account for browser throttling
const MIN_SLEEP_DURATION_MS = 10000; // Minimum 10 seconds to count as sleep

// Check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

/**
 * Screen Lock Detector Class
 * Provides unified interface for detecting screen lock and system sleep
 */
class ScreenLockDetector {
  constructor() {
    this.isInitialized = false;
    this.isScreenLocked = false;
    this.screenLockStartTime = null;
    this.lastHeartbeatTime = Date.now();
    this.pageHiddenTime = null;
    this.isFrozen = false;
    this.freezeStartTime = null;

    // Callbacks - now supports multiple listeners
    this.lockCallbacks = [];
    this.unlockCallbacks = [];
    this.sleepCallbacks = [];
    this.wakeCallbacks = [];
    this.onError = null;

    // API availability
    this.idleDetectorAvailable = false;
    this.idleDetector = null;
    this.abortController = null;

    // Heartbeat interval
    this.heartbeatInterval = null;

    // Event deduplication - track current lock event
    this.currentLockEventId = null;
    this.lastUnlockTime = 0;
    this.UNLOCK_DEBOUNCE_MS = 500; // Minimum time between unlock events
  }

  /**
   * Initialize the detector with callbacks
   * @param {Object} options - Configuration options
   * @param {Function} options.onLock - Called when screen locks
   * @param {Function} options.onUnlock - Called when screen unlocks, receives duration in seconds
   * @param {Function} options.onSleep - Called when system sleeps
   * @param {Function} options.onWake - Called when system wakes, receives duration in seconds
   * @param {Function} options.onError - Called on errors
   * @returns {Function} Cleanup function to remove the registered callbacks
   */
  async init(options = {}) {
    // Register callbacks (supports multiple listeners)
    const lockCallback = options.onLock || (() => {});
    const unlockCallback = options.onUnlock || (() => {});
    const sleepCallback = options.onSleep || (() => {});
    const wakeCallback = options.onWake || (() => {});

    this.lockCallbacks.push(lockCallback);
    this.unlockCallbacks.push(unlockCallback);
    this.sleepCallbacks.push(sleepCallback);
    this.wakeCallbacks.push(wakeCallback);
    this.onError = options.onError || ((err) => console.error('[ScreenLockDetector] Error:', err));

    // Only initialize detection methods once
    if (!this.isInitialized) {
      // Check if running in Electron - use native APIs
      if (isElectron()) {
        console.log('[ScreenLockDetector] Running in Electron - using native APIs');
        this.initElectronDetection();
        this.isInitialized = true;
        console.log('[ScreenLockDetector] Initialized with Electron native detection');
      } else {
        // PWA/Browser mode - use browser APIs
        await this.initIdleDetector();
        this.initPageLifecycleDetection();
        this.initVisibilityDetection();
        this.startHeartbeat();

        this.isInitialized = true;
        console.log('[ScreenLockDetector] Initialized with:', {
          idleDetector: this.idleDetectorAvailable,
          pageLifecycle: 'onfreeze' in document,
          visibility: true,
          heartbeat: true
        });
      }
    } else {
      console.log('[ScreenLockDetector] Already initialized, added new callbacks');
    }

    // Return cleanup function
    return () => {
      this.lockCallbacks = this.lockCallbacks.filter(cb => cb !== lockCallback);
      this.unlockCallbacks = this.unlockCallbacks.filter(cb => cb !== unlockCallback);
      this.sleepCallbacks = this.sleepCallbacks.filter(cb => cb !== sleepCallback);
      this.wakeCallbacks = this.wakeCallbacks.filter(cb => cb !== wakeCallback);
    };
  }

  /**
   * Initialize IdleDetector API (Chrome 94+)
   * This maps to Windows WTS_SESSION_LOCK/UNLOCK events
   */
  async initIdleDetector() {
    // Check if IdleDetector is available
    if (typeof window === 'undefined' || !('IdleDetector' in window)) {
      console.log('[ScreenLockDetector] IdleDetector not supported - using fallback');
      return;
    }

    try {
      // Check if permission is already granted (avoid requesting without user gesture)
      let permission = 'prompt';
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'idle-detection' });
        permission = permissionStatus.state;
        console.log('[ScreenLockDetector] IdleDetector permission state:', permission);
      } catch (e) {
        console.log('[ScreenLockDetector] Cannot query idle-detection permission:', e.message);
      }

      // Only request permission if not already denied
      if (permission === 'denied') {
        console.log('[ScreenLockDetector] IdleDetector permission already denied');
        return;
      }

      // Request permission if needed (will show browser prompt)
      if (permission === 'prompt') {
        console.log('[ScreenLockDetector] Requesting IdleDetector permission...');
        try {
          const result = await IdleDetector.requestPermission();
          console.log('[ScreenLockDetector] IdleDetector permission result:', result);
          if (result !== 'granted') {
            console.log('[ScreenLockDetector] IdleDetector permission not granted - using fallback');
            return;
          }
        } catch (e) {
          console.log('[ScreenLockDetector] IdleDetector permission request failed:', e.message);
          return;
        }
      }

      // Permission is granted, proceed with initialization
      // Create abort controller for cleanup
      this.abortController = new AbortController();
      this.idleDetector = new IdleDetector();

      // Listen for state changes
      this.idleDetector.addEventListener('change', () => {
        if (!this.idleDetector) return;

        const { screenState, userState } = this.idleDetector;
        console.log('[ScreenLockDetector] IdleDetector state:', { screenState, userState });

        if (screenState === 'locked') {
          this.handleScreenLock('idleDetector');
        } else if (screenState === 'unlocked') {
          this.handleScreenUnlock('idleDetector');
        }
      });

      // Start detection with minimum threshold
      await this.idleDetector.start({
        threshold: IDLE_THRESHOLD_MS,
        signal: this.abortController.signal
      });

      this.idleDetectorAvailable = true;
      console.log('[ScreenLockDetector] IdleDetector started successfully');
    } catch (error) {
      console.log('[ScreenLockDetector] IdleDetector error:', error.message);
      this.idleDetectorAvailable = false;
    }
  }

  /**
   * Initialize Page Lifecycle API detection (freeze/resume)
   * Detects system sleep/hibernate
   */
  initPageLifecycleDetection() {
    // Freeze event - fires when system suspends CPU (sleep/hibernate)
    document.addEventListener('freeze', () => {
      console.log('[ScreenLockDetector] Page FROZEN (system sleep/hibernate)');
      this.isFrozen = true;
      this.freezeStartTime = Date.now();
      // Call all registered sleep callbacks
      this.sleepCallbacks.forEach(cb => {
        try {
          cb();
        } catch (err) {
          console.error('[ScreenLockDetector] Sleep callback error:', err);
        }
      });
    });

    // Resume event - fires when system wakes
    document.addEventListener('resume', () => {
      console.log('[ScreenLockDetector] Page RESUMED (system wake)');
      if (this.isFrozen && this.freezeStartTime) {
        const sleepDuration = Math.floor((Date.now() - this.freezeStartTime) / 1000);
        console.log('[ScreenLockDetector] System was sleeping for', sleepDuration, 'seconds');
        // Call all registered wake callbacks
        this.wakeCallbacks.forEach(cb => {
          try {
            cb(sleepDuration);
          } catch (err) {
            console.error('[ScreenLockDetector] Wake callback error:', err);
          }
        });
      }
      this.isFrozen = false;
      this.freezeStartTime = null;
    });
  }

  /**
   * Initialize Visibility API detection
   * Used as part of heartbeat gap detection for sleep
   */
  initVisibilityDetection() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pageHiddenTime = Date.now();
        console.log('[ScreenLockDetector] Page hidden at', new Date().toLocaleTimeString());
      } else {
        this.handlePageVisible();
      }
    });
  }

  /**
   * Handle page becoming visible
   * IMPORTANT: This does NOT trigger inactive time for normal tab switches
   * Only detects actual sleep via heartbeat gap when IdleDetector is not available
   *
   * The key insight: When tab is hidden but JS keeps running (tab switch/minimize),
   * the heartbeat continues. When system sleeps, JS freezes so heartbeat gap >> hidden time.
   */
  handlePageVisible() {
    const now = Date.now();
    const hiddenDuration = this.pageHiddenTime ? now - this.pageHiddenTime : 0;
    const heartbeatGap = now - this.lastHeartbeatTime;

    console.log('[ScreenLockDetector] Page visible - hidden:',
      Math.floor(hiddenDuration / 1000), 's, heartbeat gap:',
      Math.floor(heartbeatGap / 1000), 's');

    // Only use heartbeat gap detection if IdleDetector is not available
    // AND there's a significant unexpected gap (JS was frozen = actual sleep)
    if (!this.idleDetectorAvailable && this.pageHiddenTime) {
      // Calculate unexpected gap - if JS was running (tab switch), gap should roughly equal hidden time
      // If JS was frozen (sleep), gap will be much larger than expected
      const expectedGap = hiddenDuration + HEARTBEAT_INTERVAL_MS; // Hidden time + one interval
      const unexpectedGap = heartbeatGap - expectedGap;

      console.log('[ScreenLockDetector] Expected gap:', Math.floor(expectedGap / 1000), 's, Actual gap:',
        Math.floor(heartbeatGap / 1000), 's, Unexpected:', Math.floor(unexpectedGap / 1000), 's');

      // Only trigger sleep if there's a significant unexpected gap
      // This means JS was frozen (system sleep), not just tab hidden
      if (unexpectedGap > SLEEP_DETECTION_BUFFER_MS && heartbeatGap > MIN_SLEEP_DURATION_MS) {
        // JS was frozen for longer than expected - this is actual sleep
        const sleepDuration = Math.floor(unexpectedGap / 1000);

        console.log('[ScreenLockDetector] *** ACTUAL SLEEP DETECTED via heartbeat gap! Duration:', sleepDuration, 's ***');

        // Treat this as screen lock since we can't distinguish
        this.handleScreenLock('heartbeat');
        // Immediately unlock and report the duration
        setTimeout(() => {
          this.handleScreenUnlock('heartbeat', sleepDuration);
        }, 100);
      } else {
        console.log('[ScreenLockDetector] Tab switch detected (JS was running) - NO inactive time');
      }
    }

    this.pageHiddenTime = null;
    this.lastHeartbeatTime = now;
  }

  /**
   * Start heartbeat to track time and detect gaps
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.lastHeartbeatTime = Date.now();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Handle screen lock event
   * @param {string} source - Detection source (idleDetector, heartbeat)
   */
  handleScreenLock(source) {
    if (this.isScreenLocked) {
      console.log('[ScreenLockDetector] Already locked, ignoring lock event from:', source);
      return;
    }

    this.isScreenLocked = true;
    this.screenLockStartTime = Date.now();
    this.currentLockEventId = Date.now(); // Unique ID for this lock event
    console.log('[ScreenLockDetector] Screen LOCKED (source:', source, ') at', new Date().toLocaleTimeString(), 'eventId:', this.currentLockEventId);
    // Call all registered lock callbacks
    this.lockCallbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.error('[ScreenLockDetector] Lock callback error:', err);
      }
    });
  }

  /**
   * Handle screen unlock event
   * @param {string} source - Detection source
   * @param {number} overrideDuration - Override duration in seconds (for heartbeat detection)
   */
  handleScreenUnlock(source, overrideDuration = null) {
    // Debounce rapid unlock events
    const now = Date.now();
    if (now - this.lastUnlockTime < this.UNLOCK_DEBOUNCE_MS) {
      console.log('[ScreenLockDetector] Debouncing unlock event from:', source, '- too soon after last unlock');
      return;
    }

    if (!this.isScreenLocked && overrideDuration === null) {
      console.log('[ScreenLockDetector] Not locked, ignoring unlock event from:', source);
      return;
    }

    let lockDuration = 0;
    if (overrideDuration !== null) {
      lockDuration = overrideDuration;
    } else if (this.screenLockStartTime) {
      lockDuration = Math.floor((Date.now() - this.screenLockStartTime) / 1000);
    }

    const eventId = this.currentLockEventId;
    console.log('[ScreenLockDetector] Screen UNLOCKED (source:', source, ') - was locked for', lockDuration, 'seconds, eventId:', eventId);

    this.isScreenLocked = false;
    this.screenLockStartTime = null;
    this.currentLockEventId = null;
    this.lastUnlockTime = now;

    // Call all registered unlock callbacks
    this.unlockCallbacks.forEach(cb => {
      try {
        cb(lockDuration);
      } catch (err) {
        console.error('[ScreenLockDetector] Unlock callback error:', err);
      }
    });
  }

  /**
   * Get current lock state
   * @returns {Object} Current state
   */
  getState() {
    return {
      isScreenLocked: this.isScreenLocked,
      screenLockStartTime: this.screenLockStartTime,
      currentLockDuration: this.isScreenLocked && this.screenLockStartTime
        ? Math.floor((Date.now() - this.screenLockStartTime) / 1000)
        : 0,
      isFrozen: this.isFrozen,
      idleDetectorAvailable: this.idleDetectorAvailable
    };
  }

  /**
   * Get current lock duration in seconds (for real-time display)
   * @returns {number} Lock duration in seconds, 0 if not locked
   */
  getCurrentLockDuration() {
    if (this.isScreenLocked && this.screenLockStartTime) {
      return Math.floor((Date.now() - this.screenLockStartTime) / 1000);
    }
    return 0;
  }

  /**
   * Check if screen is currently locked
   * @returns {boolean} True if locked
   */
  isLocked() {
    return this.isScreenLocked;
  }

  /**
   * Check current screen state from IdleDetector (if available)
   * This can be used even before full initialization to get current state
   * @returns {Promise<{locked: boolean, available: boolean}>}
   */
  async checkCurrentScreenState() {
    // Check if IdleDetector is available and we have an active detector
    if (this.idleDetector && this.idleDetectorAvailable) {
      try {
        const { screenState } = this.idleDetector;
        return {
          locked: screenState === 'locked',
          available: true
        };
      } catch (e) {
        console.log('[ScreenLockDetector] Error reading IdleDetector state:', e);
      }
    }

    // If detector is initialized but using fallback methods
    if (this.isInitialized) {
      return {
        locked: this.isScreenLocked,
        available: true
      };
    }

    // Not initialized - can't determine state
    return {
      locked: false,
      available: false
    };
  }

  /**
   * Cleanup and stop detection
   */
  destroy() {
    console.log('[ScreenLockDetector] Destroying...');

    // Stop IdleDetector
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.idleDetector = null;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear all callbacks
    this.lockCallbacks = [];
    this.unlockCallbacks = [];
    this.sleepCallbacks = [];
    this.wakeCallbacks = [];

    this.isInitialized = false;
    this.idleDetectorAvailable = false;
  }

  /**
   * Initialize Electron-specific detection
   * Uses native powerMonitor events from Electron main process
   */
  initElectronDetection() {
    console.log('[ScreenLockDetector] Setting up Electron native detection');

    // Store cleanup functions
    this.electronCleanupFns = [];

    // Simple state tracking - Electron main.js does all the heavy lifting
    this.electronLockActive = false;

    // Screen lock/unlock events from Electron
    const lockCleanup = window.electronAPI.onScreenLockChanged((data) => {
      console.log('[ScreenLockDetector] Electron lock event:', data);

      if (data.isLocked) {
        // Screen locked - ALWAYS update state and call callbacks
        this.electronLockActive = true;
        this.isScreenLocked = true;
        this.screenLockStartTime = Date.now();
        console.log('[ScreenLockDetector] LOCKED at', new Date().toLocaleTimeString());

        // Notify callbacks - UI update
        this.lockCallbacks.forEach(cb => {
          try { cb(); } catch (e) { console.error('[ScreenLockDetector] Lock callback error:', e); }
        });
      } else {
        // Screen unlocked - Electron provides the AUTHORITATIVE duration
        // ALWAYS process unlock and send duration, regardless of local state
        const lockDuration = data.lockDuration || 0;
        console.log('[ScreenLockDetector] UNLOCKED - duration from Electron:', lockDuration, 's');

        // Reset state
        this.electronLockActive = false;
        this.isScreenLocked = false;
        this.screenLockStartTime = null;
        this.isFrozen = false;

        // ALWAYS pass duration to callbacks - Electron main.js has authoritative data
        this.unlockCallbacks.forEach(cb => {
          try { cb(lockDuration); } catch (e) { console.error('[ScreenLockDetector] Unlock callback error:', e); }
        });
      }
    });
    this.electronCleanupFns.push(lockCleanup);

    // System suspend - UI update only
    const suspendCleanup = window.electronAPI.onSystemSuspend((data) => {
      console.log('[ScreenLockDetector] System SUSPEND');
      this.isFrozen = true;

      // Mark as locked if not already
      if (!this.electronLockActive) {
        this.electronLockActive = true;
        this.isScreenLocked = true;
        this.screenLockStartTime = Date.now();

        // UI update
        this.lockCallbacks.forEach(cb => {
          try { cb(); } catch (e) { console.error('[ScreenLockDetector] Suspend callback error:', e); }
        });
      }

      this.sleepCallbacks.forEach(cb => {
        try { cb(); } catch (e) { console.error('[ScreenLockDetector] Sleep callback error:', e); }
      });
    });
    this.electronCleanupFns.push(suspendCleanup);

    // System resume - UI update only, NO duration (unlock handles it)
    const resumeCleanup = window.electronAPI.onSystemResume((data) => {
      console.log('[ScreenLockDetector] System RESUME');
      this.isFrozen = false;

      // Wake callbacks with 0 - actual duration comes from unlock
      this.wakeCallbacks.forEach(cb => {
        try { cb(0); } catch (e) { console.error('[ScreenLockDetector] Wake callback error:', e); }
      });
    });
    this.electronCleanupFns.push(resumeCleanup);

    console.log('[ScreenLockDetector] Electron detection ready');
  }
}

// Create singleton instance
const screenLockDetector = new ScreenLockDetector();

export default screenLockDetector;
export { ScreenLockDetector };
