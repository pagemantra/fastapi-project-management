import { useState, useEffect } from 'react';
import { Button, Typography, Steps, Card, Space, Alert, Collapse, Divider } from 'antd';
import {
  DownloadOutlined,
  DesktopOutlined,
  CheckCircleOutlined,
  ChromeOutlined,
  WindowsOutlined,
  AppleOutlined,
  SettingOutlined,
  RocketOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const PWAEnforcement = ({ children }) => {
  const [isPWA, setIsPWA] = useState(null); // null = checking, true = PWA, false = browser
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState(null);
  const [showAutoStartGuide, setShowAutoStartGuide] = useState(false);

  useEffect(() => {
    // Check if running as PWA (standalone mode)
    const checkPWAMode = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://') ||
        window.location.search.includes('source=pwa');

      console.log('[PWA] Standalone mode:', isStandalone);
      setIsPWA(isStandalone);

      // Check if user just installed (show auto-start guide)
      if (isStandalone && localStorage.getItem('pwa_just_installed')) {
        setShowAutoStartGuide(true);
        localStorage.removeItem('pwa_just_installed');
      }
    };

    // Initial check
    checkPWAMode();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e) => {
      console.log('[PWA] Display mode changed:', e.matches);
      setIsPWA(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    // Capture install prompt
    const handleBeforeInstallPrompt = (e) => {
      console.log('[PWA] beforeinstallprompt fired');
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      localStorage.setItem('pwa_just_installed', 'true');
      setDeferredPrompt(null);
      setIsInstalling(false);
      // Recheck PWA mode after a short delay
      setTimeout(checkPWAMode, 1000);
    });

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setInstallError('Install prompt not available. Please use Chrome or Edge browser.');
      return;
    }

    setIsInstalling(true);
    setInstallError(null);

    try {
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for the user's response
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', outcome);

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install');
      } else {
        console.log('[PWA] User dismissed install');
        setInstallError('Installation was cancelled. Please try again.');
      }
    } catch (error) {
      console.error('[PWA] Install error:', error);
      setInstallError('Installation failed. Please try manual installation.');
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const dismissAutoStartGuide = () => {
    setShowAutoStartGuide(false);
  };

  // Still checking...
  if (isPWA === null) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <DesktopOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          <Title level={4} style={{ marginTop: 16 }}>Checking application mode...</Title>
        </Card>
      </div>
    );
  }

  // Running as PWA - render children (with optional auto-start guide)
  if (isPWA) {
    return (
      <>
        {showAutoStartGuide && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}>
            <Card
              style={{
                maxWidth: 600,
                width: '100%',
                borderRadius: 16,
                maxHeight: '90vh',
                overflow: 'auto'
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
                <Title level={2} style={{ marginTop: 16, marginBottom: 8, color: '#52c41a' }}>
                  Successfully Installed!
                </Title>
                <Text type="secondary" style={{ fontSize: 16 }}>
                  Work Tracker is now installed as a desktop application.
                </Text>
              </div>

              <Alert
                message="Enable Auto-Start (Recommended)"
                description="To ensure you never miss clocking in, enable Work Tracker to start automatically when Windows starts."
                type="info"
                showIcon
                icon={<RocketOutlined />}
                style={{ marginBottom: 24 }}
              />

              <Collapse
                items={[
                  {
                    key: 'chrome',
                    label: (
                      <Space>
                        <ChromeOutlined />
                        <span>Auto-Start with Chrome (Windows)</span>
                      </Space>
                    ),
                    children: (
                      <Steps
                        direction="vertical"
                        size="small"
                        current={-1}
                        items={[
                          { title: 'Open Chrome browser', description: 'Not the PWA, the regular Chrome browser' },
                          { title: 'Go to chrome://apps', description: 'Type this in the address bar' },
                          { title: 'Find "Work Tracker"', description: 'Right-click on the app icon' },
                          { title: 'Select "Start app when you sign in"', description: 'This enables auto-start' },
                        ]}
                      />
                    )
                  },
                  {
                    key: 'edge',
                    label: (
                      <Space>
                        <WindowsOutlined />
                        <span>Auto-Start with Edge (Windows)</span>
                      </Space>
                    ),
                    children: (
                      <Steps
                        direction="vertical"
                        size="small"
                        current={-1}
                        items={[
                          { title: 'Open Edge browser', description: 'Not the PWA, the regular Edge browser' },
                          { title: 'Go to edge://apps', description: 'Type this in the address bar' },
                          { title: 'Click "..." on Work Tracker', description: 'Find the three-dot menu' },
                          { title: 'Enable "Start app when you sign in"', description: 'Toggle this option on' },
                        ]}
                      />
                    )
                  },
                  {
                    key: 'manual',
                    label: (
                      <Space>
                        <SettingOutlined />
                        <span>Manual Startup Folder Method</span>
                      </Space>
                    ),
                    children: (
                      <Steps
                        direction="vertical"
                        size="small"
                        current={-1}
                        items={[
                          { title: 'Press Win + R', description: 'Open Run dialog' },
                          { title: 'Type: shell:startup', description: 'Press Enter to open Startup folder' },
                          { title: 'Find Work Tracker shortcut', description: 'Usually on Desktop or Start Menu' },
                          { title: 'Copy shortcut to Startup folder', description: 'App will now start with Windows' },
                        ]}
                      />
                    )
                  }
                ]}
                defaultActiveKey={['chrome']}
              />

              <Divider />

              <div style={{ textAlign: 'center' }}>
                <Space direction="vertical">
                  <Button type="primary" size="large" onClick={dismissAutoStartGuide}>
                    Got it, Start Using Work Tracker
                  </Button>
                  <Text type="secondary">
                    You can always enable auto-start later from your browser settings.
                  </Text>
                </Space>
              </div>
            </Card>
          </div>
        )}
        {children}
      </>
    );
  }

  // Not running as PWA - show install prompt
  const getBrowserInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    const isEdge = userAgent.includes('edg');
    const isFirefox = userAgent.includes('firefox');
    const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');

    if (isChrome || isEdge) {
      return {
        browser: isChrome ? 'Chrome' : 'Edge',
        icon: <ChromeOutlined />,
        steps: [
          'Click the install button below (if available)',
          'Or click the install icon in the address bar (right side)',
          'Or click the three dots menu (\u22EE) \u2192 "Install Work Tracker"',
          'Click "Install" in the popup dialog',
          'The app will open in its own window'
        ]
      };
    } else if (isFirefox) {
      return {
        browser: 'Firefox',
        icon: <DesktopOutlined />,
        steps: [
          'Firefox has limited PWA support on desktop',
          'Please use Chrome or Microsoft Edge for best experience',
          'Download Chrome: google.com/chrome',
          'Download Edge: microsoft.com/edge'
        ]
      };
    } else if (isSafari) {
      return {
        browser: 'Safari',
        icon: <AppleOutlined />,
        steps: [
          'Click the Share button in Safari',
          'Select "Add to Dock" or "Add to Home Screen"',
          'Click "Add" to confirm',
          'Open the app from your Dock'
        ]
      };
    }

    return {
      browser: 'your browser',
      icon: <DesktopOutlined />,
      steps: [
        'Use Chrome or Edge for best experience',
        'Look for an install icon in the address bar',
        'Or check the browser menu for "Install" option'
      ]
    };
  };

  const browserInfo = getBrowserInstructions();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <Card
        style={{
          maxWidth: 550,
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <DesktopOutlined style={{ fontSize: 64, color: '#1890ff' }} />
          <Title level={2} style={{ marginTop: 16, marginBottom: 8 }}>
            Install Work Tracker
          </Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            This application must be installed as a desktop app for accurate time tracking.
          </Text>
        </div>

        <Alert
          message="Why Install as Desktop App?"
          description={
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>Accurate time tracking with screen lock detection</li>
              <li>Works even when minimized (heartbeat continues)</li>
              <li>Auto-start with Windows option</li>
              <li>No browser tabs - dedicated window</li>
              <li>Offline support for reliability</li>
            </ul>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        {installError && (
          <Alert
            message="Installation Issue"
            description={installError}
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setInstallError(null)}
          />
        )}

        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {deferredPrompt && (
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              onClick={handleInstallClick}
              loading={isInstalling}
              block
              style={{ height: 50, fontSize: 16 }}
            >
              {isInstalling ? 'Installing...' : 'Install Work Tracker'}
            </Button>
          )}

          <Card
            size="small"
            title={
              <Space>
                {browserInfo.icon}
                <span>Installation Steps for {browserInfo.browser}</span>
              </Space>
            }
            style={{ background: '#f5f5f5' }}
          >
            <Steps
              direction="vertical"
              size="small"
              current={-1}
              items={browserInfo.steps.map((step) => ({
                title: step,
                status: 'wait'
              }))}
            />
          </Card>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              After installation, close this browser tab and open the installed app.
            </Text>
          </div>

          <Card size="small" style={{ background: '#e6f7ff', border: '1px solid #91d5ff' }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#1890ff' }} />
              <Text>
                <strong>Features:</strong> Screen lock detection, idle tracking,
                auto-start support, and reliable heartbeat system.
              </Text>
            </Space>
          </Card>
        </Space>
      </Card>
    </div>
  );
};

export default PWAEnforcement;
