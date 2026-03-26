# Heartbeat & Lock Detection - Quick Reference Guide

## 🎯 Quick Facts

- **Heartbeat Interval:** 10 seconds
- **Test Results:** 54/54 passed (100%)
- **Detection Modes:** Dual (Browser + Electron)
- **Lock Threshold:** 10 seconds minimum
- **Status:** ✅ Production Ready

---

## 📋 Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `TimeTracker.jsx` | Main time tracking logic | 1167 |
| `screenLockDetector.js` | Lock detection abstraction | 594 |
| `electronBridge.js` | Environment abstraction | 178 |
| `electron-app/main.js` | Native OS events | 494 |
| `electron-app/preload.js` | Security bridge | 78 |

---

## 🔄 Event Flow (30-Second Summary)

### Electron Mode
```
OS Lock Event → powerMonitor → IPC → preload → screenLockDetector → TimeTracker → API
```

### Browser Mode
```
Screen Lock → IdleDetector → screenLockDetector → TimeTracker → API
```

---

## ⚙️ Configuration

### Heartbeat Settings
```javascript
// Location: TimeTracker.jsx:22
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
```

### Detection Thresholds
```javascript
// Location: screenLockDetector.js:33-36
const IDLE_THRESHOLD_MS = 60000;           // 1 minute (IdleDetector requirement)
const HEARTBEAT_INTERVAL_MS = 5000;        // 5 seconds (internal heartbeat)
const SLEEP_DETECTION_BUFFER_MS = 15000;   // 15 seconds (gap tolerance)
const MIN_SLEEP_DURATION_MS = 10000;       // 10 seconds (minimum to count)
```

### Recovery Thresholds
```javascript
// Location: TimeTracker.jsx:230-236
const HEARTBEAT_THRESHOLD = 30;  // 30 seconds - if no heartbeat, assume lock/sleep
const BUFFER = 15;               // 15 seconds buffer for normal app close latency
const MIN_LOCK_DURATION = 10;    // Only add if > 10 seconds
```

---

## 🎬 Common Scenarios

### Scenario 1: Screen Lock
```
User locks screen
  ↓
powerMonitor fires 'lock-screen' (Electron) OR IdleDetector fires 'locked' (Browser)
  ↓
screenLockDetector.handleScreenLock()
  ↓
TimeTracker onLock callback
  ↓
UI shows "Screen Locked" tag
  ↓
Screen Active timer PAUSES
  ↓
Lock/Sleep timer STARTS
  ↓
Heartbeats continue with screen_locked: true
```

### Scenario 2: Screen Unlock
```
User unlocks screen
  ↓
powerMonitor fires 'unlock-screen' (Electron) OR IdleDetector fires 'unlocked' (Browser)
  ↓
screenLockDetector.handleScreenUnlock(duration)
  ↓
TimeTracker onUnlock callback
  ↓
Check if already reported (prevent double-counting)
  ↓
Send duration to API: POST /attendance/add-inactive-time
  ↓
UI shows "Added 15m 30s to Lock/Sleep time"
  ↓
Screen Active timer RESUMES
  ↓
Lock/Sleep timer PAUSES
```

### Scenario 3: App Close & Reopen
```
User closes app (screen unlocked)
  ↓
beforeunload saves state: { closeTime: T1, wasLocked: false }
  ↓
Heartbeats STOP
  ↓
User reopens app 1 hour later
  ↓
recoverAppCloseTime() runs
  ↓
Check heartbeatGap = 1 hour
  ↓
heartbeatGap > 30s threshold
  ↓
Calculate: 1 hour - 15s buffer = 59m 45s
  ↓
Send to API: POST /attendance/add-inactive-time { inactive_seconds_to_add: 3585 }
  ↓
UI shows "Added 59m 45s to Lock/Sleep time (detected from heartbeat gap)"
```

---

## 🔍 Debugging

### Enable Detailed Logging
All components already have console logging. Look for:

```javascript
// In browser console
[ScreenLockDetector] Screen LOCKED (source: idleDetector)
[TimeTracker] Screen locked - timer paused at: 3600
[Heartbeat] Sent at 12:34:56 PM - locked: true
[TimeTracker] Screen unlocked - was locked for 900 s
[TimeTracker] Added 900 s to Lock/Sleep on server
```

### Check Lock State
```javascript
// In browser console
screenLockDetector.getState()
// Returns:
// {
//   isScreenLocked: true,
//   screenLockStartTime: 1710587696000,
//   currentLockDuration: 150,  // seconds
//   isFrozen: false,
//   idleDetectorAvailable: true
// }
```

### Check localStorage
```javascript
// In browser console
JSON.parse(localStorage.getItem('timeTracker_lockState'))
// {
//   isLocked: true,
//   lockStartTime: 1710587696000,
//   sessionDate: "2026-03-16",
//   savedAt: 1710587696000
// }

JSON.parse(localStorage.getItem('timeTracker_appCloseState'))
// {
//   closeTime: 1710587696000,
//   sessionDate: "2026-03-16",
//   wasLocked: false,
//   lockStartTime: null,
//   isAppClose: true
// }
```

### Check Electron Store
```javascript
// In renderer console (Electron only)
window.electronAPI.getLockState().then(console.log)
// {
//   isLocked: true,
//   lockStartTime: 1710587696000,
//   isSuspended: false,
//   suspendStartTime: null
// }
```

---

## 🛠️ Testing

### Run All Tests
```bash
cd D:\Development\fastapi-project-management
node frontend/tests/heartbeat-lock-test.cjs
```

### Expected Output
```
✓ All 54 tests passed
✓ Pass Rate: 100.0%
```

### Test Individual Components

```bash
# Test heartbeat configuration
grep -n "HEARTBEAT_INTERVAL" frontend/src/components/TimeTracker.jsx

# Test lock detection
grep -n "handleScreenLock" frontend/src/utils/screenLockDetector.js

# Test Electron integration
grep -n "powerMonitor" electron-app/main.js
```

---

## 🐛 Common Issues & Solutions

### Issue 1: Heartbeat Not Sending
**Symptoms:** No heartbeat logs in console

**Check:**
1. Is user clocked in? (`session.status === 'active'`)
2. Is heartbeat interval running? (Check `heartbeatIntervalRef.current`)
3. Is network working? (Check browser Network tab)

**Solution:**
```javascript
// Force send heartbeat
sendHeartbeat();
```

### Issue 2: Lock Not Detected
**Symptoms:** Screen locks but timer keeps running

**Check:**
1. **Browser:** Is IdleDetector permission granted?
   ```javascript
   navigator.permissions.query({ name: 'idle-detection' }).then(console.log)
   ```
2. **Electron:** Is powerMonitor working?
   ```javascript
   // Check main.js console logs
   [Main] Screen locked
   ```

**Solution:**
- **Browser:** Grant IdleDetector permission when prompted
- **Electron:** Check Electron version (needs 13+)

### Issue 3: Double Counting
**Symptoms:** Lock time counted twice

**Check:**
1. Is `inactiveTimeReportedRef` being reset properly?
2. Are there multiple detector initializations?

**Solution:**
```javascript
// Check detector initialization
console.log('Detector initialized:', detectorInitializedRef.current);
// Should only be true once

// Check reported flag
console.log('Already reported:', inactiveTimeReportedRef.current);
// Should be false on lock, true on unlock
```

### Issue 4: Recovery Not Working
**Symptoms:** Lock time lost after app restart

**Check:**
1. Is localStorage cleared? (Check Application tab in DevTools)
2. Is session date matching? (Different day = different session)
3. Is recovery function running? (Check for console logs)

**Solution:**
```javascript
// Manually trigger recovery
recoverAppCloseTime(session);
```

---

## 📊 API Endpoints

### Send Heartbeat
```http
POST /attendance/heartbeat
Content-Type: application/json

{
  "timestamp": "2026-03-16T12:34:56.789Z",
  "is_active": true,
  "screen_locked": false,
  "is_closing": false
}
```

**Response:** `200 OK`

### Add Inactive Time
```http
POST /attendance/add-inactive-time
Content-Type: application/json

{
  "inactive_seconds_to_add": 900
}
```

**Response:**
```json
{
  "data": {
    "inactive_seconds": 900,
    "status": "active"
  }
}
```

### Get Current Session
```http
GET /attendance/current-session
```

**Response:**
```json
{
  "data": {
    "status": "active",
    "login_time": "2026-03-16T09:00:00Z",
    "inactive_seconds": 900,
    "last_heartbeat": "2026-03-16T12:34:56Z",
    "breaks": [],
    "total_break_minutes": 0,
    "date": "2026-03-16"
  }
}
```

---

## 🎨 UI Indicators

### Heartbeat Status
```jsx
// Green = Active
<Tag color="green" icon={<HeartOutlined />}>Running</Tag>

// Default = Connecting
<Tag color="default" icon={<HeartOutlined />}>Connecting</Tag>
```

### Lock Status
```jsx
// Red = Locked
<Tag color="red" icon={<LockOutlined />}>Screen Locked</Tag>

// No tag = Unlocked
```

### Timer Status
```jsx
// Green = Running
<Tag color="green">RUNNING</Tag>

// Red = Paused
<Tag color="red">PAUSED</Tag>

// Orange = Lock timer running
<Tag color="orange">RUNNING</Tag>
```

---

## 🔐 Security Notes

### Electron Security
- ✅ `contextIsolation: true` - Renderer isolated from Node.js
- ✅ `nodeIntegration: false` - No Node.js in renderer
- ✅ `webSecurity: true` - Enforces same-origin
- ✅ `contextBridge` - Controlled API exposure

### Data Persistence
- **Electron Store:** Encrypted at rest (OS-level)
- **localStorage:** Browser storage (not encrypted)
- **Service Worker:** Same as localStorage

**Sensitive Data:** None stored (only timestamps and boolean flags)

---

## 📝 Code Snippets

### Initialize Lock Detector
```javascript
const cleanup = await screenLockDetector.init({
  onLock: () => {
    console.log('Screen locked');
    isLockedRef.current = true;
  },
  onUnlock: (duration) => {
    console.log('Screen unlocked, duration:', duration);
    sendInactiveTime(duration);
    isLockedRef.current = false;
  },
  onSleep: () => console.log('System sleep'),
  onWake: (duration) => {
    console.log('System wake, duration:', duration);
    sendInactiveTime(duration);
  }
});

// Cleanup on unmount
return () => cleanup && cleanup();
```

### Send Heartbeat
```javascript
const sendHeartbeat = async () => {
  const isLocked = screenLockDetector.isLocked();

  await attendanceService.sendHeartbeat({
    timestamp: new Date().toISOString(),
    is_active: !isLocked,
    screen_locked: isLocked
  });
};

// Start interval
const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

// Cleanup
return () => clearInterval(interval);
```

### Add Inactive Time
```javascript
const addInactiveTime = async (seconds) => {
  try {
    await attendanceService.addInactiveTime({
      inactive_seconds_to_add: seconds
    });
    console.log('Added', seconds, 'seconds to Lock/Sleep time');
    // Refresh session
    fetchCurrentSession();
  } catch (error) {
    console.error('Failed to add inactive time:', error);
  }
};
```

### Check Electron Environment
```javascript
import { isElectron } from '../utils/electronBridge';

if (isElectron()) {
  // Use native APIs
  window.electronAPI.onScreenLockChanged((data) => {
    console.log('Native lock event:', data);
  });
} else {
  // Use browser APIs
  // IdleDetector, Page Lifecycle, etc.
}
```

---

## 📖 Further Reading

- **Full Analysis:** See `HEARTBEAT_LOCK_ANALYSIS.md` for complete technical details
- **Test Suite:** See `heartbeat-lock-test.cjs` for automated tests
- **API Documentation:** See `API_ENDPOINTS_SUMMARY.md` for all endpoints

---

## 🚀 Quick Start Checklist

For new developers working on this feature:

- [ ] Read this quick reference
- [ ] Run the test suite (`node frontend/tests/heartbeat-lock-test.cjs`)
- [ ] Test lock detection manually (lock your screen, check console)
- [ ] Verify heartbeats in Network tab (every 10 seconds)
- [ ] Test app close recovery (close app, wait 1 min, reopen)
- [ ] Check Electron integration (if using Electron build)
- [ ] Review console logs for any errors

---

**Last Updated:** March 16, 2026
**Test Status:** ✅ 54/54 Passed
**Maintainer:** Development Team
