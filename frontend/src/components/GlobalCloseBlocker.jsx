import { useEffect, useCallback, useRef } from 'react';
import { Modal } from 'antd';
import { WarningOutlined } from '@ant-design/icons';

/**
 * GlobalCloseBlocker - ALWAYS ACTIVE close prevention
 *
 * This component runs at the top level and:
 * 1. Immediately attaches beforeunload handler
 * 2. Checks localStorage for active session
 * 3. Shows browser warning when close is attempted
 *
 * IMPORTANT: Browser security means we CANNOT truly block closing.
 * We can only show a warning dialog that user can dismiss.
 */
const GlobalCloseBlocker = ({ children }) => {
  const modalShown = useRef(false);

  // Check if user has an active session
  const hasActiveSession = useCallback(() => {
    try {
      // Check multiple indicators
      const token = localStorage.getItem('token');
      if (!token) return false;

      // Check for any saved session state
      const appCloseState = localStorage.getItem('timeTracker_appCloseState');
      const lockState = localStorage.getItem('timeTracker_lockState');

      // If there's any tracking state, assume active
      if (appCloseState || lockState) {
        return true;
      }

      // Check user data
      const userData = localStorage.getItem('user');
      if (userData) {
        return true; // User is logged in, be safe and block
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  // Show warning modal
  const showWarning = useCallback(() => {
    if (modalShown.current) return;
    modalShown.current = true;

    Modal.warning({
      title: <span style={{ color: '#ff4d4f' }}>⚠️ Do Not Close This App!</span>,
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p><strong>Your work session is being tracked.</strong></p>
          <p>Closing this app will affect your time records.</p>
          <div style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            padding: 12,
            borderRadius: 6,
            marginTop: 12
          }}>
            <strong>Tip:</strong> Minimize the app instead of closing it.
          </div>
        </div>
      ),
      okText: 'Keep Open',
      centered: true,
      onOk: () => {
        modalShown.current = false;
      }
    });
  }, []);

  useEffect(() => {
    // Skip browser close handling in Electron - native handler takes care of it
    if (window.electronAPI) {
      console.log('[GlobalCloseBlocker] Running in Electron - using native close prevention');
      return;
    }

    // CRITICAL: Attach beforeunload immediately
    const handleBeforeUnload = (e) => {
      // Always check if we should block
      const shouldBlock = hasActiveSession();

      console.log('[GlobalCloseBlocker] beforeunload - shouldBlock:', shouldBlock);

      if (shouldBlock) {
        // This is the ONLY reliable way to show a warning
        e.preventDefault();
        const msg = 'You have an active work session! Are you sure you want to leave?';
        e.returnValue = msg;
        return msg;
      }
    };

    // Keyboard blocking (Ctrl+W works in browser)
    const handleKeyDown = (e) => {
      if (!hasActiveSession()) return;

      // Block Ctrl+W
      if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        e.stopPropagation();
        showWarning();
        return false;
      }

      // Block Ctrl+F4
      if (e.ctrlKey && e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        showWarning();
        return false;
      }
    };

    // Attach listeners with capture = true for highest priority
    window.addEventListener('beforeunload', handleBeforeUnload, true);
    document.addEventListener('keydown', handleKeyDown, true);

    console.log('[GlobalCloseBlocker] Listeners attached');

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [hasActiveSession, showWarning]);

  return children;
};

export default GlobalCloseBlocker;
