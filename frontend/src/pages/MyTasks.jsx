import { useState, useEffect } from 'react';
import {
  Table, Button, Space, Tag, Card, message, Typography, Row, Col
} from 'antd';
import { CheckSquareOutlined } from '@ant-design/icons';
import { taskService } from '../api/services';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const MyTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyTasks();
  }, []);

  const fetchMyTasks = async () => {
    try {
      setLoading(true);
      const response = await taskService.getMyTasks({});
      setTasks(response.data);
    } catch {
      message.error('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await taskService.updateTask(taskId, { status: newStatus });
      message.success('Status updated');
      fetchMyTasks();
    } catch {
      message.error('Failed to update status');
    }
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
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
        return (
          <Tag color={colors[status]}>
            {status.replace('_', ' ').toUpperCase()}
          </Tag>
        );
      },
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'In Progress', value: 'in_progress' },
        { text: 'Completed', value: 'completed' },
        { text: 'On Hold', value: 'on_hold' },
      ],
      onFilter: (value, record) => record.status === value,
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
      filters: [
        { text: 'Low', value: 'low' },
        { text: 'Medium', value: 'medium' },
        { text: 'High', value: 'high' },
        { text: 'Urgent', value: 'urgent' },
      ],
      onFilter: (value, record) => record.priority === value,
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
      sorter: (a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return dayjs(a.due_date).unix() - dayjs(b.due_date).unix();
      },
    },
    {
      title: 'Hours',
      key: 'hours',
      render: (_, record) => (
        <Text type="secondary">
          {record.actual_hours || 0} / {record.estimated_hours || '-'}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, task) => (
        <Space>
          {task.status !== 'completed' && (
            <Button
              type="link"
              size="small"
              onClick={() => handleStatusChange(task.id,
                task.status === 'pending' ? 'in_progress' : 'completed'
              )}
            >
              {task.status === 'pending' ? 'Start' : 'Complete'}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>
            <CheckSquareOutlined /> My Tasks
          </Title>
          <Text type="secondary">View and manage your assigned tasks</Text>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={tasks}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default MyTasks;
