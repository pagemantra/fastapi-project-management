const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - Exposes safe APIs to renderer process
 *
 * This bridges the Electron main process with the React frontend
 * All communication happens through these defined channels
 */

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Clock status - tell main process when user clocks in/out
  setClockStatus: (isClockedIn) => {
    ipcRenderer.send('clock-status-changed', { isClockedIn });
  },

  // Session data management
  getSessionData: () => ipcRenderer.invoke('get-session-data'),
  saveSessionData: (data) => ipcRenderer.send('save-session-data', data),
  clearSessionData: () => ipcRenderer.send('clear-session-data'),

  // Check for unexpected shutdown
  checkUnexpectedShutdown: () => ipcRenderer.invoke('check-unexpected-shutdown'),

  // Get current lock state
  getLockState: () => ipcRenderer.invoke('get-lock-state'),

  // Screen lock events
  onScreenLockChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('screen-lock-changed', handler);
    return () => ipcRenderer.removeListener('screen-lock-changed', handler);
  },

  // System suspend/resume events
  onSystemSuspend: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('system-suspend', handler);
    return () => ipcRenderer.removeListener('system-suspend', handler);
  },

  onSystemResume: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('system-resume', handler);
    return () => ipcRenderer.removeListener('system-resume', handler);
  },

  // System shutdown event
  onSystemShutdown: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('system-shutdown', handler);
    return () => ipcRenderer.removeListener('system-shutdown', handler);
  },

  // Window controls
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  showWindow: () => ipcRenderer.send('show-window'),

  // Force quit (admin only)
  forceQuit: () => ipcRenderer.send('force-quit'),

  // App info
  getAppVersion: () => {
    try {
      return require('./package.json').version;
    } catch {
      return '1.0.0';
    }
  }
});

// Log that preload is ready
console.log('[Preload] Electron APIs exposed to renderer');
