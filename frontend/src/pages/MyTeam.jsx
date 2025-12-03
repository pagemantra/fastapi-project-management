import { useState, useEffect } from 'react';
import {
  Card, Table, Typography, Row, Col, Statistic, Tag, Avatar, Space,
  message, Spin, Tabs, Button
} from 'antd';
import {
  TeamOutlined, UserOutlined, CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { userService, taskService, worksheetService, attendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const MyTeam = () => {
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [pendingWorksheets, setPendingWorksheets] = useState([]);
  const [teamAttendance, setTeamAttendance] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      // Fetch employees under this team lead
      const usersResponse = await userService.getUsers({ team_lead_id: user.id });
      setTeamMembers(usersResponse.data || []);

      // Fetch tasks assigned to team members
      const tasksResponse = await taskService.getTasks({});
      setTeamTasks(tasksResponse.data || []);

      // Fetch pending worksheets for verification
      try {
        const worksheetsResponse = await worksheetService.getPendingVerification();
        setPendingWorksheets(worksheetsResponse.data || []);
      } catch (e) {
        setPendingWorksheets([]);
      }

      // Fetch today's attendance
      try {
        const today = dayjs().format('YYYY-MM-DD');
        const attendanceResponse = await attendanceService.getHistory({
          start_date: today,
          end_date: today,
        });
        setTeamAttendance(attendanceResponse.data || []);
      } catch (e) {
        setTeamAttendance([]);
      }
    } catch (error) {
      message.error('Failed to fetch team data');
    } finally {
      setLoading(false);
    }
  };

  const memberColumns = [
    {
      title: 'Associate',
      key: 'employee',
      render: (_, record) => (
        <Space>
          <Avatar style={{ backgroundColor: '#87d068' }}>
            {record.full_name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <div>
            <Text strong>{record.full_name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Associate ID',
      dataIndex: 'employee_id',
      key: 'employee_id',
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>
          {active ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Today',
      key: 'attendance',
      render: (_, record) => {
        const todayAttendance = teamAttendance.find(a => a.employee_id === record.id);
        if (!todayAttendance) {
          return <Tag color="default">Not Logged In</Tag>;
        }
        const statusColors = {
          active: 'green',
          on_break: 'orange',
          completed: 'blue',
        };
        return (
          <Tag color={statusColors[todayAttendance.status] || 'default'}>
            {todayAttendance.status?.replace('_', ' ').toUpperCase()}
          </Tag>
        );
      },
    },
  ];

  const taskColumns = [
    {
      title: 'Task',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Assigned To',
      key: 'assigned_to',
      render: (_, record) => {
        const member = teamMembers.find(m => m.id === record.assigned_to);
        return member?.full_name || record.assigned_to;
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const colors = { low: 'green', medium: 'blue', high: 'orange', urgent: 'red' };
        return <Tag color={colors[priority]}>{priority?.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          pending: 'gold',
          in_progress: 'blue',
          completed: 'green',
          on_hold: 'orange',
        };
        return <Tag color={colors[status]}>{status?.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
  ];

  const worksheetColumns = [
    {
      title: 'Associate',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Form',
      dataIndex: 'form_name',
      key: 'form_name',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button type="primary" size="small" onClick={() => navigate('/worksheets')}>
          Review
        </Button>
      ),
    },
  ];

  // Stats
  const activeMembers = teamMembers.filter(m => m.is_active).length;
  const loggedInToday = teamAttendance.filter(a => a.status === 'active' || a.status === 'completed').length;
  const pendingTasks = teamTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  const completedTasks = teamTasks.filter(t => t.status === 'completed').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>
        <TeamOutlined /> My Team
      </Title>

      {/* Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Team Members"
              value={activeMembers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Logged In Today"
              value={loggedInToday}
              suffix={`/ ${activeMembers}`}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Pending Tasks"
              value={pendingTasks}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Worksheets to Verify"
              value={pendingWorksheets.length}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: pendingWorksheets.length > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="members"
        items={[
          {
            key: 'members',
            label: `Team Members (${teamMembers.length})`,
            children: (
              <Card>
                <Table
                  dataSource={teamMembers}
                  columns={memberColumns}
                  rowKey="id"
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'tasks',
            label: `Tasks (${teamTasks.length})`,
            children: (
              <Card
                extra={
                  <Button type="primary" onClick={() => navigate('/tasks')}>
                    Manage Tasks
                  </Button>
                }
              >
                <Table
                  dataSource={teamTasks}
                  columns={taskColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: 'worksheets',
            label: (
              <span>
                Pending Verification
                {pendingWorksheets.length > 0 && (
                  <Tag color="red" style={{ marginLeft: 8 }}>{pendingWorksheets.length}</Tag>
                )}
              </span>
            ),
            children: (
              <Card
                extra={
                  <Button type="primary" onClick={() => navigate('/worksheets')}>
                    View All Worksheets
                  </Button>
                }
              >
                <Table
                  dataSource={pendingWorksheets}
                  columns={worksheetColumns}
                  rowKey="id"
                  pagination={false}
                  locale={{ emptyText: 'No worksheets pending verification' }}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default MyTeam;
