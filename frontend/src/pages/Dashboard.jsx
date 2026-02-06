import { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Skeleton } from 'antd';
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
import ScreenActiveTime from '../components/ScreenActiveTime';

const { Title } = Typography;

// Module-level cache for instant loading
const dashboardCache = {
  stats: null,
  recentTasks: null,
  pendingWorksheets: null,
  teamStats: null,
  userId: null
};

const Dashboard = () => {
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();
  const [stats, setStats] = useState(dashboardCache.stats || {});
  const [recentTasks, setRecentTasks] = useState(dashboardCache.recentTasks || []);
  const [pendingWorksheets, setPendingWorksheets] = useState(dashboardCache.pendingWorksheets || []);
  const [teamStats, setTeamStats] = useState(dashboardCache.teamStats || { teamMembers: 0, loggedInToday: 0 });
  const [initialLoad, setInitialLoad] = useState(!dashboardCache.stats);
  const fetchingRef = useRef(false);
  const navigate = useNavigate();

  // Clear cache and reset state when user changes (different login)
  useEffect(() => {
    if (user && dashboardCache.userId && dashboardCache.userId !== user._id) {
      // Different user logged in - clear cache and reset state
      dashboardCache.stats = null;
      dashboardCache.recentTasks = null;
      dashboardCache.pendingWorksheets = null;
      dashboardCache.teamStats = null;
      dashboardCache.userId = null;
      setStats({});
      setRecentTasks([]);
      setPendingWorksheets([]);
      setTeamStats({ teamMembers: 0, loggedInToday: 0 });
      setInitialLoad(true);
      fetchingRef.current = false;
    }
  }, [user]);

  const fetchDashboardData = useCallback(async () => {
    if (!user || fetchingRef.current) return;

    // If we have cached data for this user, use it immediately
    if (dashboardCache.userId === user._id && dashboardCache.stats) {
      setStats(dashboardCache.stats);
      setRecentTasks(dashboardCache.recentTasks || []);
      setPendingWorksheets(dashboardCache.pendingWorksheets || []);
      setTeamStats(dashboardCache.teamStats || { teamMembers: 0, loggedInToday: 0 });
      setInitialLoad(false);
      return;
    }

    fetchingRef.current = true;

    try {
      const promises = [];

      // Fetch task summary
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
                pending: res.data?.filter(t => t.status === 'todo' || t.status === 'pending').length || 0,
                in_progress: res.data?.filter(t => t.status === 'in_progress').length || 0,
                completed: res.data?.filter(t => t.status === 'completed').length || 0,
              }
            }
          })).catch(() => ({ data: {} }))
        );
      }

      // Fetch worksheet summary
      if (!isEmployee()) {
        promises.push(worksheetService.getSummary().catch(() => ({ data: {} })));
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
        promises.push(taskService.getMyTasks({ limit: 5 }).catch(() => ({ data: [] })));
      } else {
        promises.push(taskService.getTasks({ limit: 5 }).catch(() => ({ data: [] })));
      }

      const [taskSummary, worksheetSummary, tasks] = await Promise.all(promises);

      const newStats = { tasks: taskSummary.data, worksheets: worksheetSummary.data };
      const newTasks = tasks.data || [];

      // Update state and cache
      dashboardCache.stats = newStats;
      dashboardCache.recentTasks = newTasks;
      dashboardCache.userId = user._id;

      setStats(newStats);
      setRecentTasks(newTasks);
      setInitialLoad(false);

      // Fetch pending worksheets in background (non-blocking)
      if (isTeamLead()) {
        worksheetService.getPendingVerification().then(res => {
          const data = res.data || [];
          dashboardCache.pendingWorksheets = data;
          setPendingWorksheets(data);
        }).catch(() => {});
      } else if (isManager()) {
        // Managers need to see both: worksheets to verify (from TLs) and worksheets to approve (TL_VERIFIED)
        Promise.all([
          worksheetService.getPendingVerification().catch(() => ({ data: [] })),
          worksheetService.getPendingApproval().catch(() => ({ data: [] }))
        ]).then(([verificationRes, approvalRes]) => {
          const verificationData = verificationRes.data || [];
          const approvalData = approvalRes.data || [];
          // Combine both lists, avoiding duplicates by ID
          const seenIds = new Set();
          const combined = [];
          [...verificationData, ...approvalData].forEach(w => {
            if (!seenIds.has(w.id)) {
              seenIds.add(w.id);
              combined.push(w);
            }
          });
          dashboardCache.pendingWorksheets = combined;
          setPendingWorksheets(combined);
        });
      } else if (isAdmin()) {
        worksheetService.getPendingApproval().then(res => {
          const data = res.data || [];
          dashboardCache.pendingWorksheets = data;
          setPendingWorksheets(data);
        }).catch(() => {});
      }

      // Fetch team stats in background (non-blocking)
      if (!isEmployee()) {
        Promise.all([
          attendanceService.getTodayAll().catch(() => ({ data: [] })),
          userService.getAllForDashboard().catch(() => ({ data: [] }))
        ]).then(([attendanceRes, usersRes]) => {
          const todayAttendance = attendanceRes.data || [];
          const members = usersRes.data || [];
          const loggedIn = todayAttendance.filter(a => a.status === 'active' || a.status === 'completed').length;
          const newTeamStats = { teamMembers: members.length, loggedInToday: loggedIn };
          dashboardCache.teamStats = newTeamStats;
          setTeamStats(newTeamStats);
        });
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      setInitialLoad(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [user, isAdmin, isManager, isTeamLead, isEmployee]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, fetchDashboardData]);

  const taskColumns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = { pending: 'gold', in_progress: 'blue', completed: 'green', on_hold: 'orange', cancelled: 'red' };
        return <Tag color={colors[status]}>{(status || '').replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const colors = { low: 'green', medium: 'blue', high: 'orange', urgent: 'red' };
        return <Tag color={colors[priority]}>{(priority || '').toUpperCase()}</Tag>;
      },
    },
  ];

  const worksheetColumns = [
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = { submitted: 'blue', tl_verified: 'cyan' };
        return <Tag color={colors[status]}>{(status || '').replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    { title: 'Action', key: 'action', render: () => <a onClick={() => navigate('/worksheets')}>Review</a> },
  ];

  // Show minimal skeleton only on very first load (no cached data)
  if (initialLoad && !dashboardCache.stats) {
    return (
      <div>
        <Title level={3}>Welcome!</Title>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}><Card><Skeleton active paragraph={{ rows: 4 }} /></Card></Col>
          <Col xs={24} lg={12}><Card><Skeleton active paragraph={{ rows: 4 }} /></Card></Col>
        </Row>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>Welcome, {user?.full_name}!</Title>

      {(isEmployee() || isTeamLead() || isManager()) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}><TimeTracker /></Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {!isEmployee() && (
          <>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="Team Members" value={teamStats.teamMembers} prefix={<TeamOutlined />} valueStyle={{ color: '#3f8600' }} /></Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="Logged In Today" value={teamStats.loggedInToday} suffix={`/ ${teamStats.teamMembers}`} prefix={<UserOutlined />} valueStyle={{ color: '#1890ff' }} /></Card>
            </Col>
          </>
        )}
        {(isEmployee() || isTeamLead() || isManager()) && (
          <Col xs={24} sm={12} lg={6}>
            <ScreenActiveTime />
          </Col>
        )}
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Total Tasks" value={stats.tasks?.total_tasks || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#3f8600' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Pending Tasks" value={stats.tasks?.by_status?.pending || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        {isEmployee() && (
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="Worksheets Submitted" value={stats.worksheets?.total_worksheets || 0} prefix={<FileTextOutlined />} /></Card>
          </Col>
        )}
        {!isEmployee() && (
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title={isTeamLead() ? 'Pending Verification' : (isManager() ? 'Pending Review' : 'Pending Approval')} value={pendingWorksheets.length || (isTeamLead() ? (stats.worksheets?.pending_verification || 0) : (stats.worksheets?.pending_approval || 0))} prefix={<AlertOutlined />} valueStyle={{ color: '#cf1322' }} /></Card>
          </Col>
        )}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Recent Tasks" extra={<a onClick={() => navigate('/tasks')}>View All</a>}>
            <Table dataSource={recentTasks} columns={taskColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
        {(isTeamLead() || isManager() || isAdmin()) && (
          <Col xs={24} lg={12}>
            <Card title={isTeamLead() ? 'Worksheets to Verify' : (isManager() ? 'Worksheets to Review' : 'Worksheets to Approve')} extra={<a onClick={() => navigate('/worksheets')}>View All</a>}>
              <Table dataSource={pendingWorksheets.slice(0, 5)} columns={worksheetColumns} rowKey="id" pagination={false} size="small" />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default Dashboard;
