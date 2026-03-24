const { app, BrowserWindow, ipcMain, powerMonitor, Tray, Menu, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available!`,
        detail: 'The update will be downloaded in the background and installed when you restart the app.',
        buttons: ['OK']
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded.',
        detail: 'Restart the app to apply the update.',
        buttons: ['Restart Now', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });

  // Check for updates (only in production)
  if (app.isPackaged) {
    // Check for updates after 5 seconds
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('[AutoUpdater] Update check failed:', err.message);
      });
    }, 5000);

    // Check for updates every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('[AutoUpdater] Update check failed:', err.message);
      });
    }, 4 * 60 * 60 * 1000);
  }
}

// Local server for production mode
let localServer = null;
let serverPort = 0;

// Start a local HTTP server to serve the app files
function startLocalServer() {
  return new Promise((resolve, reject) => {
    const appDir = path.join(process.resourcesPath, 'app');

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };

    localServer = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url;
      // Remove query strings
      filePath = filePath.split('?')[0];
      const fullPath = path.join(appDir, filePath);
      const ext = path.extname(filePath).toLowerCase();

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          // Try index.html for SPA routing
          fs.readFile(path.join(appDir, 'index.html'), (err2, indexData) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexData);
            }
          });
        } else {
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(data);
        }
      });
    });

    localServer.listen(0, '127.0.0.1', () => {
      serverPort = localServer.address().port;
      console.log(`[Main] Local server started on port ${serverPort}`);
      resolve(serverPort);
    });

    localServer.on('error', reject);
  });
}

// Initialize store for persistent data
const store = new Store({
  name: 'work-tracker-config',
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    isMaximized: false
  }
});

// Session store for time tracking data
const sessionStore = new Store({
  name: 'work-tracker-session',
  defaults: {
    activeSession: null,
    lockStartTime: null,
    screenActiveTime: 0,
    lockSleepTime: 0
  }
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isUserClockedIn = false;
let lockStartTime = null;

// Helper function to get the correct icon path
function getIconPath() {
  if (app.isPackaged) {
    // Try multiple locations in production (prioritize PNG)
    const possiblePaths = [
      path.join(process.resourcesPath, 'app', 'icons', 'icon.png'),
      path.join(process.resourcesPath, 'app', 'icons', 'icon.ico'),
      path.join(process.resourcesPath, 'icon.png'),
      path.join(process.resourcesPath, 'icon.ico')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log('[Main] Using icon:', p);
        return p;
      }
    }
    console.log('[Main] No icon found');
    return null;
  } else {
    // Development path
    const devPath = path.join(__dirname, 'build', 'icon.png');
    return fs.existsSync(devPath) ? devPath : null;
  }
}

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'Work Tracker',
  path: app.getPath('exe'),
});

// Enable auto-launch by default
autoLauncher.isEnabled().then((isEnabled) => {
  if (!isEnabled) {
    autoLauncher.enable();
    console.log('[Main] Auto-launch enabled');
  }
}).catch((err) => {
  console.error('[Main] Auto-launch error:', err);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

function createWindow() {
  const { width, height } = store.get('windowBounds');
  const isMaximized = store.get('isMaximized');

  // Determine if we're in production (packaged)
  const isProd = app.isPackaged;

  // Preload script path - works for both dev and prod
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Disable webSecurity for file:// protocol in production
      webSecurity: false,
      allowRunningInsecureContent: false
    },
    icon: isProd
      ? path.join(process.resourcesPath, 'app', 'icons', 'icon-192x192.svg')
      : path.join(__dirname, 'build', 'icon.png'),
    show: false, // Don't show until ready
    // CRITICAL: These settings help prevent closing
    closable: true, // We handle close event manually
  });

  if (isMaximized) {
    mainWindow.maximize();
  }

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    // Try port 5174 first (Vite default), then 5173
    const devPort = process.env.DEV_PORT || 5174;
    console.log('[Main] Dev mode - loading from http://localhost:' + devPort);
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    // Use local HTTP server to serve files (avoids ES module CORS issues)
    console.log(`[Main] Production mode - loading from http://127.0.0.1:${serverPort}`);
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
    // Open DevTools for debugging (remove in final release)
    mainWindow.webContents.openDevTools();
  }

  // Add better error handling
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message}`);
  });

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page loaded successfully');
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Main] Window ready and shown');
  });

  // Save window bounds on resize
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  mainWindow.on('maximize', () => {
    store.set('isMaximized', true);
  });

  mainWindow.on('unmaximize', () => {
    store.set('isMaximized', false);
  });

  // CRITICAL: Prevent window from closing - minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();

      // Check if user is clocked in
      if (isUserClockedIn) {
        // Show warning dialog
        const dialogOptions = {
          type: 'warning',
          buttons: ['Keep Open', 'Minimize to Tray'],
          defaultId: 0,
          cancelId: 0,
          title: 'Active Work Session',
          message: 'You are currently clocked in!',
          detail: 'Closing this app will affect your time tracking. The app will minimize to the system tray instead.\n\nTo properly close the app, please clock out first.'
        };
        const iconPath = getIconPath();
        if (iconPath) {
          dialogOptions.icon = iconPath;
        }
        dialog.showMessageBox(mainWindow, dialogOptions).then((result) => {
          if (result.response === 1) {
            // Minimize to tray
            mainWindow.hide();
            showTrayNotification();
          }
          // If Keep Open, do nothing
        });
      } else {
        // Not clocked in, but still minimize to tray by default
        mainWindow.hide();
        showTrayNotification();
      }

      return false;
    }
  });

  // Create system tray
  createTray();
}

function createTray() {
  // Create tray icon - use the helper function to get the correct path
  let iconPath = getIconPath();

  // Fallback to build folder in development
  if (!iconPath && !app.isPackaged) {
    iconPath = path.join(__dirname, 'build', 'icon.png');
  }

  console.log('[Main] Tray icon path:', iconPath);
  let trayIcon;

  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    }
    if (!trayIcon || trayIcon.isEmpty()) {
      // Create a simple blue icon programmatically
      console.log('[Main] Creating default tray icon');
      const size = 16;
      const canvas = Buffer.alloc(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        canvas[i * 4] = 24;      // R
        canvas[i * 4 + 1] = 144; // G
        canvas[i * 4 + 2] = 255; // B (blue)
        canvas[i * 4 + 3] = 255; // A
      }
      trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    }
  } catch (e) {
    console.error('[Main] Tray icon error:', e.message);
    // Create minimal icon
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4, 255);
    trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Work Tracker',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Status: Not Clocked In',
      id: 'status',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Exit (Clock Out First)',
      id: 'exit',
      click: () => {
        if (isUserClockedIn) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['OK'],
            title: 'Cannot Exit',
            message: 'Please clock out before exiting the application.',
            detail: 'Your work session is still active. Open the app and clock out first.'
          }).then(() => {
            mainWindow.show();
            mainWindow.focus();
          });
        } else {
          isQuitting = true;
          app.quit();
        }
      }
    }
  ]);

  tray.setToolTip('Work Tracker');
  tray.setContextMenu(contextMenu);

  // Double-click to open
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const statusText = isUserClockedIn ? 'Status: Clocked In' : 'Status: Not Clocked In';
  const exitLabel = isUserClockedIn ? 'Exit (Clock Out First)' : 'Exit';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Work Tracker',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: statusText,
      enabled: false
    },
    { type: 'separator' },
    {
      label: exitLabel,
      click: () => {
        if (isUserClockedIn) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['OK'],
            title: 'Cannot Exit',
            message: 'Please clock out before exiting the application.',
            detail: 'Your work session is still active. Open the app and clock out first.'
          }).then(() => {
            mainWindow.show();
            mainWindow.focus();
          });
        } else {
          isQuitting = true;
          app.quit();
        }
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(isUserClockedIn ? 'Work Tracker - Clocked In' : 'Work Tracker');
}

function showTrayNotification() {
  if (tray) {
    const balloonOptions = {
      title: 'Work Tracker',
      content: 'App minimized to system tray. Your session continues running.'
    };

    // Only add icon if we have a valid path
    const iconPath = getIconPath();
    if (iconPath) {
      balloonOptions.icon = iconPath;
    }

    tray.displayBalloon(balloonOptions);
  }
}

// Track if we've already reported inactive time for current lock/sleep cycle
let inactiveTimeReported = false;

// Power monitor events for lock/sleep detection
function setupPowerMonitor() {
  // Screen lock detection
  powerMonitor.on('lock-screen', () => {
    console.log('[Main] Screen locked');
    const lockTime = Date.now();

    // Only set lockStartTime if not already set (avoid overwriting when lock happens after suspend)
    const existingLockStart = sessionStore.get('lockStartTime');
    if (!existingLockStart) {
      lockStartTime = lockTime;
      sessionStore.set('lockStartTime', lockTime);
      inactiveTimeReported = false;
      console.log('[Main] Lock start time set:', lockTime);
    } else {
      console.log('[Main] Lock start time already set (from suspend?):', existingLockStart);
    }

    // Notify renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('screen-lock-changed', { isLocked: true, timestamp: lockTime });
    }
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('[Main] Screen unlocked');
    const unlockTime = Date.now();
    const storedLockStart = sessionStore.get('lockStartTime');

    // Calculate duration from earliest lock/suspend time
    let lockDuration = 0;
    if (storedLockStart) {
      lockDuration = Math.floor((unlockTime - storedLockStart) / 1000);
      console.log('[Main] Lock duration calculated:', lockDuration, 's (from', storedLockStart, 'to', unlockTime, ')');
    }

    // Clear lock time
    sessionStore.set('lockStartTime', null);
    lockStartTime = null;

    // Also clear suspend time if any (they overlap)
    sessionStore.set('suspendStartTime', null);

    // Check if we already reported this via resume event
    if (inactiveTimeReported) {
      console.log('[Main] Inactive time already reported via resume, sending 0 for unlock');
      lockDuration = 0;
    } else {
      inactiveTimeReported = true;
    }

    // Notify renderer with lock duration
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('screen-lock-changed', {
        isLocked: false,
        timestamp: unlockTime,
        lockDuration: lockDuration
      });
    }
  });

  // System suspend (sleep)
  powerMonitor.on('suspend', () => {
    console.log('[Main] System suspending (sleep)');
    const suspendTime = Date.now();
    sessionStore.set('suspendStartTime', suspendTime);

    // Also set lock start time if not already locked
    const existingLockStart = sessionStore.get('lockStartTime');
    if (!existingLockStart) {
      sessionStore.set('lockStartTime', suspendTime);
      lockStartTime = suspendTime;
      inactiveTimeReported = false;
      console.log('[Main] Lock start time set from suspend:', suspendTime);
    }

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('system-suspend', { timestamp: suspendTime });
    }
  });

  powerMonitor.on('resume', () => {
    console.log('[Main] System resumed from sleep');
    const resumeTime = Date.now();
    const suspendStart = sessionStore.get('suspendStartTime');
    const storedLockStart = sessionStore.get('lockStartTime');

    // Calculate sleep duration from the earliest time (lock or suspend)
    const earliestStart = storedLockStart || suspendStart;
    let sleepDuration = earliestStart ? Math.floor((resumeTime - earliestStart) / 1000) : 0;

    console.log('[Main] Sleep duration calculated:', sleepDuration, 's');

    // Clear suspend time
    sessionStore.set('suspendStartTime', null);

    // DON'T send sleep duration here - let unlock handle it to avoid double-counting
    // The frontend handles the complexity of sleep vs lock events
    // We just send 0 and let unlock calculate the full duration
    // This is because: suspend -> resume -> unlock all fire, and we only want to count once

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('system-resume', {
        timestamp: resumeTime,
        sleepDuration: 0 // Don't send duration here, unlock will calculate it
      });
    }
  });

  // Shutdown detection
  powerMonitor.on('shutdown', () => {
    console.log('[Main] System shutting down');
    // Save state before shutdown
    sessionStore.set('unexpectedShutdown', Date.now());

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('system-shutdown', { timestamp: Date.now() });
    }
  });

  console.log('[Main] Power monitor setup complete');
}

// IPC Handlers
function setupIPC() {
  // Clock status update from renderer
  ipcMain.on('clock-status-changed', (event, { isClockedIn }) => {
    console.log('[Main] Clock status changed:', isClockedIn);
    isUserClockedIn = isClockedIn;
    updateTrayMenu();
  });

  // Get stored session data
  ipcMain.handle('get-session-data', () => {
    return sessionStore.store;
  });

  // Save session data
  ipcMain.on('save-session-data', (event, data) => {
    Object.keys(data).forEach(key => {
      sessionStore.set(key, data[key]);
    });
  });

  // Clear session data
  ipcMain.on('clear-session-data', () => {
    sessionStore.clear();
  });

  // Check if there was unexpected shutdown
  ipcMain.handle('check-unexpected-shutdown', () => {
    const shutdownTime = sessionStore.get('unexpectedShutdown');
    if (shutdownTime) {
      sessionStore.delete('unexpectedShutdown');
      return { hadUnexpectedShutdown: true, shutdownTime };
    }
    return { hadUnexpectedShutdown: false };
  });

  // Get lock duration since last check
  ipcMain.handle('get-lock-state', () => {
    const lockStart = sessionStore.get('lockStartTime');
    const suspendStart = sessionStore.get('suspendStartTime');

    return {
      isLocked: lockStart !== null,
      lockStartTime: lockStart,
      isSuspended: suspendStart !== null,
      suspendStartTime: suspendStart
    };
  });

  // Force quit (for admin use)
  ipcMain.on('force-quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Minimize to tray
  ipcMain.on('minimize-to-tray', () => {
    mainWindow.hide();
  });

  // Show window
  ipcMain.on('show-window', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  console.log('[Main] IPC handlers setup complete');
}

// App lifecycle
app.whenReady().then(async () => {
  // Start local server for production
  if (app.isPackaged) {
    try {
      await startLocalServer();
    } catch (err) {
      console.error('[Main] Failed to start local server:', err);
    }
  }

  createWindow();
  setupPowerMonitor();
  setupIPC();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (event) => {
  // On macOS, keep app running
  if (process.platform !== 'darwin') {
    // On Windows/Linux, don't quit - app lives in tray
    // Only quit if isQuitting is true
    if (!isQuitting) {
      event.preventDefault();
    }
  }
});

// Handle before-quit
app.on('before-quit', (event) => {
  if (!isQuitting && isUserClockedIn) {
    event.preventDefault();
    dialog.showMessageBox({
      type: 'warning',
      buttons: ['OK'],
      title: 'Cannot Quit',
      message: 'Please clock out before quitting.',
      detail: 'Your work session is still active.'
    }).then(() => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    return;
  }
  isQuitting = true;
});

// Cleanup on quit
app.on('quit', () => {
  if (tray) {
    tray.destroy();
  }
});

console.log('[Main] Electron main process started');
