import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin, Space, Button } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  FileTextOutlined,
  AlertOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { taskService, worksheetService, attendanceService, userService } from '../api/services';
import { useNavigate } from 'react-router-dom';
import TimeTracker from '../components/TimeTracker';

const { Title, Text } = Typography;

const Dashboard = () => {
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [pendingWorksheets, setPendingWorksheets] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch task summary
      const taskSummary = await taskService.getTaskSummary();

      // Fetch worksheet summary
      const worksheetSummary = await worksheetService.getSummary();

      // Fetch recent tasks
      const tasks = await taskService.getTasks({ limit: 5 });

      setStats({
        tasks: taskSummary.data,
        worksheets: worksheetSummary.data,
      });
      setRecentTasks(tasks.data);

      // Fetch pending worksheets for TL/Manager
      if (isTeamLead()) {
        const pending = await worksheetService.getPendingVerification();
        setPendingWorksheets(pending.data);
      } else if (isManager() || isAdmin()) {
        const pending = await worksheetService.getPendingApproval();
        setPendingWorksheets(pending.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const taskColumns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <a onClick={() => navigate(`/tasks/${record.id}`)}>{text}</a>
      ),
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
          cancelled: 'red',
        };
        return <Tag color={colors[status]}>{status.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const colors = {
          low: 'green',
          medium: 'blue',
          high: 'orange',
          urgent: 'red',
        };
        return <Tag color={colors[priority]}>{priority.toUpperCase()}</Tag>;
      },
    },
  ];

  const worksheetColumns = [
    {
      title: 'Employee',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          submitted: 'blue',
          tl_verified: 'cyan',
        };
        return <Tag color={colors[status]}>{status.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button type="link" onClick={() => navigate(`/worksheets/${record.id}`)}>
          Review
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>Welcome, {user?.full_name}!</Title>

      {/* Time Tracker for Employees */}
      {isEmployee() && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <TimeTracker />
          </Col>
        </Row>
      )}

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Tasks"
              value={stats.tasks?.total || 0}
              prefix={<CheckCircleOutlined />}
              styles={{ value: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Tasks"
              value={stats.tasks?.pending || 0}
              prefix={<ClockCircleOutlined />}
              styles={{ value: { color: '#faad14' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Worksheets Submitted"
              value={stats.worksheets?.total_worksheets || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={isTeamLead() ? 'Pending Verification' : 'Pending Approval'}
              value={isTeamLead() ? stats.worksheets?.pending_verification || 0 : stats.worksheets?.pending_approval || 0}
              prefix={<AlertOutlined />}
              styles={{ value: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Recent Tasks */}
        <Col xs={24} lg={12}>
          <Card
            title="Recent Tasks"
            extra={<a onClick={() => navigate('/tasks')}>View All</a>}
          >
            <Table
              dataSource={recentTasks}
              columns={taskColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        {/* Pending Worksheets for TL/Manager */}
        {(isTeamLead() || isManager() || isAdmin()) && (
          <Col xs={24} lg={12}>
            <Card
              title={isTeamLead() ? 'Worksheets to Verify' : 'Worksheets to Approve'}
              extra={<a onClick={() => navigate('/worksheets')}>View All</a>}
            >
              <Table
                dataSource={pendingWorksheets.slice(0, 5)}
                columns={worksheetColumns}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default Dashboard;
