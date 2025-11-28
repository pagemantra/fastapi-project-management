import { useState, useEffect } from 'react';
import {
  Table, Card, message, Typography, Row, Col, Tag, Avatar, Space, Statistic
} from 'antd';
import { TeamOutlined, UserOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { teamService, taskService } from '../api/services';

const { Title, Text } = Typography;

const MyTeam = () => {
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyTeam = async () => {
    try {
      setLoading(true);
      const response = await teamService.getMyTeam();
      setTeam(response.data);
      // Fetch member details
      if (response.data.members) {
        fetchMemberDetails(response.data.members);
      }
    } catch {
      message.error('Failed to fetch team information');
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberDetails = async (memberIds) => {
    try {
      // This would need a backend endpoint to fetch multiple users
      // For now, we'll set the member IDs
      setMembers(memberIds.map(id => ({ id, name: `User ${id}` })));
    } catch {
      console.error('Failed to fetch member details');
    }
  };

  const fetchTeamTasks = async () => {
    try {
      const response = await taskService.getTasks({});
      setTeamTasks(response.data);
    } catch {
      console.error('Failed to fetch team tasks');
    }
  };

  useEffect(() => {
    fetchMyTeam();
    fetchTeamTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <Text>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Tasks Assigned',
      key: 'tasks',
      render: (_, record) => {
        const count = teamTasks.filter(t => t.assigned_to === record.id).length;
        return <Tag>{count} tasks</Tag>;
      },
    },
    {
      title: 'Completed',
      key: 'completed',
      render: (_, record) => {
        const count = teamTasks.filter(
          t => t.assigned_to === record.id && t.status === 'completed'
        ).length;
        return <Tag color="green">{count}</Tag>;
      },
    },
    {
      title: 'In Progress',
      key: 'in_progress',
      render: (_, record) => {
        const count = teamTasks.filter(
          t => t.assigned_to === record.id && t.status === 'in_progress'
        ).length;
        return <Tag color="blue">{count}</Tag>;
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
      dataIndex: 'assigned_to',
      key: 'assigned_to',
      render: (id) => {
        const member = members.find(m => m.id === id);
        return member?.name || id;
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

  const completedTasks = teamTasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = teamTasks.filter(t => t.status === 'in_progress').length;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>
            <TeamOutlined /> My Team
          </Title>
          {team && <Text type="secondary">{team.name}</Text>}
        </Col>
      </Row>

      {team && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Team Members"
                value={team.members?.length || 0}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Tasks"
                value={teamTasks.length}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Completed"
                value={completedTasks}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="In Progress"
                value={inProgressTasks}
                valueStyle={{ color: '#1890ff' }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card title="Team Members" style={{ marginBottom: 16 }}>
        <Table
          dataSource={members}
          columns={memberColumns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Card title="Team Tasks">
        <Table
          dataSource={teamTasks}
          columns={taskColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default MyTeam;
