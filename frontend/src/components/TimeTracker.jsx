import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Button, Space, Typography, Tag, Statistic, Row, Col, Select, message, Modal, Input } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  CoffeeOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { attendanceService } from '../api/services';
import dayjs from '../utils/dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

const TimeTracker = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [breakType, setBreakType] = useState('short_break');
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [breakComment, setBreakComment] = useState('');
  const [currentSystemTime, setCurrentSystemTime] = useState(dayjs());
  const [screenActiveSeconds, setScreenActiveSeconds] = useState(0);
  const screenActiveRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    fetchCurrentSession();
  }, []);

  // Screen active time tracking - track when page is visible and user is active
  useEffect(() => {
    if (!session || session.status !== 'active') {
      return;
    }

    // Initialize from session
    screenActiveRef.current = session.screen_active_seconds || 0;
    setScreenActiveSeconds(screenActiveRef.current);

    let trackingInterval;
    let syncInterval;

    const trackActiveTime = () => {
      if (document.visibilityState === 'visible') {
        screenActiveRef.current += 1;
        setScreenActiveSeconds(screenActiveRef.current);
      }
    };

    const syncToServer = async () => {
      if (screenActiveRef.current > 0) {
        try {
          await attendanceService.updateScreenActiveTime({
            screen_active_seconds: screenActiveRef.current
          });
        } catch (error) {
          console.error('Failed to sync screen active time:', error);
        }
      }
    };

    // Track every second when page is visible
    trackingInterval = setInterval(trackActiveTime, 1000);

    // Sync to server every 30 seconds
    syncInterval = setInterval(syncToServer, 30000);

    // Sync when page becomes hidden (user switches tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncToServer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync on unmount
    return () => {
      clearInterval(trackingInterval);
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      syncToServer();
    };
  }, [session?.status, session?.screen_active_seconds]);

  useEffect(() => {
    let interval;
    if (session && (session.status === 'active' || session.status === 'on_break')) {
      interval = setInterval(() => {
        const loginTime = dayjs.utc(session.login_time).tz('Asia/Kolkata');
        const now = dayjs.tz(new Date(), 'Asia/Kolkata');
        const totalSeconds = now.diff(loginTime, 'second');

        // Calculate break seconds including any ongoing break
        let breakSeconds = 0;
        if (session.breaks && session.breaks.length > 0) {
          session.breaks.forEach(b => {
            if (b.duration_minutes) {
              breakSeconds += b.duration_minutes * 60;
            } else if (b.start_time && !b.end_time) {
              // Ongoing break - calculate duration in seconds
              const breakStart = dayjs.tz(b.start_time, 'Asia/Kolkata');
              breakSeconds += Math.max(0, now.diff(breakStart, 'second'));
            }
          });
        }

        setElapsedTime(Math.max(0, totalSeconds - breakSeconds));
        setCurrentSystemTime(now);
      }, 1000);
    } else {
      // Update system time every second even when not clocked in
      interval = setInterval(() => {
        setCurrentSystemTime(dayjs.tz(new Date(), 'Asia/Kolkata'));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [session]);

  const fetchCurrentSession = async () => {
    try {
      const response = await attendanceService.getCurrentSession();
      setSession(response.data);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      message.error('Failed to load attendance session');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const response = await attendanceService.clockIn();
      setSession(response.data);
      message.success('Clocked in successfully!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to clock in');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!session?.worksheet_submitted) {
      Modal.confirm({
        title: 'Worksheet Not Submitted',
        content: 'You need to submit your daily worksheet before clocking out. Would you like to submit it now?',
        okText: 'Go to Worksheet',
        cancelText: 'Cancel',
        onOk: () => {
          navigate('/worksheets');
        },
      });
      return;
    }

    setActionLoading(true);
    try {
      const response = await attendanceService.clockOut({});
      setSession(response.data);
      message.success('Clocked out successfully!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to clock out');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBreak = async () => {
    // If break type is meeting or other, require comment
    if (breakType === 'meeting' || breakType === 'other') {
      setCommentModalVisible(true);
      return;
    }
    await startBreakWithComment(null);
  };

  const startBreakWithComment = async (comment) => {
    setActionLoading(true);
    try {
      const response = await attendanceService.startBreak({
        break_type: breakType,
        comment: comment
      });
      setSession(response.data);
      message.success('Break started!');
      setCommentModalVisible(false);
      setBreakComment('');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to start break');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommentSubmit = () => {
    if (!breakComment.trim()) {
      message.error('Please enter a comment for this break');
      return;
    }
    startBreakWithComment(breakComment);
  };

  const handleEndBreak = async () => {
    setActionLoading(true);
    try {
      const response = await attendanceService.endBreak();
      setSession(response.data);
      message.success('Break ended!');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to end break');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const getStatusTag = () => {
    if (!session) return <Tag color="default">Not Clocked In</Tag>;
    const colors = {
      active: 'green',
      on_break: 'orange',
      completed: 'blue',
      incomplete: 'red',
    };
    return <Tag color={colors[session.status]}>{(session.status || '').replace('_', ' ').toUpperCase()}</Tag>;
  };

  const breakOptions = [
    { value: 'short_break', label: 'Short Break' },
    { value: 'lunch_break', label: 'Lunch Break' },
    { value: 'tea_break', label: 'Tea Break' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Time Tracker</span>
          {getStatusTag()}
        </Space>
      }
      loading={loading}
    >
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} md={6}>
          <Statistic
            title="Work Time"
            value={formatTime(Math.max(0, elapsedTime))}
            prefix={<ClockCircleOutlined />}
            styles={{ value: { fontSize: 28, color: session?.status === 'active' ? '#52c41a' : '#1890ff' } }}
          />
        </Col>
        <Col xs={24} md={6}>
          <Statistic
            title="Break Time"
            value={(() => {
              if (!session) return '0 min';
              let totalMins = session.total_break_minutes || 0;
              // Add ongoing break time if on break
              if (session.status === 'on_break' && session.breaks) {
                const ongoingBreak = session.breaks.find(b => b.start_time && !b.end_time);
                if (ongoingBreak) {
                  const breakStart = dayjs.tz(ongoingBreak.start_time, 'Asia/Kolkata');
                  const now = dayjs.tz(new Date(), 'Asia/Kolkata');
                  totalMins += Math.max(0, now.diff(breakStart, 'minute'));
                }
              }
              return `${totalMins} min`;
            })()}
            prefix={<CoffeeOutlined />}
          />
        </Col>
        <Col xs={24} md={6}>
          <Statistic
            title="Screen Active"
            value={(() => {
              const secs = screenActiveSeconds || 0;
              const hrs = Math.floor(secs / 3600);
              const mins = Math.floor((secs % 3600) / 60);
              if (hrs > 0) return `${hrs}h ${mins}m`;
              return `${mins} min`;
            })()}
            prefix={<DesktopOutlined />}
            styles={{ value: { color: '#52c41a' } }}
          />
        </Col>
        <Col xs={24} md={6}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            {!session || session.status === 'completed' ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleClockIn}
                loading={actionLoading}
                size="large"
                block
              >
                Clock In
              </Button>
            ) : session.status === 'active' ? (
              <>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={breakType}
                    onChange={setBreakType}
                    options={breakOptions}
                    style={{ width: '60%' }}
                  />
                  <Button
                    type="default"
                    icon={<CoffeeOutlined />}
                    onClick={handleStartBreak}
                    loading={actionLoading}
                    style={{ width: '40%' }}
                  >
                    Break
                  </Button>
                </Space.Compact>
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={handleClockOut}
                  loading={actionLoading}
                  block
                >
                  Clock Out
                </Button>
              </>
            ) : session.status === 'on_break' ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleEndBreak}
                loading={actionLoading}
                size="large"
                block
              >
                End Break
              </Button>
            ) : null}
          </Space>
        </Col>
      </Row>
      <div style={{ marginTop: 16 }}>
        <Text type="secondary">
          Current System Time: <Text strong>{currentSystemTime.format('hh:mm A')}</Text>
        </Text>
        {session && (
          <>
            <Text type="secondary" style={{ marginLeft: 16 }}>
              | Logged in at: {dayjs.utc(session.login_time).tz('Asia/Kolkata').format('hh:mm A')}
            </Text>
            {session.worksheet_submitted && (
              <Tag color="green" style={{ marginLeft: 8 }}>Worksheet Submitted</Tag>
            )}
          </>
        )}
      </div>

      {/* Comment Modal for Meeting/Other breaks */}
      <Modal
        title={`${breakType === 'meeting' ? 'Meeting' : 'Other'} Break - Enter Details`}
        open={commentModalVisible}
        onOk={handleCommentSubmit}
        onCancel={() => {
          setCommentModalVisible(false);
          setBreakComment('');
        }}
        okText="Start Break"
        cancelText="Cancel"
        confirmLoading={actionLoading}
      >
        <div style={{ marginBottom: 8 }}>
          <Text>Please provide details for this {breakType === 'meeting' ? 'meeting' : 'break'}:</Text>
        </div>
        <TextArea
          rows={3}
          placeholder={breakType === 'meeting' ? 'Enter meeting details...' : 'Enter reason for break...'}
          value={breakComment}
          onChange={(e) => setBreakComment(e.target.value)}
          maxLength={500}
          showCount
        />
      </Modal>
    </Card>
  );
};

export default TimeTracker;
