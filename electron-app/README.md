# Work Tracker - Electron Desktop Application

A native Windows desktop application for employee time tracking with screen lock detection and close prevention.

## Features

### Core Features
- **Time Tracking**: Clock in/out with accurate time recording
- **Screen Lock Detection**: Native Windows API detection for screen lock/unlock events
- **System Sleep Detection**: Detects system suspend/resume (hibernate/sleep)
- **Close Prevention**: App cannot be closed while clocked in - only minimized to tray
- **Auto-Start**: Automatically starts with Windows
- **System Tray**: Minimizes to system tray, always accessible

### Technical Features
- **Native OS Integration**: Uses Electron's powerMonitor for accurate lock/sleep detection
- **No Heartbeat Required**: Unlike PWA, native APIs provide direct OS event detection
- **Session Persistence**: Tracks session state even through app restarts
- **IPC Communication**: Secure communication between main and renderer processes

## Architecture

```
electron-app/
├── main.js           # Main process - handles native OS events, window management
├── preload.js        # Preload script - exposes safe APIs to renderer
├── package.json      # Dependencies and build configuration
├── build/            # Build resources (icons)
├── dist/             # Build output
│   └── win-unpacked/ # Unpacked Windows application
│       └── Work Tracker.exe
└── tests/
    └── electron-test.cjs  # Test suite
```

## Installation

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
# Navigate to electron-app directory
cd electron-app

# Install dependencies
npm install

# Build the frontend
npm run build:react
```

## Development

### Run in Development Mode
```bash
# Start development (runs React dev server + Electron)
npm run dev
```

### Build for Production
```bash
# Build Windows executable (NSIS installer)
npm run build:win

# Build unpacked application (for testing)
npm run pack
```

## How It Works

### Close Prevention
1. When user tries to close the app (X button, Alt+F4), the close event is intercepted
2. If user is clocked in, a warning dialog is shown
3. App minimizes to system tray instead of closing
4. User can only exit the app after clocking out

### Screen Lock Detection
```javascript
// Main process listens to native OS events
powerMonitor.on('lock-screen', () => {
  // Notify renderer that screen is locked
  mainWindow.webContents.send('screen-lock-changed', { isLocked: true });
});

powerMonitor.on('unlock-screen', () => {
  // Calculate lock duration and notify renderer
  mainWindow.webContents.send('screen-lock-changed', {
    isLocked: false,
    lockDuration: calculatedDuration
  });
});
```

### System Tray
- Double-click tray icon to open app
- Right-click for context menu
- Shows clock status in tooltip
- Exit option only available when clocked out

### Auto-Start
- Configured using `auto-launch` package
- Automatically enabled on first run
- Starts silently with Windows

## API Reference

### Preload APIs (window.electronAPI)

| Method | Description |
|--------|-------------|
| `setClockStatus(boolean)` | Notify main process of clock in/out status |
| `getSessionData()` | Get persisted session data |
| `saveSessionData(data)` | Save session data to persistent storage |
| `clearSessionData()` | Clear all session data |
| `onScreenLockChanged(callback)` | Subscribe to screen lock/unlock events |
| `onSystemSuspend(callback)` | Subscribe to system suspend events |
| `onSystemResume(callback)` | Subscribe to system resume events |
| `getLockState()` | Get current lock/suspend state |
| `minimizeToTray()` | Minimize window to system tray |

## Security

- **Context Isolation**: Enabled for secure IPC
- **Node Integration**: Disabled in renderer
- **Preload Script**: Only exposes necessary APIs
- **No Remote Module**: Avoids security risks

## Testing

```bash
# Run test suite
node tests/electron-test.cjs
```

Tests verify:
- File structure
- Package configuration
- Main process functionality
- Preload script APIs
- Frontend integration
- Build configuration

## Deployment

### For IT Administrators
1. Build the application: `npm run build:win`
2. The installer will be in `dist/` folder
3. Deploy using standard Windows software deployment methods
4. App auto-starts with Windows - no user action needed

### Registry Auto-Start
The app registers itself in:
```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
```

## Troubleshooting

### App won't close
- This is intentional! Clock out first to enable closing.
- Right-click system tray icon → Exit (only works when clocked out)

### Screen lock not detected
- Ensure Windows version supports the lock screen events
- Check if another program is interfering with idle detection

### Auto-start not working
- Check Windows Task Manager → Startup tab
- Verify registry entry exists

## License

MIT
