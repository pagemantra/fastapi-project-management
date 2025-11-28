import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Tag, Card,
  message, Typography, Row, Col, Tabs
} from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { worksheetService } from '../api/services';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

const VerifyWorksheets = () => {
  const [pendingVerification, setPendingVerification] = useState([]);
  const [verifiedWorksheets, setVerifiedWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [rejectForm] = Form.useForm();

  useEffect(() => {
    fetchPendingVerification();
    fetchVerifiedWorksheets();
  }, []);

  const fetchPendingVerification = async () => {
    try {
      setLoading(true);
      const response = await worksheetService.getPendingVerification();
      setPendingVerification(response.data);
    } catch {
      message.error('Failed to fetch pending worksheets');
    } finally {
      setLoading(false);
    }
  };

  const fetchVerifiedWorksheets = async () => {
    try {
      const response = await worksheetService.getWorksheets({ status: 'tl_verified' });
      setVerifiedWorksheets(response.data);
    } catch {
      console.error('Failed to fetch verified worksheets');
    }
  };

  const handleViewWorksheet = (record) => {
    setSelectedWorksheet(record);
    setViewModalVisible(true);
  };

  const handleVerify = async (worksheetId) => {
    try {
      await worksheetService.verifyWorksheet(worksheetId);
      message.success('Worksheet verified successfully');
      fetchPendingVerification();
      fetchVerifiedWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to verify worksheet');
    }
  };

  const handleReject = (worksheet) => {
    setSelectedWorksheet(worksheet);
    rejectForm.resetFields();
    setRejectModalVisible(true);
  };

  const handleRejectSubmit = async (values) => {
    try {
      await worksheetService.rejectWorksheet(selectedWorksheet.id, {
        rejection_reason: values.rejection_reason,
      });
      message.success('Worksheet rejected');
      setRejectModalVisible(false);
      fetchPendingVerification();
      fetchVerifiedWorksheets();
    } catch {
      message.error('Failed to reject worksheet');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'default',
      submitted: 'blue',
      tl_verified: 'cyan',
      manager_approved: 'green',
      rejected: 'red',
    };
    return colors[status] || 'default';
  };

  const pendingColumns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
    },
    {
      title: 'Employee',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Form',
      dataIndex: 'form_name',
      key: 'form_name',
    },
    {
      title: 'Hours',
      dataIndex: 'total_hours',
      key: 'total_hours',
      render: (hours) => `${hours || 0} hrs`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewWorksheet(record)}
          >
            View
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleVerify(record.id)}
          >
            Verify
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleReject(record)}
          >
            Reject
          </Button>
        </Space>
      ),
    },
  ];

  const verifiedColumns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Employee',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Form',
      dataIndex: 'form_name',
      key: 'form_name',
    },
    {
      title: 'Hours',
      dataIndex: 'total_hours',
      key: 'total_hours',
      render: (hours) => `${hours || 0} hrs`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewWorksheet(record)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>
            <CheckSquareOutlined /> Verify Worksheets
          </Title>
          <Text type="secondary">Review and verify team member worksheets</Text>
        </Col>
      </Row>

      <Tabs defaultActiveKey="pending">
        <TabPane tab={`Pending Verification (${pendingVerification.length})`} key="pending">
          <Card>
            <Table
              dataSource={pendingVerification}
              columns={pendingColumns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>

        <TabPane tab={`Verified (${verifiedWorksheets.length})`} key="verified">
          <Card>
            <Table
              dataSource={verifiedWorksheets}
              columns={verifiedColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* View Worksheet Modal */}
      <Modal
        title="Worksheet Details"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedWorksheet && (
          <div>
            <p><strong>Date:</strong> {selectedWorksheet.date}</p>
            <p><strong>Employee:</strong> {selectedWorksheet.employee_name}</p>
            <p><strong>Form:</strong> {selectedWorksheet.form_name}</p>
            <p><strong>Status:</strong> <Tag color={getStatusColor(selectedWorksheet.status)}>
              {selectedWorksheet.status.replace('_', ' ').toUpperCase()}
            </Tag></p>
            <p><strong>Total Hours:</strong> {selectedWorksheet.total_hours || 0}</p>

            {selectedWorksheet.form_responses?.length > 0 && (
              <>
                <Title level={5}>Form Responses</Title>
                {selectedWorksheet.form_responses.map((resp, idx) => (
                  <p key={idx}><strong>{resp.field_label}:</strong> {String(resp.value)}</p>
                ))}
              </>
            )}

            {selectedWorksheet.notes && (
              <p><strong>Notes:</strong> {selectedWorksheet.notes}</p>
            )}

            {selectedWorksheet.rejection_reason && (
              <p style={{ color: 'red' }}>
                <strong>Rejection Reason:</strong> {selectedWorksheet.rejection_reason}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Reject Worksheet"
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        footer={null}
      >
        <Form form={rejectForm} layout="vertical" onFinish={handleRejectSubmit}>
          <Form.Item
            name="rejection_reason"
            label="Rejection Reason"
            rules={[{ required: true, min: 5, message: 'Please provide a reason (min 5 characters)' }]}
          >
            <TextArea rows={4} placeholder="Explain why this worksheet is being rejected..." />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" danger htmlType="submit">
                Reject Worksheet
              </Button>
              <Button onClick={() => setRejectModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VerifyWorksheets;
