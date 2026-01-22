import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  Popconfirm, message, Typography, Row, Col
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { userService, teamService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;
const { Option } = Select;

// Module-level cache for instant loading
const usersCache = {
  users: null,
  managers: null,
  teamLeads: null
};

const Users = () => {
  const [users, setUsers] = useState(usersCache.users || []);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [managers, setManagers] = useState(usersCache.managers || []);
  const [teamLeads, setTeamLeads] = useState(usersCache.teamLeads || []);
  const [form] = Form.useForm();
  const { user: currentUser, isAdmin, isManager } = useAuth();
  const fetchingRef = useRef(false);

  const fetchUsers = useCallback(async (showLoading = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      if (showLoading && !usersCache.users) setLoading(true);
      const response = await userService.getUsers({});
      const data = response.data || [];
      usersCache.users = data;
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      if (!usersCache.users) setUsers([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const fetchManagers = useCallback(async () => {
    try {
      if (isAdmin()) {
        const response = await userService.getManagers();
        const data = response.data || [];
        usersCache.managers = data;
        setManagers(data);
      }
    } catch (error) {
      console.error('Failed to fetch managers:', error);
      if (!usersCache.managers) setManagers([]);
    }
  }, [isAdmin]);

  const fetchTeamLeads = useCallback(async () => {
    try {
      const response = await userService.getTeamLeads();
      const data = response.data || [];
      usersCache.teamLeads = data;
      setTeamLeads(data);
    } catch (error) {
      console.error('Failed to fetch team leads:', error);
      if (!usersCache.teamLeads) setTeamLeads([]);
    }
  }, []);

  useEffect(() => {
    // Use cached data if available
    if (usersCache.users) {
      setUsers(usersCache.users);
      setManagers(usersCache.managers || []);
      setTeamLeads(usersCache.teamLeads || []);
    }

    fetchUsers(!usersCache.users);
    fetchManagers();
    fetchTeamLeads();
  }, [fetchUsers, fetchManagers, fetchTeamLeads]);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingUser(record);
    form.setFieldsValue({
      ...record,
      password: undefined,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await userService.deleteUser(id);
      message.success('User deactivated successfully');
      fetchUsers(false);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to deactivate user');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingUser) {
        await userService.updateUser(editingUser.id, values);
        message.success('User updated successfully');
      } else {
        await userService.createUser(values);
        message.success('User created successfully');
      }
      setModalVisible(false);
      fetchUsers(false);
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Handle Pydantic validation errors
        const errorMessages = detail.map(err => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
        message.error(errorMessages);
      } else {
        message.error(detail || 'Operation failed');
      }
    }
  };

  // Handle modal close with confirmation
  const handleModalClose = () => {
    const formValues = form.getFieldsValue();
    const hasData = formValues.full_name || formValues.email || formValues.employee_id || formValues.password;

    if (hasData && !editingUser) {
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

  const getRoleOptions = () => {
    if (isAdmin()) {
      return [
        { value: 'manager', label: 'Manager' },
        { value: 'team_lead', label: 'Team Lead' },
        { value: 'employee', label: 'Associate' },
      ];
    } else if (isManager()) {
      return [
        { value: 'team_lead', label: 'Team Lead' },
        { value: 'employee', label: 'Associate' },
      ];
    }
    return [{ value: 'employee', label: 'Associate' }];
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => a.full_name.localeCompare(b.full_name),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Associate ID',
      dataIndex: 'employee_id',
      key: 'employee_id',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colors = {
          admin: 'red',
          delivery_manager: 'purple',
          manager: 'blue',
          team_lead: 'green',
          employee: 'default',
        };
        const displayNames = {
          admin: 'ADMIN',
          delivery_manager: 'DELIVERY MANAGER',
          manager: 'MANAGER',
          team_lead: 'TEAM LEAD',
          employee: 'ASSOCIATE',
        };
        return <Tag color={colors[role]}>{displayNames[role] || (role || '').replace('_', ' ').toUpperCase()}</Tag>;
      },
      filters: [
        { text: 'Delivery Manager', value: 'delivery_manager' },
        { text: 'Manager', value: 'manager' },
        { text: 'Team Lead', value: 'team_lead' },
        { text: 'Associate', value: 'employee' },
      ],
      onFilter: (value, record) => record.role === value,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: 'Projects',
      dataIndex: 'projects',
      key: 'projects',
      render: (projects) => (
        <span>
          {projects && projects.length > 0
            ? projects.map((project, index) => (
                <Tag key={index} color={project === 'Not Assigned' ? 'default' : 'cyan'}>
                  {project}
                </Tag>
              ))
            : <Tag color="default">Not Assigned</Tag>
          }
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
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
          {record.role !== 'admin' && record.role !== 'delivery_manager' && (
            <Popconfirm
              title="Are you sure you want to deactivate this user?"
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Deactivate
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>User Management</Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add User
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingUser ? 'Edit User' : 'Create User'}
        open={modalVisible}
        onCancel={handleModalClose}
        maskClosable={false}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="full_name"
                label="Full Name"
                rules={[
                  { required: true, message: 'Please enter full name' },
                  { min: 2, message: 'Name must be at least 2 characters' },
                  { max: 100, message: 'Name must not exceed 100 characters' }
                ]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email (Optional)"
                rules={[
                  { type: 'email', message: 'Please enter a valid email' },
                ]}
              >
                <Input disabled={!!editingUser} placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="employee_id"
                label="Associate ID"
                rules={[
                  { required: true, message: 'Please enter associate ID' },
                  { min: 3, message: 'ID must be at least 3 characters' },
                  { max: 20, message: 'ID must not exceed 20 characters' }
                ]}
              >
                <Input disabled={!!editingUser} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="role"
                label="Role"
                rules={[{ required: true, message: 'Please select role' }]}
              >
                <Select options={getRoleOptions()} disabled={editingUser && !isAdmin()} />
              </Form.Item>
            </Col>
          </Row>

          {!editingUser && (
            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter password' },
                { min: 6, message: 'Password must be at least 6 characters' }
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department" label="Department">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.role !== currentValues.role}
          >
            {({ getFieldValue }) => {
              const role = getFieldValue('role');
              return (
                <>
                  {(role === 'team_lead' || role === 'employee') && isAdmin() && (
                    <Form.Item name="manager_id" label="Manager">
                      <Select allowClear placeholder="Select manager">
                        {managers.map((m) => (
                          <Option key={m.id} value={m.id}>{m.full_name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}
                  {role === 'employee' && (
                    <Form.Item name="team_lead_id" label="Team Lead">
                      <Select allowClear placeholder="Select team lead">
                        {teamLeads.map((tl) => (
                          <Option key={tl.id} value={tl.id}>{tl.full_name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}
                </>
              );
            }}
          </Form.Item>

          {editingUser && (
            <Form.Item name="is_active" label="Status">
              <Select>
                <Option value={true}>Active</Option>
                <Option value={false}>Inactive</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingUser ? 'Update' : 'Create'}
              </Button>
              <Button onClick={handleModalClose}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Users;
