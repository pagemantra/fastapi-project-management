/**
 * Screen Lock & Sleep Detector for PWA
 *
 * This utility provides robust detection of screen lock and system sleep events
 * using multiple APIs with proper fallback mechanisms:
 *
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
 */

// Constants
const IDLE_THRESHOLD_MS = 60000; // Minimum for IdleDetector (1 minute)
const HEARTBEAT_INTERVAL_MS = 5000; // Heartbeat check interval
const SLEEP_DETECTION_BUFFER_MS = 15000; // Buffer to account for browser throttling
const MIN_SLEEP_DURATION_MS = 10000; // Minimum 10 seconds to count as sleep

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

    // Callbacks
    this.onLock = null;
    this.onUnlock = null;
    this.onSleep = null;
    this.onWake = null;
    this.onError = null;

    // API availability
    this.idleDetectorAvailable = false;
    this.idleDetector = null;
    this.abortController = null;

    // Heartbeat interval
    this.heartbeatInterval = null;
  }

  /**
   * Initialize the detector with callbacks
   * @param {Object} options - Configuration options
   * @param {Function} options.onLock - Called when screen locks
   * @param {Function} options.onUnlock - Called when screen unlocks, receives duration in seconds
   * @param {Function} options.onSleep - Called when system sleeps
   * @param {Function} options.onWake - Called when system wakes, receives duration in seconds
   * @param {Function} options.onError - Called on errors
   */
  async init(options = {}) {
    if (this.isInitialized) {
      console.log('[ScreenLockDetector] Already initialized');
      return;
    }

    this.onLock = options.onLock || (() => {});
    this.onUnlock = options.onUnlock || (() => {});
    this.onSleep = options.onSleep || (() => {});
    this.onWake = options.onWake || (() => {});
    this.onError = options.onError || ((err) => console.error('[ScreenLockDetector] Error:', err));

    // Initialize all detection methods
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

      // If permission is 'prompt', we need a user gesture - skip automatic request
      if (permission === 'prompt') {
        console.log('[ScreenLockDetector] IdleDetector needs user gesture for permission - using fallback');
        return;
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
      this.onSleep();
    });

    // Resume event - fires when system wakes
    document.addEventListener('resume', () => {
      console.log('[ScreenLockDetector] Page RESUMED (system wake)');
      if (this.isFrozen && this.freezeStartTime) {
        const sleepDuration = Math.floor((Date.now() - this.freezeStartTime) / 1000);
        console.log('[ScreenLockDetector] System was sleeping for', sleepDuration, 'seconds');
        this.onWake(sleepDuration);
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
   * Detects sleep via heartbeat gap when IdleDetector is not available
   */
  handlePageVisible() {
    const now = Date.now();
    const hiddenDuration = this.pageHiddenTime ? now - this.pageHiddenTime : 0;
    const heartbeatGap = now - this.lastHeartbeatTime;

    console.log('[ScreenLockDetector] Page visible - hidden:',
      Math.floor(hiddenDuration / 1000), 's, heartbeat gap:',
      Math.floor(heartbeatGap / 1000), 's');

    // Only use heartbeat gap detection if IdleDetector is not available
    if (!this.idleDetectorAvailable && this.pageHiddenTime) {
      // Calculate unexpected gap - if JS was running, gap should equal hidden time
      const unexpectedGap = heartbeatGap - hiddenDuration;

      console.log('[ScreenLockDetector] Unexpected gap:',
        Math.floor(unexpectedGap / 1000), 's (buffer:',
        Math.floor(SLEEP_DETECTION_BUFFER_MS / 1000), 's)');

      if (unexpectedGap > SLEEP_DETECTION_BUFFER_MS) {
        // JS was frozen for longer than expected - this is actual sleep/lock
        const sleepDuration = Math.floor((heartbeatGap - HEARTBEAT_INTERVAL_MS) / 1000);

        if (sleepDuration * 1000 >= MIN_SLEEP_DURATION_MS) {
          console.log('[ScreenLockDetector] *** SLEEP DETECTED via heartbeat gap! Duration:', sleepDuration, 's ***');

          // Treat this as screen lock since we can't distinguish
          this.handleScreenLock('heartbeat');
          // Immediately unlock and report the duration
          setTimeout(() => {
            this.handleScreenUnlock('heartbeat', sleepDuration);
          }, 100);
        }
      } else {
        console.log('[ScreenLockDetector] Tab switch detected - no sleep');
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
    if (this.isScreenLocked) return; // Already locked

    this.isScreenLocked = true;
    this.screenLockStartTime = Date.now();
    console.log('[ScreenLockDetector] Screen LOCKED (source:', source, ') at', new Date().toLocaleTimeString());
    this.onLock();
  }

  /**
   * Handle screen unlock event
   * @param {string} source - Detection source
   * @param {number} overrideDuration - Override duration in seconds (for heartbeat detection)
   */
  handleScreenUnlock(source, overrideDuration = null) {
    if (!this.isScreenLocked && overrideDuration === null) return; // Not locked

    let lockDuration = 0;
    if (overrideDuration !== null) {
      lockDuration = overrideDuration;
    } else if (this.screenLockStartTime) {
      lockDuration = Math.floor((Date.now() - this.screenLockStartTime) / 1000);
    }

    console.log('[ScreenLockDetector] Screen UNLOCKED (source:', source, ') - was locked for', lockDuration, 'seconds');

    this.isScreenLocked = false;
    this.screenLockStartTime = null;
    this.onUnlock(lockDuration);
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

    this.isInitialized = false;
    this.idleDetectorAvailable = false;
  }
}

// Create singleton instance
const screenLockDetector = new ScreenLockDetector();

export default screenLockDetector;
export { ScreenLockDetector };
