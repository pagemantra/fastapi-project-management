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
import dayjs from 'dayjs';

const { Title } = Typography;

const Dashboard = () => {
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [pendingWorksheets, setPendingWorksheets] = useState([]);
  const [teamStats, setTeamStats] = useState({ teamMembers: 0, loggedInToday: 0 });
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamAttendance, setTeamAttendance] = useState([]);
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
          taskService.getTaskSummary().catch(() => ({ data: {} }))
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
          })).catch(() => ({ data: {} }))
        );
      }

      // Fetch worksheet summary - only for non-employees
      if (!isEmployee()) {
        promises.push(
          worksheetService.getSummary().catch(() => ({ data: {} }))
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
          })).catch(() => ({ data: {} }))
        );
      }

      // Fetch recent tasks
      if (isEmployee()) {
        promises.push(
          taskService.getMyTasks({ limit: 5 }).catch(() => ({ data: [] }))
        );
      } else {
        promises.push(
          taskService.getTasks({ limit: 5 }).catch(() => ({ data: [] }))
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
          // Fetch today's attendance
          const today = dayjs().format('YYYY-MM-DD');
          const attendanceResponse = await attendanceService.getHistory({
            start_date: today,
            end_date: today,
            limit: 1000,
          });
          const todayAttendance = attendanceResponse.data || [];
          setTeamAttendance(todayAttendance);
          const loggedIn = todayAttendance.filter(a => a.status === 'active' || a.status === 'completed').length;

          // Fetch team members based on role
          let members = [];
          if (isTeamLead()) {
            const usersResponse = await userService.getUsers({ team_lead_id: user.id, limit: 1000 });
            members = usersResponse.data || [];
          } else if (isManager()) {
            const usersResponse = await userService.getUsers({ manager_id: user.id, limit: 1000 });
            members = usersResponse.data || [];
          } else if (isAdmin()) {
            const usersResponse = await userService.getUsers({ limit: 1000 });
            // All users except admin
            members = usersResponse.data?.filter(u => u.role !== 'admin') || [];
          }

          setTeamMembers(members);
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

  // Team members columns with attendance status
  const teamMemberColumns = [
    {
      title: 'Associate',
      key: 'name',
      render: (_, record) => record.full_name,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => (
        <Tag color={role === 'team_lead' ? 'purple' : role === 'manager' ? 'blue' : 'default'}>
          {role?.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Today Status',
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
          incomplete: 'red',
        };
        return (
          <Tag color={statusColors[todayAttendance.status] || 'default'}>
            {todayAttendance.status?.replace('_', ' ').toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: 'Login Time',
      key: 'login_time',
      render: (_, record) => {
        const todayAttendance = teamAttendance.find(a => a.employee_id === record.id);
        return todayAttendance?.login_time ? dayjs(todayAttendance.login_time).format('HH:mm') : '-';
      },
    },
    {
      title: 'Logout Time',
      key: 'logout_time',
      render: (_, record) => {
        const todayAttendance = teamAttendance.find(a => a.employee_id === record.id);
        return todayAttendance?.logout_time ? dayjs(todayAttendance.logout_time).format('HH:mm') : '-';
      },
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

      {/* Time Tracker for Associates */}
      {isEmployee() && (
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
                  valueStyle={{ color: '#3f8600' }}
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
                  valueStyle={{ color: '#1890ff' }}
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
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Tasks"
              value={stats.tasks?.by_status?.pending || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
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
                valueStyle={{ color: '#cf1322' }}
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

      {/* Team Members Attendance Table for Admin/Manager/Team Lead */}
      {!isEmployee() && teamMembers.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={`Today's Attendance (${teamStats.loggedInToday} / ${teamStats.teamMembers} logged in)`}
              extra={<a onClick={() => navigate('/attendance')}>View Full Attendance</a>}
            >
              <Table
                dataSource={teamMembers}
                columns={teamMemberColumns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default Dashboard;
