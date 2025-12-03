import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  Popconfirm, message, Typography, Row, Col, DatePicker, InputNumber
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { taskService, userService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [form] = Form.useForm();
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();

  useEffect(() => {
    fetchTasks();
    if (!isEmployee()) {
      fetchEmployees();
    }
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = isEmployee()
        ? await taskService.getMyTasks({})
        : await taskService.getTasks({});
      setTasks(response.data || []);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await userService.getEmployees();
      setEmployees(response.data || []);
    } catch (error) {
      console.error('Failed to fetch employees');
      setEmployees([]);
    }
  };

  const handleCreate = () => {
    setEditingTask(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingTask(record);
    form.setFieldsValue({
      ...record,
      due_date: record.due_date ? dayjs(record.due_date) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await taskService.deleteTask(id);
      message.success('Task deleted successfully');
      fetchTasks();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to delete task');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        due_date: values.due_date ? values.due_date.toISOString() : null,
      };

      if (editingTask) {
        await taskService.updateTask(editingTask.id, data);
        message.success('Task updated successfully');
      } else {
        await taskService.createTask(data);
        message.success('Task created successfully');
      }
      setModalVisible(false);
      fetchTasks();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await taskService.updateTask(taskId, { status: newStatus });
      message.success('Status updated');
      fetchTasks();
    } catch (error) {
      message.error('Failed to update status');
    }
  };

  // Handle modal close with confirmation
  const handleModalClose = () => {
    const formValues = form.getFieldsValue();
    const hasData = formValues.title || formValues.description;

    if (hasData && !editingTask) {
      Modal.confirm({
        title: 'Unsaved Changes',
        icon: <ExclamationCircleOutlined />,
        content: 'You have unsaved data. Are you sure you want to close without saving?',
        okText: 'Yes, Close',
        cancelText: 'No, Continue Editing',
        onOk: () => {
          setModalVisible(false);
          form.resetFields();
        },
      });
    } else {
      setModalVisible(false);
    }
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <a onClick={() => handleEdit(record)}>{text}</a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const colors = {
          pending: 'gold',
          in_progress: 'blue',
          completed: 'green',
          on_hold: 'orange',
          cancelled: 'red',
        };
        return (
          <Select
            value={status}
            onChange={(value) => handleStatusChange(record.id, value)}
            style={{ width: 120 }}
            size="small"
          >
            <Option value="pending"><Tag color="gold">Pending</Tag></Option>
            <Option value="in_progress"><Tag color="blue">In Progress</Tag></Option>
            <Option value="completed"><Tag color="green">Completed</Tag></Option>
            <Option value="on_hold"><Tag color="orange">On Hold</Tag></Option>
            <Option value="cancelled"><Tag color="red">Cancelled</Tag></Option>
          </Select>
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
  ];

  // Add assigned_to column for non-employees
  if (!isEmployee()) {
    columns.splice(1, 0, {
      title: 'Assigned To',
      dataIndex: 'assigned_to',
      key: 'assigned_to',
      render: (id) => {
        const emp = employees.find(e => e.id === id);
        return emp?.full_name || id;
      },
    });

    columns.push({
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this task?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    });
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>{isEmployee() ? 'My Tasks' : 'Task Management'}</Title>
        </Col>
        {!isEmployee() && (
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              Create Task
            </Button>
          </Col>
        )}
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

      <Modal
        title={editingTask ? 'Edit Task' : 'Create Task'}
        open={modalVisible}
        onCancel={handleModalClose}
        maskClosable={false}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter title' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={3} />
          </Form.Item>

          {!editingTask && !isEmployee() && (
            <Form.Item
              name="assigned_to"
              label="Assign To"
              rules={[{ required: true, message: 'Please select associate' }]}
            >
              <Select placeholder="Select associate">
                {employees.map((emp) => (
                  <Option key={emp.id} value={emp.id}>{emp.full_name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="priority" label="Priority" initialValue="medium">
                <Select>
                  <Option value="low">Low</Option>
                  <Option value="medium">Medium</Option>
                  <Option value="high">High</Option>
                  <Option value="urgent">Urgent</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Status" initialValue="pending">
                <Select>
                  <Option value="pending">Pending</Option>
                  <Option value="in_progress">In Progress</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="on_hold">On Hold</Option>
                  <Option value="cancelled">Cancelled</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="due_date" label="Due Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="estimated_hours" label="Estimated Hours">
                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTask ? 'Update' : 'Create'}
              </Button>
              <Button onClick={handleModalClose}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Tasks;
