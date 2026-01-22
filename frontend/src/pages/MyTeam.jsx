import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Table, Typography, Row, Col, Statistic, Tag, Avatar, Space,
  message, Tabs, Button, Skeleton
} from 'antd';
import {
  TeamOutlined, UserOutlined, CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { userService, taskService, worksheetService, attendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from '../utils/dayjs';

const { Title, Text } = Typography;

// Module-level cache
const teamCache = {
  members: null,
  tasks: null,
  worksheets: null,
  attendance: null,
  userId: null
};

const MyTeam = () => {
  const [teamMembers, setTeamMembers] = useState(teamCache.members || []);
  const [teamTasks, setTeamTasks] = useState(teamCache.tasks || []);
  const [pendingWorksheets, setPendingWorksheets] = useState(teamCache.worksheets || []);
  const [teamAttendance, setTeamAttendance] = useState(teamCache.attendance || []);
  const [initialLoad, setInitialLoad] = useState(!teamCache.members);
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchingRef = useRef(false);

  const fetchTeamData = useCallback(async () => {
    if (!user || fetchingRef.current) return;

    if (teamCache.userId === user._id && teamCache.members) {
      setTeamMembers(teamCache.members);
      setTeamTasks(teamCache.tasks || []);
      setPendingWorksheets(teamCache.worksheets || []);
      setTeamAttendance(teamCache.attendance || []);
      setInitialLoad(false);
      return;
    }

    fetchingRef.current = true;

    try {
      // Fetch critical data first
      const [usersRes, tasksRes] = await Promise.all([
        userService.getUsers({ team_lead_id: user.id }).catch(() => ({ data: [] })),
        taskService.getTasks({}).catch(() => ({ data: [] }))
      ]);

      teamCache.members = usersRes.data || [];
      teamCache.tasks = tasksRes.data || [];
      teamCache.userId = user._id;

      setTeamMembers(teamCache.members);
      setTeamTasks(teamCache.tasks);
      setInitialLoad(false);

      // Fetch secondary data in background
      worksheetService.getPendingVerification().then(res => {
        teamCache.worksheets = res.data || [];
        setPendingWorksheets(teamCache.worksheets);
      }).catch(() => {});

      const today = dayjs().format('YYYY-MM-DD');
      attendanceService.getHistory({ start_date: today, end_date: today }).then(res => {
        teamCache.attendance = res.data || [];
        setTeamAttendance(teamCache.attendance);
      }).catch(() => {});

    } catch (error) {
      console.error('MyTeam error:', error);
      setInitialLoad(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchTeamData();
  }, [user, fetchTeamData]);

  const memberColumns = [
    {
      title: 'Associate',
      key: 'employee',
      render: (_, record) => (
        <Space>
          <Avatar style={{ backgroundColor: '#87d068' }}>{record.full_name?.charAt(0)?.toUpperCase()}</Avatar>
          <div>
            <Text strong>{record.full_name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Associate ID', dataIndex: 'employee_id', key: 'employee_id' },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Today',
      key: 'attendance',
      render: (_, record) => {
        const todayAttendance = teamAttendance.find(a => a.employee_id === record.id);
        if (!todayAttendance) return <Tag color="default">Not Logged In</Tag>;
        const statusColors = { active: 'green', on_break: 'orange', completed: 'blue' };
        return <Tag color={statusColors[todayAttendance.status] || 'default'}>{todayAttendance.status?.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
  ];

  const taskColumns = [
    { title: 'Task', dataIndex: 'title', key: 'title' },
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
        const colors = { pending: 'gold', in_progress: 'blue', completed: 'green', on_hold: 'orange' };
        return <Tag color={colors[status]}>{status?.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-' },
  ];

  const worksheetColumns = [
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
    { title: 'Action', key: 'action', render: () => <Button type="primary" size="small" onClick={() => navigate('/worksheets')}>Review</Button> },
  ];

  const activeMembers = teamMembers.filter(m => m.is_active).length;
  const loggedInToday = teamAttendance.filter(a => a.status === 'active' || a.status === 'completed').length;
  const pendingTasks = teamTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

  if (initialLoad && !teamCache.members) {
    return (
      <div>
        <Title level={3}><TeamOutlined /> My Team</Title>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => <Col xs={24} sm={12} md={6} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>)}
        </Row>
        <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}><TeamOutlined /> My Team</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Team Members" value={activeMembers} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Logged In Today" value={loggedInToday} suffix={`/ ${activeMembers}`} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#1890ff' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Pending Tasks" value={pendingTasks} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Worksheets to Verify" value={pendingWorksheets.length} prefix={<FileTextOutlined />} valueStyle={{ color: pendingWorksheets.length > 0 ? '#cf1322' : '#3f8600' }} /></Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="members" items={[
        {
          key: 'members',
          label: `Team Members (${teamMembers.length})`,
          children: <Card><Table dataSource={teamMembers} columns={memberColumns} rowKey="id" pagination={false} /></Card>,
        },
        {
          key: 'tasks',
          label: `Tasks (${teamTasks.length})`,
          children: <Card extra={<Button type="primary" onClick={() => navigate('/tasks')}>Manage Tasks</Button>}><Table dataSource={teamTasks} columns={taskColumns} rowKey="id" pagination={{ pageSize: 10 }} /></Card>,
        },
        {
          key: 'worksheets',
          label: <span>Pending Verification{pendingWorksheets.length > 0 && <Tag color="red" style={{ marginLeft: 8 }}>{pendingWorksheets.length}</Tag>}</span>,
          children: <Card extra={<Button type="primary" onClick={() => navigate('/worksheets')}>View All Worksheets</Button>}><Table dataSource={pendingWorksheets} columns={worksheetColumns} rowKey="id" pagination={false} locale={{ emptyText: 'No worksheets pending verification' }} /></Card>,
        },
      ]} />
    </div>
  );
};

export default MyTeam;
