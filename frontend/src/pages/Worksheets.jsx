import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  message, Typography, Row, Col, DatePicker, Tabs, Checkbox, Popconfirm
} from 'antd';
import { CheckOutlined, CloseOutlined, FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { worksheetService, formService, taskService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

const Worksheets = () => {
  const [worksheets, setWorksheets] = useState([]);
  const [pendingVerification, setPendingVerification] = useState([]);
  const [pendingApproval, setPendingApproval] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [forms, setForms] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [form] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const { user, isAdmin, isManager, isTeamLead, isEmployee } = useAuth();

  useEffect(() => {
    fetchWorksheets();
    if (isTeamLead()) {
      fetchPendingVerification();
    }
    if (isManager() || isAdmin()) {
      fetchPendingApproval();
    }
    if (isEmployee()) {
      fetchForms();
      fetchMyTasks();
    }
  }, []);

  const fetchWorksheets = async () => {
    try {
      setLoading(true);
      const response = isEmployee()
        ? await worksheetService.getMyWorksheets({})
        : await worksheetService.getWorksheets({});
      setWorksheets(response.data);
    } catch (error) {
      message.error('Failed to fetch worksheets');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingVerification = async () => {
    try {
      const response = await worksheetService.getPendingVerification();
      setPendingVerification(response.data);
    } catch (error) {
      console.error('Failed to fetch pending verification');
    }
  };

  const fetchPendingApproval = async () => {
    try {
      const response = await worksheetService.getPendingApproval();
      setPendingApproval(response.data);
    } catch (error) {
      console.error('Failed to fetch pending approval');
    }
  };

  const fetchForms = async () => {
    try {
      const response = await formService.getForms({ is_active: true });
      setForms(response.data);
    } catch (error) {
      console.error('Failed to fetch forms');
    }
  };

  const fetchMyTasks = async () => {
    try {
      const response = await taskService.getMyTasks({ status: 'completed' });
      setMyTasks(response.data);
    } catch (error) {
      console.error('Failed to fetch tasks');
    }
  };

  const handleCreateWorksheet = () => {
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
    setModalVisible(true);
  };

  const handleViewWorksheet = (record) => {
    setSelectedWorksheet(record);
    setViewModalVisible(true);
  };

  const handleSubmitWorksheet = async (values) => {
    try {
      // Build form responses
      const formResponses = [];
      const selectedForm = forms.find(f => f.id === values.form_id);
      if (selectedForm) {
        selectedForm.fields.forEach(field => {
          if (values[`field_${field.field_id}`] !== undefined) {
            formResponses.push({
              field_id: field.field_id,
              field_label: field.label,
              value: values[`field_${field.field_id}`],
            });
          }
        });
      }

      const data = {
        date: values.date.format('YYYY-MM-DD'),
        form_id: values.form_id,
        form_responses: formResponses,
        tasks_completed: values.tasks_completed || [],
        notes: values.notes,
      };

      const response = await worksheetService.createWorksheet(data);

      // Auto-submit if requested
      if (values.submit_now) {
        await worksheetService.submitWorksheet(response.data.id);
        message.success('Worksheet created and submitted!');
      } else {
        message.success('Worksheet saved as draft');
      }

      setModalVisible(false);
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to create worksheet');
    }
  };

  const handleSubmit = async (worksheetId) => {
    try {
      await worksheetService.submitWorksheet(worksheetId);
      message.success('Worksheet submitted for verification');
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to submit worksheet');
    }
  };

  const handleVerify = async (worksheetId) => {
    try {
      await worksheetService.verifyWorksheet(worksheetId);
      message.success('Worksheet verified');
      fetchPendingVerification();
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to verify worksheet');
    }
  };

  const handleApprove = async (worksheetId) => {
    try {
      await worksheetService.approveWorksheet(worksheetId);
      message.success('Worksheet approved');
      fetchPendingApproval();
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to approve worksheet');
    }
  };

  const handleBulkApprove = async () => {
    try {
      await worksheetService.bulkApprove({ worksheet_ids: selectedRows });
      message.success(`${selectedRows.length} worksheets approved`);
      setSelectedRows([]);
      fetchPendingApproval();
      fetchWorksheets();
    } catch (error) {
      message.error('Failed to bulk approve');
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
      fetchPendingApproval();
      fetchWorksheets();
    } catch (error) {
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

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    },
    ...(isEmployee() ? [] : [{
      title: 'Employee',
      dataIndex: 'employee_name',
      key: 'employee_name',
    }]),
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
      filters: [
        { text: 'Draft', value: 'draft' },
        { text: 'Submitted', value: 'submitted' },
        { text: 'TL Verified', value: 'tl_verified' },
        { text: 'Approved', value: 'manager_approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status === value,
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
          {isEmployee() && record.status === 'draft' && (
            <Button type="link" onClick={() => handleSubmit(record.id)}>
              Submit
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const verificationColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Employee', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewWorksheet(record)}>
            View
          </Button>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleVerify(record.id)}>
            Verify
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReject(record)}>
            Reject
          </Button>
        </Space>
      ),
    },
  ];

  const approvalColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Employee', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
    { title: 'Verified By', dataIndex: 'tl_verified_by', key: 'tl_verified_by' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewWorksheet(record)}>
            View
          </Button>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>
            Approve
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReject(record)}>
            Reject
          </Button>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedRows,
    onChange: setSelectedRows,
  };

  const renderFormFields = (selectedFormId) => {
    const selectedForm = forms.find(f => f.id === selectedFormId);
    if (!selectedForm) return null;

    return selectedForm.fields.map(field => {
      const fieldName = `field_${field.field_id}`;
      const rules = field.required ? [{ required: true, message: `${field.label} is required` }] : [];

      switch (field.field_type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'url':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <Input placeholder={field.placeholder} />
            </Form.Item>
          );
        case 'number':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <Input type="number" placeholder={field.placeholder} />
            </Form.Item>
          );
        case 'textarea':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <TextArea rows={3} placeholder={field.placeholder} />
            </Form.Item>
          );
        case 'select':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <Select placeholder={field.placeholder}>
                {field.options?.map(opt => (
                  <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          );
        case 'checkbox':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} valuePropName="checked">
              <Checkbox>{field.placeholder || field.label}</Checkbox>
            </Form.Item>
          );
        case 'date':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          );
        case 'rating':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <Select placeholder="Select rating">
                {[1, 2, 3, 4, 5].map(n => (
                  <Select.Option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          );
        default:
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <Input placeholder={field.placeholder} />
            </Form.Item>
          );
      }
    });
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>Worksheets</Title>
        </Col>
        {isEmployee() && (
          <Col>
            <Button type="primary" icon={<FileTextOutlined />} onClick={handleCreateWorksheet}>
              Create Worksheet
            </Button>
          </Col>
        )}
      </Row>

      <Tabs defaultActiveKey="all">
        <TabPane tab="All Worksheets" key="all">
          <Card>
            <Table
              dataSource={worksheets}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>

        {isTeamLead() && (
          <TabPane tab={`Pending Verification (${pendingVerification.length})`} key="verification">
            <Card>
              <Table
                dataSource={pendingVerification}
                columns={verificationColumns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </TabPane>
        )}

        {(isManager() || isAdmin()) && (
          <TabPane tab={`Pending Approval (${pendingApproval.length})`} key="approval">
            <Card>
              {selectedRows.length > 0 && (
                <Space style={{ marginBottom: 16 }}>
                  <Text>Selected: {selectedRows.length}</Text>
                  <Button type="primary" onClick={handleBulkApprove}>
                    Bulk Approve
                  </Button>
                </Space>
              )}
              <Table
                dataSource={pendingApproval}
                columns={approvalColumns}
                rowKey="id"
                rowSelection={rowSelection}
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </TabPane>
        )}
      </Tabs>

      {/* Create Worksheet Modal */}
      <Modal
        title="Create Daily Worksheet"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitWorksheet}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date"
                label="Date"
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="form_id"
                label="Form Template"
                rules={[{ required: true, message: 'Please select a form' }]}
              >
                <Select placeholder="Select form">
                  {forms.map(f => (
                    <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.form_id !== curr.form_id}
          >
            {({ getFieldValue }) => renderFormFields(getFieldValue('form_id'))}
          </Form.Item>

          <Form.Item name="tasks_completed" label="Tasks Completed Today">
            <Select mode="multiple" placeholder="Select completed tasks">
              {myTasks.map(task => (
                <Select.Option key={task.id} value={task.id}>{task.title}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Additional Notes">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="submit_now" valuePropName="checked">
            <Checkbox>Submit for verification immediately</Checkbox>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Save Worksheet
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

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
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" danger htmlType="submit">
                Reject
              </Button>
              <Button onClick={() => setRejectModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Worksheets;
