import { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Space, Typography, Row, Col, Tag, Statistic, Select, Button, Form, InputNumber, Switch, Modal, message } from 'antd';
import { ClockCircleOutlined, CoffeeOutlined, FieldTimeOutlined, SettingOutlined } from '@ant-design/icons';
import { attendanceService, teamService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import TimeTracker from '../components/TimeTracker';
import dayjs from 'dayjs';

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

  useEffect(() => {
    fetchHistory();
    if (isAdmin() || isManager()) {
      fetchTeams();
    }
  }, [dateRange]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const params = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
      };
      const response = await attendanceService.getHistory(params);
      setHistory(response.data);
    } catch (error) {
      message.error('Failed to fetch attendance history');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await teamService.getTeams({});
      setTeams(response.data);
    } catch (error) {
      console.error('Failed to fetch teams');
    }
  };

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
      console.error('Failed to fetch break settings');
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

  // Calculate summary stats
  const totalHours = history.reduce((sum, h) => sum + (h.total_work_hours || 0), 0);
  const totalOvertime = history.reduce((sum, h) => sum + (h.overtime_hours || 0), 0);
  const totalBreaks = history.reduce((sum, h) => sum + (h.total_break_minutes || 0), 0);
  const avgHoursPerDay = history.length > 0 ? totalHours / history.length : 0;

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    },
    ...(isEmployee() ? [] : [{
      title: 'Employee',
      key: 'employee',
      render: (_, record) => record.employee_name || record.employee_id,
    }]),
    {
      title: 'Login',
      dataIndex: 'login_time',
      key: 'login_time',
      render: (time) => time ? dayjs(time).format('HH:mm:ss') : '-',
    },
    {
      title: 'Logout',
      dataIndex: 'logout_time',
      key: 'logout_time',
      render: (time) => time ? dayjs(time).format('HH:mm:ss') : '-',
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
      dataIndex: 'total_break_minutes',
      key: 'total_break_minutes',
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

      {/* Time Tracker for employees */}
      {isEmployee() && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <TimeTracker />
          </Col>
        </Row>
      )}

      {/* Summary Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Work Hours"
              value={totalHours.toFixed(1)}
              suffix="hrs"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Average per Day"
              value={avgHoursPerDay.toFixed(1)}
              suffix="hrs"
              prefix={<FieldTimeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Break Time"
              value={totalBreaks}
              suffix="min"
              prefix={<CoffeeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Overtime"
              value={totalOvertime.toFixed(1)}
              suffix="hrs"
              valueStyle={{ color: totalOvertime > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Break Settings */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space>
              <Text>Date Range:</Text>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
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

      {/* Attendance History Table */}
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

      {/* Break Settings Modal */}
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
