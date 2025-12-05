import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  message, Typography, Row, Col, DatePicker, Tabs, Checkbox, Popconfirm, TimePicker, Alert
} from 'antd';
import { CheckOutlined, CloseOutlined, FileTextOutlined, EyeOutlined, DownloadOutlined, FilterOutlined, ExclamationCircleOutlined, EditOutlined, RedoOutlined } from '@ant-design/icons';
import { worksheetService, formService, teamService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

const Worksheets = () => {
  const [worksheets, setWorksheets] = useState([]);
  const [pendingVerification, setPendingVerification] = useState([]);
  const [pendingApproval, setPendingApproval] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [forms, setForms] = useState([]);
  const [teamForm, setTeamForm] = useState(null);  // Default form from team
  const [myTeam, setMyTeam] = useState(null);  // User's team info
  const [dateRange, setDateRange] = useState(null);
  const [filteredWorksheets, setFilteredWorksheets] = useState([]);
  const [totalHours, setTotalHours] = useState(0);  // Calculated total hours
  const [editTotalHours, setEditTotalHours] = useState(0);  // For edit modal
  const [form] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [editForm] = Form.useForm();
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
      fetchTeamAndForm();
    }
  }, []);

  const fetchWorksheets = async () => {
    try {
      setLoading(true);
      const response = isEmployee()
        ? await worksheetService.getMyWorksheets({})
        : await worksheetService.getWorksheets({});
      setWorksheets(response.data || []);
    } catch (error) {
      console.error('Failed to fetch worksheets:', error);
      setWorksheets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingVerification = async () => {
    try {
      const response = await worksheetService.getPendingVerification();
      setPendingVerification(response.data || []);
    } catch (error) {
      console.error('Failed to fetch pending verification');
      setPendingVerification([]);
    }
  };

  const fetchPendingApproval = async () => {
    try {
      const response = await worksheetService.getPendingApproval();
      setPendingApproval(response.data || []);
    } catch (error) {
      console.error('Failed to fetch pending approval');
      setPendingApproval([]);
    }
  };

  const fetchTeamAndForm = async () => {
    try {
      // Get user's team
      const teamsResponse = await teamService.getTeams({});
      const teams = teamsResponse.data || [];

      if (teams.length > 0) {
        const team = teams[0];  // User's team
        setMyTeam(team);

        // Get forms assigned to this team
        const formsResponse = await formService.getTeamForms(team.id);
        const teamForms = formsResponse.data || [];
        setForms(teamForms);

        if (teamForms.length > 0) {
          setTeamForm(teamForms[0]);  // Default form for the team
        }
      } else {
        // Fallback: get all active forms if no team found
        const response = await formService.getForms({ is_active: true });
        setForms(response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch team/forms:', error);
      setForms([]);
    }
  };

  const handleCreateWorksheet = () => {
    form.resetFields();
    setTotalHours(0);
    form.setFieldsValue({
      date: dayjs(),
      submit_now: true,  // Auto-check submit for verification
      form_id: teamForm?.id,  // Auto-set team's default form
    });
    setModalVisible(true);
  };

  // Calculate total hours when login/logout time changes
  const handleTimeChange = () => {
    const loginTime = form.getFieldValue('login_time');
    const logoutTime = form.getFieldValue('logout_time');

    if (loginTime && logoutTime) {
      const diffMinutes = logoutTime.diff(loginTime, 'minute');
      const hours = Math.max(0, diffMinutes / 60);
      setTotalHours(parseFloat(hours.toFixed(2)));
    } else {
      setTotalHours(0);
    }
  };

  const handleViewWorksheet = (record) => {
    setSelectedWorksheet(record);
    setViewModalVisible(true);
  };

  const handleSubmitWorksheet = async (values) => {
    try {
      // Build form responses
      const formResponses = [];
      const selectedForm = forms.find(f => f.id === values.form_id) || teamForm;
      if (selectedForm) {
        selectedForm.fields.forEach(field => {
          let fieldValue = values[`field_${field.field_id}`];
          // Format time values to HH:mm string
          if (field.field_type === 'time' && fieldValue) {
            fieldValue = fieldValue.format('HH:mm');
          }
          if (fieldValue !== undefined) {
            formResponses.push({
              field_id: field.field_id,
              field_label: field.label,
              value: fieldValue,
            });
          }
        });
      }

      // Add login/logout times to form responses
      if (values.login_time) {
        formResponses.push({
          field_id: 'login_time',
          field_label: 'Login Time',
          value: values.login_time.format('HH:mm'),
        });
      }
      if (values.logout_time) {
        formResponses.push({
          field_id: 'logout_time',
          field_label: 'Logout Time',
          value: values.logout_time.format('HH:mm'),
        });
      }

      const data = {
        date: values.date.format('YYYY-MM-DD'),
        form_id: values.form_id || teamForm?.id,
        form_responses: formResponses,
        tasks_completed: [],
        total_hours: totalHours,  // Include calculated total hours
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

  // Handle editing rejected worksheet
  const handleEditRejected = (worksheet) => {
    setSelectedWorksheet(worksheet);
    editForm.resetFields();

    // Pre-fill form with existing data
    const formValues = {
      date: dayjs(worksheet.date),
      notes: worksheet.notes,
    };

    // Extract login/logout times from form_responses
    if (worksheet.form_responses) {
      const loginResponse = worksheet.form_responses.find(r => r.field_id === 'login_time');
      const logoutResponse = worksheet.form_responses.find(r => r.field_id === 'logout_time');
      if (loginResponse?.value) {
        formValues.login_time = dayjs(loginResponse.value, 'HH:mm');
      }
      if (logoutResponse?.value) {
        formValues.logout_time = dayjs(logoutResponse.value, 'HH:mm');
      }

      // Fill other form fields
      worksheet.form_responses.forEach(resp => {
        if (resp.field_id !== 'login_time' && resp.field_id !== 'logout_time') {
          formValues[`field_${resp.field_id}`] = resp.value;
        }
      });
    }

    editForm.setFieldsValue(formValues);
    setEditTotalHours(worksheet.total_hours || 0);
    setEditModalVisible(true);
  };

  // Handle edit time change
  const handleEditTimeChange = () => {
    const loginTime = editForm.getFieldValue('login_time');
    const logoutTime = editForm.getFieldValue('logout_time');

    if (loginTime && logoutTime) {
      const diffMinutes = logoutTime.diff(loginTime, 'minute');
      const hours = Math.max(0, diffMinutes / 60);
      setEditTotalHours(parseFloat(hours.toFixed(2)));
    } else {
      setEditTotalHours(0);
    }
  };

  // Submit edited worksheet
  const handleEditSubmit = async (values) => {
    try {
      // Build form responses
      const formResponses = [];
      const selectedForm = forms.find(f => f.id === selectedWorksheet.form_id) || teamForm;
      if (selectedForm) {
        selectedForm.fields.forEach(field => {
          let fieldValue = values[`field_${field.field_id}`];
          if (field.field_type === 'time' && fieldValue) {
            fieldValue = fieldValue.format('HH:mm');
          }
          if (fieldValue !== undefined) {
            formResponses.push({
              field_id: field.field_id,
              field_label: field.label,
              value: fieldValue,
            });
          }
        });
      }

      // Add login/logout times
      if (values.login_time) {
        formResponses.push({
          field_id: 'login_time',
          field_label: 'Login Time',
          value: values.login_time.format('HH:mm'),
        });
      }
      if (values.logout_time) {
        formResponses.push({
          field_id: 'logout_time',
          field_label: 'Logout Time',
          value: values.logout_time.format('HH:mm'),
        });
      }

      // Update the worksheet
      await worksheetService.updateWorksheet(selectedWorksheet.id, {
        form_responses: formResponses,
        notes: values.notes,
        total_hours: editTotalHours,
      });

      // Auto-submit if requested
      if (values.submit_now) {
        await worksheetService.submitWorksheet(selectedWorksheet.id);
        message.success('Worksheet updated and resubmitted!');
      } else {
        message.success('Worksheet updated and saved as draft');
      }

      setEditModalVisible(false);
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to update worksheet');
    }
  };

  // Direct resubmit rejected worksheet
  const handleResubmit = async (worksheetId) => {
    try {
      await worksheetService.submitWorksheet(worksheetId);
      message.success('Worksheet resubmitted for verification');
      fetchWorksheets();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to resubmit worksheet');
    }
  };

  // Get rejected worksheets for alert
  const rejectedWorksheets = worksheets.filter(w => w.status === 'rejected');

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

  // Handle modal close with confirmation
  const handleModalClose = () => {
    const formValues = form.getFieldsValue();
    const hasData = formValues.login_time || formValues.logout_time || formValues.notes;

    if (hasData) {
      Modal.confirm({
        title: 'Unsaved Changes',
        icon: <ExclamationCircleOutlined />,
        content: 'You have unsaved data. Are you sure you want to close without saving?',
        okText: 'Yes, Close',
        cancelText: 'No, Continue Editing',
        onOk: () => {
          setModalVisible(false);
          form.resetFields();
          setTotalHours(0);
        },
      });
    } else {
      setModalVisible(false);
      setTotalHours(0);
    }
  };

  // Handle reject modal close with confirmation
  const handleRejectModalClose = () => {
    const reason = rejectForm.getFieldValue('rejection_reason');

    if (reason && reason.trim()) {
      Modal.confirm({
        title: 'Unsaved Changes',
        icon: <ExclamationCircleOutlined />,
        content: 'You have entered a rejection reason. Are you sure you want to close without saving?',
        okText: 'Yes, Close',
        cancelText: 'No, Continue Editing',
        onOk: () => {
          setRejectModalVisible(false);
          rejectForm.resetFields();
        },
      });
    } else {
      setRejectModalVisible(false);
    }
  };

  // Filter worksheets by date range
  const handleDateFilter = (dates) => {
    setDateRange(dates);
    if (!dates || dates.length !== 2) {
      setFilteredWorksheets(worksheets);
      return;
    }
    const [startDate, endDate] = dates;
    const filtered = worksheets.filter(ws => {
      const wsDate = dayjs(ws.date);
      return wsDate.isAfter(startDate.subtract(1, 'day')) && wsDate.isBefore(endDate.add(1, 'day'));
    });
    setFilteredWorksheets(filtered);
  };

  // Clear date filter
  const handleClearFilter = () => {
    setDateRange(null);
    setFilteredWorksheets(worksheets);
  };

  // Get the data to display (filtered or all)
  const getDisplayData = () => {
    if (dateRange && dateRange.length === 2) {
      return filteredWorksheets;
    }
    return worksheets;
  };

  // Export worksheets to CSV - same columns as displayed in table
  const handleExportCSV = () => {
    const dataToExport = getDisplayData();
    if (dataToExport.length === 0) {
      message.warning('No data to export');
      return;
    }

    // Build CSV content - same columns as table: Date, Associate, Form, Hours, Status
    const headers = ['Date', 'Associate', 'Form', 'Hours', 'Status'];
    const csvRows = [headers.join(',')];

    dataToExport.forEach(ws => {
      const row = [
        ws.date,
        `"${ws.employee_name || ''}"`,
        `"${ws.form_name || ''}"`,
        `${ws.total_hours || 0} hrs`,
        ws.status?.replace('_', ' ').toUpperCase() || '',
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `worksheets_${dayjs().format('YYYY-MM-DD')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Worksheets exported successfully');
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    },
    ...(isEmployee() ? [] : [{
      title: 'Associate',
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
          {isEmployee() && record.status === 'rejected' && (
            <>
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEditRejected(record)}
              >
                Edit
              </Button>
              <Button
                type="link"
                icon={<RedoOutlined />}
                onClick={() => handleResubmit(record.id)}
              >
                Resubmit
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const verificationColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
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
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
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
    const selectedForm = forms.find(f => f.id === selectedFormId) || teamForm;
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
        case 'time':
          return (
            <Form.Item key={field.field_id} name={fieldName} label={field.label} rules={rules}>
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
                placeholder={field.placeholder || 'Select time (24-hour)'}
              />
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

      {/* Alert for rejected worksheets */}
      {isEmployee() && rejectedWorksheets.length > 0 && (
        <Alert
          message="Worksheet Rejected"
          description={
            <div>
              <p>You have {rejectedWorksheets.length} rejected worksheet(s) that need your attention:</p>
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                {rejectedWorksheets.slice(0, 3).map(ws => (
                  <li key={ws.id}>
                    <strong>{ws.date}</strong>: {ws.rejection_reason || 'No reason provided'}
                    <Space style={{ marginLeft: 8 }}>
                      <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditRejected(ws)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        icon={<RedoOutlined />}
                        onClick={() => handleResubmit(ws.id)}
                      >
                        Resubmit
                      </Button>
                    </Space>
                  </li>
                ))}
              </ul>
              {rejectedWorksheets.length > 3 && (
                <Text type="secondary">...and {rejectedWorksheets.length - 3} more</Text>
              )}
            </div>
          }
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs defaultActiveKey="all">
        <TabPane tab="All Worksheets" key="all">
          <Card>
            {/* Filter and Export Options - Only for Admin, Manager, Team Lead */}
            {(isAdmin() || isManager() || isTeamLead()) && (
              <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
                <Col>
                  <Space>
                    <FilterOutlined />
                    <Text>Filter by Date:</Text>
                    <RangePicker
                      value={dateRange}
                      onChange={handleDateFilter}
                      format="YYYY-MM-DD"
                    />
                    {dateRange && (
                      <Button size="small" onClick={handleClearFilter}>
                        Clear Filter
                      </Button>
                    )}
                  </Space>
                </Col>
                <Col flex="auto" style={{ textAlign: 'right' }}>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={handleExportCSV}
                  >
                    Export Data
                  </Button>
                </Col>
              </Row>
            )}
            <Table
              dataSource={getDisplayData()}
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
        onCancel={handleModalClose}
        maskClosable={false}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitWorksheet}>
          {/* Hidden form_id field */}
          <Form.Item name="form_id" hidden>
            <Input />
          </Form.Item>

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
              <Form.Item label="Project / Form Template">
                <Input
                  value={teamForm?.name || myTeam?.name || 'No form assigned'}
                  disabled
                  style={{ backgroundColor: '#f5f5f5' }}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Auto-filled Associate Details */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Associate Name">
                <Input value={user?.full_name} disabled style={{ backgroundColor: '#f5f5f5' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Associate ID">
                <Input value={user?.employee_id} disabled style={{ backgroundColor: '#f5f5f5' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Login/Logout Time and Total Hours */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="login_time"
                label="Login Time"
                rules={[{ required: true, message: 'Please select login time' }]}
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select login time"
                  onChange={handleTimeChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="logout_time"
                label="Logout Time"
                rules={[{ required: true, message: 'Please select logout time' }]}
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select logout time"
                  onChange={handleTimeChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Total Hours">
                <Input
                  value={`${totalHours} hrs`}
                  disabled
                  style={{ backgroundColor: '#e6f7ff', fontWeight: 'bold' }}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Dynamic Form Fields */}
          {teamForm && renderFormFields(teamForm.id)}

          <Form.Item name="notes" label="Additional Notes">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="submit_now" valuePropName="checked">
            <Checkbox>Submit for verification immediately</Checkbox>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" disabled={!teamForm}>
                Save Worksheet
              </Button>
              <Button onClick={handleModalClose}>Cancel</Button>
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
            <p><strong>Associate:</strong> {selectedWorksheet.employee_name}</p>
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
        onCancel={handleRejectModalClose}
        maskClosable={false}
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
              <Button onClick={handleRejectModalClose}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Rejected Worksheet Modal */}
      <Modal
        title="Edit Rejected Worksheet"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        maskClosable={false}
        footer={null}
        width={700}
      >
        {selectedWorksheet && (
          <>
            <Alert
              message="This worksheet was rejected"
              description={`Reason: ${selectedWorksheet.rejection_reason || 'No reason provided'}`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Date">
                    <Input value={selectedWorksheet.date} disabled style={{ backgroundColor: '#f5f5f5' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Project / Form">
                    <Input value={selectedWorksheet.form_name || 'N/A'} disabled style={{ backgroundColor: '#f5f5f5' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="login_time"
                    label="Login Time"
                    rules={[{ required: true, message: 'Please select login time' }]}
                  >
                    <TimePicker
                      format="HH:mm"
                      style={{ width: '100%' }}
                      placeholder="Select login time"
                      onChange={handleEditTimeChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="logout_time"
                    label="Logout Time"
                    rules={[{ required: true, message: 'Please select logout time' }]}
                  >
                    <TimePicker
                      format="HH:mm"
                      style={{ width: '100%' }}
                      placeholder="Select logout time"
                      onChange={handleEditTimeChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Total Hours">
                    <Input
                      value={`${editTotalHours} hrs`}
                      disabled
                      style={{ backgroundColor: '#e6f7ff', fontWeight: 'bold' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="notes" label="Additional Notes">
                <TextArea rows={3} />
              </Form.Item>

              <Form.Item name="submit_now" valuePropName="checked" initialValue={true}>
                <Checkbox>Resubmit for verification immediately</Checkbox>
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    Save & Resubmit
                  </Button>
                  <Button onClick={() => setEditModalVisible(false)}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
};

export default Worksheets;
