import { useState } from 'react';
import {
  Card, Form, Input, Button, Space, Typography, Row, Col, Avatar,
  Divider, message, Tag
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, IdcardOutlined,
  TeamOutlined, SaveOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../api/services';

const { Title, Text } = Typography;

const Profile = () => {
  const { user, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const handleUpdateProfile = async (values) => {
    setLoading(true);
    try {
      await userService.updateUser(user.id, {
        full_name: values.full_name,
        phone: values.phone,
      });
      message.success('Profile updated successfully');
      checkAuth(); // Refresh user data
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values) => {
    if (values.new_password !== values.confirm_password) {
      message.error('Passwords do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      await userService.updateUser(user.id, {
        password: values.new_password,
      });
      message.success('Password changed successfully');
      passwordForm.resetFields();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'red',
      manager: 'blue',
      team_lead: 'green',
      associate: 'default',
    };
    return colors[role] || 'default';
  };

  return (
    <div>
      <Title level={3}>My Profile</Title>

      <Row gutter={[24, 24]}>
        {/* Profile Overview */}
        <Col xs={24} lg={8}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Avatar
                size={100}
                style={{
                  backgroundColor: getRoleColor(user?.role) === 'default' ? '#108ee9' :
                    getRoleColor(user?.role) === 'red' ? '#f50' :
                    getRoleColor(user?.role) === 'blue' ? '#2db7f5' : '#87d068',
                  fontSize: 40,
                }}
              >
                {user?.full_name?.charAt(0)?.toUpperCase()}
              </Avatar>
              <Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
                {user?.full_name}
              </Title>
              <Tag color={getRoleColor(user?.role)} style={{ fontSize: 14 }}>
                {user?.role?.replace('_', ' ').toUpperCase()}
              </Tag>
            </div>

            <Divider />

            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text type="secondary"><MailOutlined /> Email</Text>
                <br />
                <Text strong>{user?.email}</Text>
              </div>
              <div>
                <Text type="secondary"><IdcardOutlined /> Associate ID</Text>
                <br />
                <Text strong>{user?.employee_id}</Text>
              </div>
              <div>
                <Text type="secondary"><TeamOutlined /> Department</Text>
                <br />
                <Text strong>{user?.department || 'Not assigned'}</Text>
              </div>
              <div>
                <Text type="secondary"><PhoneOutlined /> Phone</Text>
                <br />
                <Text strong>{user?.phone || 'Not provided'}</Text>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Edit Profile */}
        <Col xs={24} lg={16}>
          <Card title="Edit Profile" style={{ marginBottom: 24 }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                full_name: user?.full_name,
                email: user?.email,
                employee_id: user?.employee_id,
                phone: user?.phone,
                department: user?.department,
              }}
              onFinish={handleUpdateProfile}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="full_name"
                    label="Full Name"
                    rules={[{ required: true, message: 'Please enter your name' }]}
                  >
                    <Input prefix={<UserOutlined />} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="email" label="Email">
                    <Input prefix={<MailOutlined />} disabled />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="employee_id" label="Associate ID">
                    <Input prefix={<IdcardOutlined />} disabled />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="phone" label="Phone">
                    <Input prefix={<PhoneOutlined />} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="department" label="Department">
                <Input prefix={<TeamOutlined />} disabled />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={loading}
                >
                  Save Changes
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Change Password">
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={handleChangePassword}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="new_password"
                    label="New Password"
                    rules={[
                      { required: true, message: 'Please enter new password' },
                      { min: 6, message: 'Password must be at least 6 characters' },
                    ]}
                  >
                    <Input.Password />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="confirm_password"
                    label="Confirm Password"
                    rules={[
                      { required: true, message: 'Please confirm your password' },
                    ]}
                  >
                    <Input.Password />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={passwordLoading}
                >
                  Change Password
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Profile;

