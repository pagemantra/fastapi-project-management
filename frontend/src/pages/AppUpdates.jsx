import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  message,
  Popconfirm,
  Typography,
  Switch,
  InputNumber,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import api from '../api/axios';
import moment from 'moment';

const { Title, Text } = Typography;
const { TextArea } = Input;

const AppUpdates = () => {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchUpdates();
  }, []);

  const fetchUpdates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/v1/app-updates');
      setUpdates(response.data);
    } catch (error) {
      message.error('Failed to fetch app updates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUpdate(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      file_name: 'Work Tracker Setup 1.0.0.exe'
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingUpdate(record);
    form.setFieldsValue({
      version: record.version,
      release_notes: record.release_notes,
      download_url: record.download_url,
      file_name: record.file_name,
      file_size: record.file_size,
      sha512: record.sha512,
      is_active: record.is_active
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/v1/app-updates/${id}`);
      message.success('Update deleted successfully');
      fetchUpdates();
    } catch (error) {
      message.error('Failed to delete update');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingUpdate) {
        await api.put(`/api/v1/app-updates/${editingUpdate._id}`, values);
        message.success('Update modified successfully');
      } else {
        await api.post('/api/v1/app-updates', values);
        message.success('Update created successfully');
      }
      setModalVisible(false);
      fetchUpdates();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const toggleActive = async (record) => {
    try {
      await api.put(`/api/v1/app-updates/${record._id}`, {
        is_active: !record.is_active
      });
      message.success(`Update ${!record.is_active ? 'activated' : 'deactivated'}`);
      fetchUpdates();
    } catch (error) {
      message.error('Failed to update status');
    }
  };

  const columns = [
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      render: (version) => <Tag color="blue">{version}</Tag>
    },
    {
      title: 'File Name',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true
    },
    {
      title: 'Size',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size) => size ? `${(size / 1024 / 1024).toFixed(2)} MB` : '-'
    },
    {
      title: 'Release Notes',
      dataIndex: 'release_notes',
      key: 'release_notes',
      ellipsis: true,
      width: 200
    },
    {
      title: 'Released',
      dataIndex: 'released_at',
      key: 'released_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm')
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={() => toggleActive(record)}
          checkedChildren={<CheckCircleOutlined />}
          unCheckedChildren={<CloseCircleOutlined />}
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          {record.download_url && (
            <Tooltip title="Download">
              <Button
                icon={<DownloadOutlined />}
                size="small"
                href={record.download_url}
                target="_blank"
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Delete this version?"
            onConfirm={() => handleDelete(record._id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <CloudUploadOutlined /> App Version Management
            </Title>
            <Text type="secondary">
              Manage desktop app versions and auto-updates
            </Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            New Version
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={updates}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingUpdate ? 'Edit Version' : 'New Version'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="version"
            label="Version"
            rules={[{ required: true, message: 'Please enter version' }]}
          >
            <Input placeholder="e.g., 1.0.1" />
          </Form.Item>

          <Form.Item
            name="file_name"
            label="File Name"
            rules={[{ required: true, message: 'Please enter file name' }]}
          >
            <Input placeholder="e.g., Work Tracker Setup 1.0.1.exe" />
          </Form.Item>

          <Form.Item
            name="download_url"
            label="Download URL"
            rules={[{ required: true, message: 'Please enter download URL' }]}
          >
            <Input placeholder="https://github.com/.../releases/download/v1.0.1/..." />
          </Form.Item>

          <Form.Item name="file_size" label="File Size (bytes)">
            <InputNumber style={{ width: '100%' }} placeholder="e.g., 78000000" />
          </Form.Item>

          <Form.Item name="sha512" label="SHA512 Hash (optional)">
            <Input placeholder="File hash for integrity verification" />
          </Form.Item>

          <Form.Item name="release_notes" label="Release Notes">
            <TextArea rows={4} placeholder="What's new in this version..." />
          </Form.Item>

          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingUpdate ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AppUpdates;
