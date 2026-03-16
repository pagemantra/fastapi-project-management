import { useEffect, useRef, useCallback } from 'react';
import { Modal } from 'antd';
import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';

/**
 * CloseBlocker - Prevents users from closing the PWA while clocked in
 *
 * REALITY CHECK:
 * - Alt+F4 is handled by the OS BEFORE it reaches the browser - CANNOT be blocked
 * - Clicking X button triggers beforeunload - CAN show warning but user can dismiss
 * - The ONLY thing we can do is show warnings and make it annoying to close
 *
 * This component:
 * 1. Shows persistent warning on beforeunload (user must click "Leave")
 * 2. Blocks Ctrl+W in the browser (this one works)
 * 3. Shows fullscreen warning overlay when close is attempted
 * 4. Prevents accidental closes with confirmation
 */
const CloseBlocker = ({ isActive, children }) => {
  const closeAttemptCount = useRef(0);
  const lastCloseAttempt = useRef(0);
  const warningShown = useRef(false);

  // Show aggressive warning modal
  const showCloseBlockedMessage = useCallback(() => {
    if (warningShown.current) return;
    warningShown.current = true;

    Modal.confirm({
      title: <span style={{ color: '#ff4d4f', fontSize: 18 }}>⚠️ WARNING: DO NOT CLOSE</span>,
      icon: <WarningOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />,
      content: (
        <div style={{ fontSize: 15 }}>
          <p style={{ fontWeight: 'bold', color: '#ff4d4f', marginBottom: 16 }}>
            You are currently CLOCKED IN!
          </p>
          <p>Closing this application will:</p>
          <ul style={{ color: '#ff4d4f' }}>
            <li>Stop your time tracking</li>
            <li>May result in incorrect work hours</li>
            <li>Affect your attendance records</li>
          </ul>
          <div style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            padding: 12,
            borderRadius: 6,
            marginTop: 16
          }}>
            <strong>Please MINIMIZE the app instead of closing it.</strong>
            <br />
            <small>The app will continue tracking your time in the background.</small>
          </div>
        </div>
      ),
      okText: 'KEEP APP OPEN',
      cancelText: 'I understand the risks',
      okButtonProps: {
        size: 'large',
        style: { background: '#52c41a', borderColor: '#52c41a' }
      },
      cancelButtonProps: {
        danger: true,
        size: 'small'
      },
      centered: true,
      width: 500,
      closable: false,
      maskClosable: false,
      onCancel: () => {
        warningShown.current = false;
      },
      onOk: () => {
        warningShown.current = false;
      }
    });
  }, []);

  useEffect(() => {
    if (!isActive) {
      console.log('[CloseBlocker] Not active - close prevention disabled');
      return;
    }

    console.log('[CloseBlocker] ACTIVE - Close prevention enabled');

    // 1. BEFOREUNLOAD - This is the main defense
    // Shows browser's native "Leave site?" dialog
    const handleBeforeUnload = (e) => {
      console.log('[CloseBlocker] beforeunload triggered!');
      closeAttemptCount.current++;
      lastCloseAttempt.current = Date.now();

      // Standard way to trigger the browser's leave confirmation
      e.preventDefault();
      // Chrome requires returnValue to be set
      const message = 'You are currently clocked in! Closing will affect your time tracking. Are you sure you want to leave?';
      e.returnValue = message;
      return message;
    };

    // 2. KEYBOARD SHORTCUTS - Block what we can
    const handleKeyDown = (e) => {
      // Ctrl+W - Can be blocked in browser
      if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        console.log('[CloseBlocker] Ctrl+W blocked');
        e.preventDefault();
        e.stopPropagation();
        showCloseBlockedMessage();
        return false;
      }

      // Ctrl+F4
      if (e.ctrlKey && e.key === 'F4') {
        console.log('[CloseBlocker] Ctrl+F4 blocked');
        e.preventDefault();
        e.stopPropagation();
        showCloseBlockedMessage();
        return false;
      }

      // Note: Alt+F4 CANNOT be blocked - it's handled by OS before reaching browser
    };

    // 3. UNLOAD - Last chance to warn
    const handleUnload = () => {
      console.log('[CloseBlocker] Window unloading - saving state');
      // Save close state for recovery
      const closeState = {
        closeTime: Date.now(),
        wasForced: true,
        closeAttempts: closeAttemptCount.current
      };
      localStorage.setItem('timeTracker_forcedClose', JSON.stringify(closeState));
    };

    // 4. VISIBILITY CHANGE - Detect when app goes to background
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[CloseBlocker] App went to background');
      } else {
        console.log('[CloseBlocker] App came to foreground');
        // Check if there was a forced close
        const forcedClose = localStorage.getItem('timeTracker_forcedClose');
        if (forcedClose) {
          console.log('[CloseBlocker] Detected previous forced close');
          localStorage.removeItem('timeTracker_forcedClose');
        }
      }
    };

    // 5. WINDOW BLUR - Additional detection
    const handleWindowBlur = () => {
      console.log('[CloseBlocker] Window lost focus');
    };

    // Add all event listeners with capture phase for priority
    window.addEventListener('beforeunload', handleBeforeUnload, true);
    window.addEventListener('unload', handleUnload, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener('blur', handleWindowBlur, true);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, true);
      window.removeEventListener('unload', handleUnload, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('blur', handleWindowBlur, true);
    };
  }, [isActive, showCloseBlockedMessage]);

  return children;
};

export default CloseBlocker;
