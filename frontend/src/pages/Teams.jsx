import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  Popconfirm, message, Typography, Row, Col, List, Avatar
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { teamService, userService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;
const { Option } = Select;

const Teams = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [managers, setManagers] = useState([]);
  const [teamLeads, setTeamLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form] = Form.useForm();
  const [memberForm] = Form.useForm();
  const { isAdmin, isManager } = useAuth();

  useEffect(() => {
    fetchTeams();
    fetchManagers();
    fetchTeamLeads();
    fetchEmployees();
  }, []);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await teamService.getTeams({});
      setTeams(response.data);
    } catch (error) {
      message.error('Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  };

  const fetchManagers = async () => {
    try {
      if (isAdmin()) {
        const response = await userService.getManagers();
        setManagers(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch managers');
    }
  };

  const fetchTeamLeads = async () => {
    try {
      const response = await userService.getTeamLeads();
      setTeamLeads(response.data);
    } catch (error) {
      console.error('Failed to fetch team leads');
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await userService.getEmployees();
      setEmployees(response.data);
    } catch (error) {
      console.error('Failed to fetch employees');
    }
  };

  const handleCreate = () => {
    setEditingTeam(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingTeam(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await teamService.deleteTeam(id);
      message.success('Team deactivated successfully');
      fetchTeams();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to deactivate team');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingTeam) {
        await teamService.updateTeam(editingTeam.id, values);
        message.success('Team updated successfully');
      } else {
        await teamService.createTeam(values);
        message.success('Team created successfully');
      }
      setModalVisible(false);
      fetchTeams();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleManageMembers = (team) => {
    setSelectedTeam(team);
    memberForm.resetFields();
    setMemberModalVisible(true);
  };

  const handleAddMember = async (values) => {
    try {
      await teamService.addMember(selectedTeam.id, { employee_id: values.employee_id });
      message.success('Member added successfully');
      fetchTeams();
      // Refresh selected team
      const updatedTeam = await teamService.getTeam(selectedTeam.id);
      setSelectedTeam(updatedTeam.data);
      memberForm.resetFields();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (employeeId) => {
    try {
      await teamService.removeMember(selectedTeam.id, employeeId);
      message.success('Member removed successfully');
      fetchTeams();
      // Refresh selected team
      const updatedTeam = await teamService.getTeam(selectedTeam.id);
      setSelectedTeam(updatedTeam.data);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to remove member');
    }
  };

  const getTeamLeadName = (teamLeadId) => {
    const tl = teamLeads.find(t => t.id === teamLeadId);
    return tl?.full_name || 'Unknown';
  };

  const getManagerName = (managerId) => {
    const m = managers.find(m => m.id === managerId);
    return m?.full_name || 'Unknown';
  };

  const columns = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <TeamOutlined />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Team Lead',
      dataIndex: 'team_lead_id',
      key: 'team_lead_id',
      render: (id) => getTeamLeadName(id),
    },
    {
      title: 'Members',
      dataIndex: 'members',
      key: 'members',
      render: (members) => (
        <Tag color="blue">{members?.length || 0} members</Tag>
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
            icon={<UserAddOutlined />}
            onClick={() => handleManageMembers(record)}
          >
            Members
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to deactivate this team?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Deactivate
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>Team Management</Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Create Team
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={teams}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create/Edit Team Modal */}
      <Modal
        title={editingTeam ? 'Edit Team' : 'Create Team'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Team Name"
            rules={[{ required: true, message: 'Please enter team name' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>

          {isAdmin() && !editingTeam && (
            <Form.Item
              name="manager_id"
              label="Manager"
              rules={[{ required: true, message: 'Please select manager' }]}
            >
              <Select placeholder="Select manager">
                {managers.map((m) => (
                  <Option key={m.id} value={m.id}>{m.full_name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="team_lead_id"
            label="Team Lead"
            rules={[{ required: !editingTeam, message: 'Please select team lead' }]}
          >
            <Select placeholder="Select team lead">
              {teamLeads.map((tl) => (
                <Option key={tl.id} value={tl.id}>{tl.full_name}</Option>
              ))}
            </Select>
          </Form.Item>

          {editingTeam && (
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
                {editingTeam ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Manage Members Modal */}
      <Modal
        title={`Manage Members - ${selectedTeam?.name}`}
        open={memberModalVisible}
        onCancel={() => setMemberModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form form={memberForm} layout="inline" onFinish={handleAddMember} style={{ marginBottom: 16 }}>
          <Form.Item
            name="employee_id"
            rules={[{ required: true, message: 'Select employee' }]}
            style={{ flex: 1 }}
          >
            <Select placeholder="Select employee to add">
              {employees
                .filter(e => !selectedTeam?.members?.includes(e.id))
                .map((emp) => (
                  <Option key={emp.id} value={emp.id}>{emp.full_name}</Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              Add
            </Button>
          </Form.Item>
        </Form>

        <List
          header={<Text strong>Current Members ({selectedTeam?.members?.length || 0})</Text>}
          bordered
          dataSource={selectedTeam?.members || []}
          renderItem={(memberId) => {
            const member = employees.find(e => e.id === memberId);
            return (
              <List.Item
                actions={[
                  <Popconfirm
                    title="Remove this member?"
                    onConfirm={() => handleRemoveMember(memberId)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button type="link" danger size="small">Remove</Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar>{member?.full_name?.charAt(0)}</Avatar>}
                  title={member?.full_name || 'Unknown'}
                  description={member?.email}
                />
              </List.Item>
            );
          }}
        />
      </Modal>
    </div>
  );
};

export default Teams;
