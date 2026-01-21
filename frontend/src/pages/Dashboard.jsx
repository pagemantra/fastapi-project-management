import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin, Empty, message } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  AlertOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { taskService, worksheetService, attendanceService, userService } from '../api/services';
import { useNavigate } from 'react-router-dom';
import TimeTracker from '../components/TimeTracker';
import dayjs from '../utils/dayjs';

const { Title } = Typography;

const Dashboard = () => {
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [pendingWorksheets, setPendingWorksheets] = useState([]);
  const [teamStats, setTeamStats] = useState({ teamMembers: 0, loggedInToday: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const promises = [];

      // Fetch task summary - only for non-employees or use my-tasks for employees
      if (!isEmployee()) {
        promises.push(
          taskService.getTaskSummary().catch((err) => {
            console.error('Failed to fetch task summary:', err);
            message.warning('Failed to load task statistics');
            return { data: {} };
          })
        );
      } else {
        promises.push(
          taskService.getMyTasks({}).then(res => ({
            data: {
              total_tasks: res.data?.length || 0,
              by_status: {
                pending: res.data?.filter(t => t.status === 'pending').length || 0,
                in_progress: res.data?.filter(t => t.status === 'in_progress').length || 0,
                completed: res.data?.filter(t => t.status === 'completed').length || 0,
              }
            }
          })).catch((err) => {
            console.error('Failed to fetch my tasks:', err);
            message.warning('Failed to load your tasks');
            return { data: {} };
          })
        );
      }

      // Fetch worksheet summary - only for non-employees
      if (!isEmployee()) {
        promises.push(
          worksheetService.getSummary().catch((err) => {
            console.error('Failed to fetch worksheet summary:', err);
            message.warning('Failed to load worksheet statistics');
            return { data: {} };
          })
        );
      } else {
        promises.push(
          worksheetService.getMyWorksheets({}).then(res => ({
            data: {
              total_worksheets: res.data?.length || 0,
              submitted: res.data?.filter(w => w.status === 'submitted').length || 0,
              tl_verified: res.data?.filter(w => w.status === 'tl_verified').length || 0,
              manager_approved: res.data?.filter(w => w.status === 'manager_approved').length || 0,
            }
          })).catch((err) => {
            console.error('Failed to fetch my worksheets:', err);
            message.warning('Failed to load your worksheets');
            return { data: {} };
          })
        );
      }

      // Fetch recent tasks
      if (isEmployee()) {
        promises.push(
          taskService.getMyTasks({ limit: 5 }).catch((err) => {
            console.error('Failed to fetch recent tasks:', err);
            message.warning('Failed to load recent tasks');
            return { data: [] };
          })
        );
      } else {
        promises.push(
          taskService.getTasks({ limit: 5 }).catch((err) => {
            console.error('Failed to fetch recent tasks:', err);
            message.warning('Failed to load recent tasks');
            return { data: [] };
          })
        );
      }

      const [taskSummary, worksheetSummary, tasks] = await Promise.all(promises);

      setStats({
        tasks: taskSummary.data,
        worksheets: worksheetSummary.data,
      });
      setRecentTasks(tasks.data || []);

      // Fetch pending worksheets for TL/Manager
      if (isTeamLead()) {
        try {
          const pending = await worksheetService.getPendingVerification();
          setPendingWorksheets(pending.data || []);
        } catch (e) {
          setPendingWorksheets([]);
        }
      } else if (isManager() || isAdmin()) {
        try {
          const pending = await worksheetService.getPendingApproval();
          setPendingWorksheets(pending.data || []);
        } catch (e) {
          setPendingWorksheets([]);
        }
      }

      // Fetch team stats for Admin, Manager, Team Lead (Logged In Today, Team Members)
      if (!isEmployee()) {
        try {
          // Fetch ALL today's attendance (new endpoint that bypasses role filtering)
          const attendanceResponse = await attendanceService.getTodayAll();
          const todayAttendance = attendanceResponse.data || [];
          const loggedIn = todayAttendance.filter(a => a.status === 'active' || a.status === 'completed').length;

          // Fetch ALL team members (new endpoint that bypasses role filtering)
          const usersResponse = await userService.getAllForDashboard();
          const members = usersResponse.data || [];

          setTeamStats({
            teamMembers: members.length,
            loggedInToday: loggedIn,
          });
        } catch (e) {
          console.error('Failed to fetch team stats:', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const taskColumns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text) => text,
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
      render: () => (
        <a onClick={() => navigate('/worksheets')}>Review</a>
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

      {/* Time Tracker for Associates, Team Leads, and Managers */}
      {(isEmployee() || isTeamLead() || isManager()) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <TimeTracker />
          </Col>
        </Row>
      )}

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Team Stats for Admin, Manager, Team Lead */}
        {!isEmployee() && (
          <>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Team Members"
                  value={teamStats.teamMembers}
                  prefix={<TeamOutlined />}
                  styles={{ value: { color: '#3f8600'  } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Logged In Today"
                  value={teamStats.loggedInToday}
                  suffix={`/ ${teamStats.teamMembers}`}
                  prefix={<UserOutlined />}
                  styles={{ value: { color: '#1890ff'  } }}
                />
              </Card>
            </Col>
          </>
        )}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Tasks"
              value={stats.tasks?.total_tasks || 0}
              prefix={<CheckCircleOutlined />}
              styles={{ value: { color: '#3f8600'  } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Tasks"
              value={stats.tasks?.by_status?.pending || 0}
              prefix={<ClockCircleOutlined />}
              styles={{ value: { color: '#faad14'  } }}
            />
          </Card>
        </Col>
        {/* For employees, show worksheets submitted */}
        {isEmployee() && (
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Worksheets Submitted"
                value={stats.worksheets?.total_worksheets || 0}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
        )}
        {/* For non-employees, show pending verification/approval */}
        {!isEmployee() && (
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={isTeamLead() ? 'Pending Verification' : 'Pending Approval'}
                value={isTeamLead() ? stats.worksheets?.pending_verification || 0 : stats.worksheets?.pending_approval || 0}
                prefix={<AlertOutlined />}
                styles={{ value: { color: '#cf1322'  } }}
              />
            </Card>
          </Col>
        )}
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

