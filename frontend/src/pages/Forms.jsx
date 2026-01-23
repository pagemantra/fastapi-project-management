import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card,
  message, Typography, Row, Col, Collapse, Checkbox, InputNumber, Popconfirm
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { formService, teamService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

const fieldTypes = [
  { value: 'text', label: 'Text Input' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'rating', label: 'Rating' },
];

// Module-level cache for instant loading
const formsCache = {
  forms: null,
  teams: null
};

const Forms = () => {
  const [forms, setForms] = useState(formsCache.forms || []);
  const [teams, setTeams] = useState(formsCache.teams || []);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingForm, setEditingForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [form] = Form.useForm();
  const { isAdmin, isManager } = useAuth();
  const fetchingRef = useRef(false);

  const fetchForms = useCallback(async (showLoading = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      if (showLoading && !formsCache.forms) setLoading(true);
      const response = await formService.getForms({});
      const data = response.data || [];
      formsCache.forms = data;
      setForms(data);
    } catch (error) {
      if (!formsCache.forms) setForms([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teamService.getTeams({});
      const data = response.data || [];
      formsCache.teams = data;
      setTeams(data);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      if (!formsCache.teams) setTeams([]);
    }
  }, []);

  useEffect(() => {
    // Use cached data if available
    if (formsCache.forms) {
      setForms(formsCache.forms);
      setTeams(formsCache.teams || []);
    }

    fetchForms(!formsCache.forms);
    fetchTeams();
  }, [fetchForms, fetchTeams]);

  const handleCreate = () => {
    setEditingForm(null);
    setFields([]);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingForm(record);
    setFields(record.fields || []);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      assigned_teams: record.assigned_teams,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await formService.deleteForm(id);
      message.success('Form deactivated');
      fetchForms(false);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to delete form');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        name: values.name,
        description: values.description,
        fields: fields,
        assigned_teams: values.assigned_teams || [],
      };

      if (editingForm) {
        await formService.updateForm(editingForm.id, data);
        message.success('Form updated');
      } else {
        await formService.createForm(data);
        message.success('Form created');
      }
      setModalVisible(false);
      fetchForms(false);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const addField = () => {
    const newField = {
      field_id: `field_${Date.now()}`,
      field_type: 'text',
      label: `Field ${fields.length + 1}`,
      placeholder: '',
      required: false,
      options: [],
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (index, key, value, additionalUpdates = {}) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value, ...additionalUpdates };
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields.map((f, i) => ({ ...f, order: i })));
  };

  const duplicateField = (index) => {
    const fieldToCopy = { ...fields[index] };
    fieldToCopy.field_id = `field_${Date.now()}`;
    fieldToCopy.label = `${fieldToCopy.label} (Copy)`;
    const newFields = [...fields];
    newFields.splice(index + 1, 0, fieldToCopy);
    setFields(newFields.map((f, i) => ({ ...f, order: i })));
  };

  // Handle modal close with confirmation
  const handleModalClose = () => {
    const formValues = form.getFieldsValue();
    const hasData = formValues.name || formValues.description || fields.length > 0;

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
          setFields([]);
        },
      });
    } else {
      setModalVisible(false);
    }
  };

  const columns = [
    {
      title: 'Form Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Fields',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields) => <Tag color="blue">{fields?.length || 0} fields</Tag>,
    },
    {
      title: 'Assigned Projects',
      dataIndex: 'assigned_teams',
      key: 'assigned_teams',
      render: (teamIds) => (
        <Space wrap>
          {teamIds?.slice(0, 2).map(id => {
            const team = teams.find(t => t.id === id);
            return <Tag key={id}>{team?.name || id}</Tag>;
          })}
          {teamIds?.length > 2 && <Tag>+{teamIds.length - 2}</Tag>}
        </Space>
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
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Deactivate this form?"
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
          <Title level={3}>Form Builder</Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Create Form
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={forms}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingForm ? 'Edit Form' : 'Create Form'}
        open={modalVisible}
        onCancel={handleModalClose}
        maskClosable={false}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Form Name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assigned_teams" label="Assign to Projects">
                <Select mode="multiple" placeholder="Select projects">
                  {teams.map(team => (
                    <Select.Option key={team.id} value={team.id}>{team.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} />
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <Row justify="space-between" align="middle">
              <Col>
                <Title level={5}>Form Fields</Title>
              </Col>
              <Col>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addField}>
                  Add Field
                </Button>
              </Col>
            </Row>
          </div>

          {fields.length === 0 ? (
            <Card style={{ textAlign: 'center', color: '#999' }}>
              No fields yet. Click "Add Field" to start building your form.
            </Card>
          ) : (
            <Collapse defaultActiveKey={fields.map((_, i) => i.toString())}>
              {fields.map((field, index) => (
                <Panel
                  header={
                    <Space>
                      <span>{field.label || `Field ${index + 1}`}</span>
                      <Tag>{field.field_type}</Tag>
                      {field.required && <Tag color="red">Required</Tag>}
                    </Space>
                  }
                  key={index}
                  extra={
                    <Space onClick={e => e.stopPropagation()}>
                      <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveField(index, 'up')} disabled={index === 0} />
                      <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveField(index, 'down')} disabled={index === fields.length - 1} />
                      <Button size="small" icon={<CopyOutlined />} onClick={() => duplicateField(index)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeField(index)} />
                    </Space>
                  }
                >
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="Field Type">
                        <Select
                          value={field.field_type}
                          onChange={(v) => updateField(index, 'field_type', v)}
                        >
                          {fieldTypes.map(t => (
                            <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="Label">
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(index, 'label', e.target.value)}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="Placeholder">
                        <Input
                          value={field.placeholder}
                          onChange={(e) => updateField(index, 'placeholder', e.target.value)}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item>
                        <Checkbox
                          checked={field.required}
                          onChange={(e) => updateField(index, 'required', e.target.checked)}
                        >
                          Required
                        </Checkbox>
                      </Form.Item>
                    </Col>
                  </Row>

                  {['select', 'multi_select', 'checkbox'].includes(field.field_type) && (
                    <Form.Item label="Options (one per line)" help="Enter each option on a new line. Press Enter after each option.">
                      <TextArea
                        rows={5}
                        autoSize={{ minRows: 5, maxRows: 10 }}
                        value={field.optionsText !== undefined ? field.optionsText : (field.options?.join('\n') || '')}
                        onChange={(e) => {
                          const text = e.target.value;
                          // Store raw text for editing, and parsed options for saving - update both at once
                          const options = text.split('\n').map(s => s.trim()).filter(Boolean);
                          updateField(index, 'optionsText', text, { options });
                        }}
                        onBlur={(e) => {
                          // Clean up on blur - remove optionsText and normalize options
                          const text = e.target.value;
                          const options = text.split('\n').map(s => s.trim()).filter(Boolean);
                          updateField(index, 'options', options, { optionsText: undefined });
                        }}
                        onKeyDown={(e) => {
                          // Prevent Enter from submitting the form - allow newlines in TextArea
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                          }
                        }}
                        placeholder={`Option 1\nOption 2\nOption 3\nOption 4\nOption 5`}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </Form.Item>
                  )}

                  {field.field_type === 'number' && (
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item label="Min Value">
                          <InputNumber
                            style={{ width: '100%' }}
                            value={field.validation?.min}
                            onChange={(v) => updateField(index, 'validation', { ...field.validation, min: v })}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Max Value">
                          <InputNumber
                            style={{ width: '100%' }}
                            value={field.validation?.max}
                            onChange={(v) => updateField(index, 'validation', { ...field.validation, max: v })}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </Panel>
              ))}
            </Collapse>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingForm ? 'Update Form' : 'Create Form'}
              </Button>
              <Button onClick={handleModalClose}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Forms;
