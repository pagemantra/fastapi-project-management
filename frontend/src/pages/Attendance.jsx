import { useState, useEffect, useCallback } from 'react';
import { Card, Table, DatePicker, Space, Typography, Row, Col, Tag, Select, Button, Form, InputNumber, Switch, Modal, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { attendanceService, teamService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import TimeTracker from '../components/TimeTracker';
import dayjs from '../utils/dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const Attendance = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [breakSettings, setBreakSettings] = useState(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();

  const fetchHistory = useCallback(async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    if (!user) return;

    setLoading(true);
    try {
      const params = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
      };
      const response = await attendanceService.getHistory(params);
      setHistory(response.data || []);
    } catch (error) {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, user]);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teamService.getTeams({});
      setTeams(response.data || []);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;

    fetchHistory();
    if (isAdmin() || isManager()) {
      fetchTeams();
    }
  }, [user, dateRange, fetchHistory, fetchTeams, isAdmin, isManager]);

  const fetchBreakSettings = async (teamId) => {
    try {
      const response = await attendanceService.getBreakSettings(teamId);
      setBreakSettings(response.data);
      if (response.data) {
        form.setFieldsValue(response.data);
      } else {
        form.resetFields();
      }
    } catch (error) {
      console.error('Failed to fetch break settings:', error);
      message.error('Failed to load break settings');
    }
  };

  const handleTeamSelect = (teamId) => {
    setSelectedTeam(teamId);
    if (teamId) {
      fetchBreakSettings(teamId);
    }
  };

  const handleOpenSettings = () => {
    if (!selectedTeam) {
      message.warning('Please select a team first');
      return;
    }
    setSettingsModalVisible(true);
  };

  const handleSaveSettings = async (values) => {
    try {
      const data = { ...values, team_id: selectedTeam };
      if (breakSettings) {
        await attendanceService.updateBreakSettings(selectedTeam, values);
        message.success('Break settings updated');
      } else {
        await attendanceService.createBreakSettings(data);
        message.success('Break settings created');
      }
      setSettingsModalVisible(false);
      fetchBreakSettings(selectedTeam);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to save settings');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'green',
      on_break: 'orange',
      completed: 'blue',
      incomplete: 'red',
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    },
    ...(isEmployee() ? [] : [{
      title: 'Associate',
      key: 'employee',
      render: (_, record) => record.employee_name || record.employee_id,
    }]),
    {
      title: 'Login Time',
      dataIndex: 'login_time',
      key: 'login_time',
      render: (time) => time ? dayjs.utc(time).tz('Asia/Kolkata').format('hh:mm A') : '-',
    },
    {
      title: 'Logout Time',
      dataIndex: 'logout_time',
      key: 'logout_time',
      render: (time) => time ? dayjs.utc(time).tz('Asia/Kolkata').format('hh:mm A') : '-',
    },
    {
      title: 'Work Hours',
      dataIndex: 'total_work_hours',
      key: 'total_work_hours',
      render: (hours) => `${hours?.toFixed(2) || 0} hrs`,
      sorter: (a, b) => (a.total_work_hours || 0) - (b.total_work_hours || 0),
    },
    {
      title: 'Break (min)',
      key: 'total_break_minutes',
      render: (_, record) => {
        let minutes = 0;
        if (record.breaks && record.breaks.length > 0) {
          const now = new Date();
          minutes = record.breaks.reduce((sum, b) => {
            if (b.duration_minutes && b.duration_minutes > 0) {
              return sum + b.duration_minutes;
            } else if (b.start_time && b.end_time) {
              const duration = Math.round((new Date(b.end_time) - new Date(b.start_time)) / 60000);
              return sum + Math.max(0, duration);
            } else if (b.start_time && !b.end_time) {
              const duration = Math.round((now - new Date(b.start_time)) / 60000);
              return sum + Math.max(0, duration);
            }
            return sum;
          }, 0);
        }
        if (minutes === 0 && record.total_break_minutes) {
          minutes = record.total_break_minutes;
        }
        return <Text type={minutes > 0 ? 'success' : 'secondary'}>{minutes} min</Text>;
      },
    },
    {
      title: 'Break Details',
      dataIndex: 'breaks',
      key: 'breaks',
      render: (breaks) => {
        if (!breaks || breaks.length === 0) return '-';
        return (
          <div>
            {breaks.map((breakItem, idx) => {
              let duration = breakItem.duration_minutes || 0;
              const isOngoing = breakItem.start_time && !breakItem.end_time;
              if (!duration && breakItem.start_time && breakItem.end_time) {
                duration = Math.round((new Date(breakItem.end_time) - new Date(breakItem.start_time)) / 60000);
              } else if (isOngoing) {
                duration = Math.round((new Date() - new Date(breakItem.start_time)) / 60000);
              }
              return (
                <div key={idx} style={{ fontSize: '11px', marginBottom: '2px' }}>
                  <Tag color={isOngoing ? 'orange' : 'cyan'} style={{ fontSize: '10px' }}>
                    {breakItem.break_type?.replace('_', ' ').toUpperCase()}
                  </Tag>
                  {dayjs.utc(breakItem.start_time).tz('Asia/Kolkata').format('hh:mm A')} - {breakItem.end_time ? dayjs.utc(breakItem.end_time).tz('Asia/Kolkata').format('hh:mm A') : 'ongoing'}
                  {duration > 0 && <Text type={isOngoing ? 'warning' : 'success'} style={{ fontSize: '10px', marginLeft: 4 }}>({duration} min)</Text>}
                  {breakItem.comment && <Text type="secondary" style={{ fontSize: '10px' }}> - {breakItem.comment}</Text>}
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: 'Screen Active',
      dataIndex: 'screen_active_seconds',
      key: 'screen_active_seconds',
      render: (seconds) => {
        if (!seconds && seconds !== 0) return '-';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return (
          <Text type="success">
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
          </Text>
        );
      },
    },
    {
      title: 'Inactive Time',
      dataIndex: 'inactive_seconds',
      key: 'inactive_seconds',
      render: (seconds) => {
        if (!seconds && seconds !== 0) return '-';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return (
          <Text type={seconds > 0 ? 'warning' : 'secondary'}>
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
          </Text>
        );
      },
    },
    {
      title: 'Overtime',
      dataIndex: 'overtime_hours',
      key: 'overtime_hours',
      render: (hours) => (
        <Text type={hours > 0 ? 'warning' : 'secondary'}>
          {hours?.toFixed(2) || 0} hrs
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Worksheet',
      dataIndex: 'worksheet_submitted',
      key: 'worksheet_submitted',
      render: (submitted) => (
        <Tag color={submitted ? 'green' : 'default'}>
          {submitted ? 'Submitted' : 'Pending'}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>Attendance</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <TimeTracker />
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space>
              <Text>Date Range:</Text>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (!dates || !dates[0] || !dates[1]) {
                    setDateRange([dayjs().subtract(7, 'day'), dayjs()]);
                  } else {
                    setDateRange(dates);
                  }
                }}
              />
            </Space>
          </Col>
          {(isAdmin() || isManager()) && (
            <>
              <Col xs={24} md={8}>
                <Space>
                  <Text>Team:</Text>
                  <Select
                    style={{ width: 200 }}
                    placeholder="Select team"
                    allowClear
                    onChange={handleTeamSelect}
                  >
                    {teams.map(team => (
                      <Select.Option key={team.id} value={team.id}>{team.name}</Select.Option>
                    ))}
                  </Select>
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Button
                  icon={<SettingOutlined />}
                  onClick={handleOpenSettings}
                  disabled={!selectedTeam}
                >
                  Break Settings
                </Button>
              </Col>
            </>
          )}
        </Row>
      </Card>

      <Card title="Attendance History">
        <Table
          dataSource={history}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: true }}
        />
      </Card>

      <Modal
        title={`Break Settings - ${teams.find(t => t.id === selectedTeam)?.name || ''}`}
        open={settingsModalVisible}
        onCancel={() => setSettingsModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveSettings}
          initialValues={{
            enforce_limits: false,
            lunch_break_duration: 60,
            short_break_duration: 15,
          }}
        >
          <Form.Item
            name="enforce_limits"
            label="Enforce Break Limits"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="max_breaks_per_day"
                label="Max Breaks per Day"
              >
                <InputNumber style={{ width: '100%' }} min={1} max={10} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="max_break_duration_minutes"
                label="Max Total Break (min)"
              >
                <InputNumber style={{ width: '100%' }} min={15} max={180} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="lunch_break_duration"
                label="Lunch Break (min)"
              >
                <InputNumber style={{ width: '100%' }} min={30} max={90} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="short_break_duration"
                label="Short Break (min)"
              >
                <InputNumber style={{ width: '100%' }} min={5} max={30} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Save Settings
              </Button>
              <Button onClick={() => setSettingsModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Attendance;
