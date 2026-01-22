import { useState, useEffect } from 'react';
import {
  Card, Tabs, DatePicker, Button, Table, Space, Typography, Row, Col,
  Statistic, message, Spin, Select, Tag, Collapse, Badge
} from 'antd';
import { DownloadOutlined, ReloadOutlined, TeamOutlined, UserOutlined, CheckCircleOutlined, PictureOutlined, FileTextOutlined } from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import { reportService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from '../utils/dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Panel } = Collapse;
const { Option } = Select;

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(30, 'day'),
    dayjs()
  ]);
  const [productivityData, setProductivityData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [overtimeData, setOvertimeData] = useState([]);
  const [worksheetAnalytics, setWorksheetAnalytics] = useState(null);
  const [teamPerformance, setTeamPerformance] = useState([]);
  const [projectsData, setProjectsData] = useState([]);
  const [managerMembers, setManagerMembers] = useState({ managers: [], data: [] });
  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedProjectMember, setSelectedProjectMember] = useState({}); // Per-project member selection
  useAuth(); // Auth check

  useEffect(() => {
    fetchAllReports();
  }, [dateRange]);

  const fetchAllReports = async () => {
    setLoading(true);
    const params = {
      start_date: dateRange[0].format('YYYY-MM-DD'),
      end_date: dateRange[1].format('YYYY-MM-DD'),
    };

    try {
      // Fetch all reports in parallel including manager members
      const [productivity, attendance, overtime, worksheet, team, projects, managerMembersRes] = await Promise.all([
        reportService.getProductivityReport(params),
        reportService.getAttendanceReport(params),
        reportService.getOvertimeReport(params),
        reportService.getWorksheetAnalytics(params),
        reportService.getTeamPerformance(params),
        reportService.getProjectsReport(params),
        reportService.getManagerMembers(params),
      ]);

      setProductivityData(productivity.data.data || []);
      setAttendanceData(attendance.data.data || []);
      setOvertimeData(overtime.data.data || []);
      setWorksheetAnalytics(worksheet.data);
      setTeamPerformance(team.data.data || []);
      setProjectsData(projects.data.data || []);
      setManagerMembers({
        managers: managerMembersRes.data.managers || [],
        data: managerMembersRes.data.data || []
      });
    } catch {
      message.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchManagerMembers = async (params) => {
    try {
      const managerParams = {
        ...params,
        ...(selectedManager && { manager_id: selectedManager })
      };
      const response = await reportService.getManagerMembers(managerParams);
      setManagerMembers({
        managers: response.data.managers || [],
        data: response.data.data || []
      });
    } catch (error) {
      console.error('Failed to fetch manager members:', error);
    }
  };

  const handleManagerChange = async (managerId) => {
    setSelectedManager(managerId);
    setSelectedMember(null);
    const params = {
      start_date: dateRange[0].format('YYYY-MM-DD'),
      end_date: dateRange[1].format('YYYY-MM-DD'),
      manager_id: managerId
    };
    try {
      const response = await reportService.getManagerMembers(params);
      setManagerMembers({
        ...managerMembers,
        data: response.data.data || []
      });
    } catch (error) {
      message.error('Failed to fetch member data');
    }
  };

  const handleExport = async (type) => {
    try {
      const params = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
        format: 'csv',
      };

      let response;
      let filename;

      switch (type) {
        case 'productivity':
          response = await reportService.exportProductivity(params);
          filename = 'productivity_report.csv';
          break;
        case 'attendance':
          response = await reportService.exportAttendance(params);
          filename = 'attendance_report.csv';
          break;
        case 'overtime':
          response = await reportService.exportOvertime(params);
          filename = 'overtime_report.csv';
          break;
        default:
          return;
      }

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      message.success('Report exported successfully');
    } catch (error) {
      message.error('Failed to export report');
    }
  };

  const productivityColumns = [
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: 'Tasks Completed', dataIndex: 'tasks_completed', key: 'tasks_completed' },
    { title: 'Total Tasks', dataIndex: 'total_tasks', key: 'total_tasks' },
    {
      title: 'Completion Rate',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      render: (v) => `${v}%`,
      sorter: (a, b) => a.completion_rate - b.completion_rate,
    },
    { title: 'Days Worked', dataIndex: 'days_worked', key: 'days_worked' },
    {
      title: 'Total Hours',
      dataIndex: 'total_work_hours',
      key: 'total_work_hours',
      sorter: (a, b) => a.total_work_hours - b.total_work_hours,
    },
    {
      title: 'Overtime',
      dataIndex: 'total_overtime_hours',
      key: 'total_overtime_hours',
      render: (v) => <Text type={v > 0 ? 'warning' : 'secondary'}>{v} hrs</Text>,
    },
  ];

  const attendanceColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Login', dataIndex: 'login_time', key: 'login_time', render: (v) => v ? dayjs.utc(v).tz('Asia/Kolkata').format('hh:mm A') : '-' },
    { title: 'Logout', dataIndex: 'logout_time', key: 'logout_time', render: (v) => v ? dayjs.utc(v).tz('Asia/Kolkata').format('hh:mm A') : '-' },
    { title: 'Work Hours', dataIndex: 'total_work_hours', key: 'total_work_hours' },
    { title: 'Break (min)', dataIndex: 'total_break_minutes', key: 'total_break_minutes' },
    { title: 'Overtime', dataIndex: 'overtime_hours', key: 'overtime_hours' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  const overtimeColumns = [
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    {
      title: 'Total Overtime',
      dataIndex: 'total_overtime_hours',
      key: 'total_overtime_hours',
      sorter: (a, b) => a.total_overtime_hours - b.total_overtime_hours,
      defaultSortOrder: 'descend',
    },
    { title: 'Days with Overtime', dataIndex: 'overtime_days', key: 'overtime_days' },
    { title: 'Avg per Day', dataIndex: 'average_overtime_per_day', key: 'average_overtime_per_day' },
  ];

  const teamColumns = [
    { title: 'Team', dataIndex: 'team_name', key: 'team_name' },
    { title: 'Team Lead', dataIndex: 'team_lead', key: 'team_lead' },
    { title: 'Members', dataIndex: 'member_count', key: 'member_count' },
    { title: 'Tasks Completed', dataIndex: 'tasks_completed', key: 'tasks_completed' },
    {
      title: 'Completion Rate',
      dataIndex: 'task_completion_rate',
      key: 'task_completion_rate',
      render: (v) => `${v}%`,
    },
    { title: 'Worksheets', dataIndex: 'worksheets_submitted', key: 'worksheets_submitted' },
    {
      title: 'Approval Rate',
      dataIndex: 'worksheet_approval_rate',
      key: 'worksheet_approval_rate',
      render: (v) => `${v}%`,
    },
    { title: 'Total Hours', dataIndex: 'total_work_hours', key: 'total_work_hours' },
  ];

  // Chart data
  const worksheetChartData = worksheetAnalytics?.status_distribution
    ? Object.entries(worksheetAnalytics.status_distribution).map(([status, count]) => ({
        status: (status || '').replace('_', ' ').toUpperCase(),
        count,
      }))
    : [];

  const productivityChartData = productivityData.slice(0, 10).map(item => ({
    name: item.employee_name,
    value: item.completion_rate,
  }));

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>Reports & Analytics</Title>
        </Col>
        <Col>
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates)}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchAllReports}>
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Summary Cards */}
      {worksheetAnalytics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Worksheets"
                value={worksheetAnalytics.summary?.total_worksheets || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Approved"
                value={worksheetAnalytics.summary?.approved || 0}
                styles={{ value: { color: '#3f8600'  } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Pending"
                value={(worksheetAnalytics.summary?.pending_verification || 0) + (worksheetAnalytics.summary?.pending_approval || 0)}
                styles={{ value: { color: '#faad14'  } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Rejection Rate"
                value={worksheetAnalytics.summary?.rejection_rate || 0}
                suffix="%"
                styles={{ value: { color: worksheetAnalytics.summary?.rejection_rate > 10 ? '#cf1322' : '#3f8600'  } }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Spin spinning={loading}>
        <Tabs
          defaultActiveKey="productivity"
          items={[
            {
              key: 'productivity',
              label: 'Productivity',
              children: (
                <Card
                  title="Associate Productivity Report"
                  extra={
                    <Button icon={<DownloadOutlined />} onClick={() => handleExport('productivity')}>
                      Export CSV
                    </Button>
                  }
                >
                  {productivityChartData.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <Column
                        data={productivityChartData}
                        xField="name"
                        yField="value"
                        label={{
                          position: 'top',
                          formatter: ({ value }) => `${value}%`,
                        }}
                        height={250}
                        meta={{
                          value: { alias: 'Completion Rate (%)' },
                        }}
                      />
                    </div>
                  )}
                  <Table
                    dataSource={productivityData}
                    columns={productivityColumns}
                    rowKey="employee_id"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: true }}
                  />
                </Card>
              ),
            },
            {
              key: 'projects',
              label: 'Projects',
              children: (
                <div>
                  {/* Project Overview Cards */}
                  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {projectsData.map(project => (
                      <Col xs={24} sm={12} lg={8} key={project.id}>
                        <Card
                          title={
                            <Space>
                              <TeamOutlined />
                              <span>{project.name}</span>
                            </Space>
                          }
                          extra={
                            <Badge
                              count={`${project.logged_in_today}/${project.total_members}`}
                              style={{ backgroundColor: project.logged_in_today > 0 ? '#52c41a' : '#d9d9d9' }}
                            />
                          }
                          size="small"
                        >
                          <Row gutter={[8, 8]}>
                            <Col span={12}>
                              <Statistic
                                title="Team Lead"
                                value={project.team_lead}
                                valueStyle={{ fontSize: 14 }}
                              />
                            </Col>
                            <Col span={12}>
                              <Statistic
                                title="Logged In Today"
                                value={project.logged_in_today}
                                suffix={`/ ${project.total_members}`}
                                valueStyle={{ fontSize: 14, color: project.logged_in_today > 0 ? '#52c41a' : '#999' }}
                                prefix={<UserOutlined />}
                              />
                            </Col>
                            <Col span={12}>
                              <Statistic
                                title="Worksheets"
                                value={project.worksheets_submitted}
                                valueStyle={{ fontSize: 14 }}
                                prefix={<FileTextOutlined />}
                              />
                            </Col>
                            {/* Annotation Project - Show Image Count */}
                            {project.type === 'annotation' && (
                              <Col span={12}>
                                <Statistic
                                  title="Total Images"
                                  value={project.total_image_count || 0}
                                  valueStyle={{ fontSize: 14, color: '#1890ff' }}
                                  prefix={<PictureOutlined />}
                                />
                              </Col>
                            )}
                            {/* Finance/Pleo Project - Show Validation Count */}
                            {project.type === 'finance_pleo' && (
                              <Col span={12}>
                                <Statistic
                                  title="Pleo Validations"
                                  value={project.total_pleo_validation || 0}
                                  valueStyle={{ fontSize: 14, color: '#722ed1' }}
                                  prefix={<CheckCircleOutlined />}
                                />
                              </Col>
                            )}
                          </Row>

                          {/* Project Managers - Member Dropdown */}
                          {project.type === 'project_managers' && project.members && project.members.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Member:</Text>
                              <Select
                                placeholder="Select a member to view details"
                                style={{ width: '100%', marginBottom: 12 }}
                                value={selectedProjectMember[project.id]}
                                onChange={(value) => setSelectedProjectMember(prev => ({ ...prev, [project.id]: value }))}
                                allowClear
                                showSearch
                                optionFilterProp="children"
                              >
                                {project.members.map(m => (
                                  <Option key={m.id} value={m.id}>
                                    <Space>
                                      <Tag color={m.is_logged_in ? 'green' : 'default'} style={{ marginRight: 0 }}>
                                        {m.is_logged_in ? 'Online' : 'Offline'}
                                      </Tag>
                                      {m.name}
                                    </Space>
                                  </Option>
                                ))}
                              </Select>

                              {/* Selected Member's Worksheet Data */}
                              {selectedProjectMember[project.id] && (() => {
                                const member = project.members.find(m => m.id === selectedProjectMember[project.id]);
                                if (!member) return null;
                                const memberWorksheets = member.worksheets || [];
                                return (
                                  <Card size="small" style={{ marginTop: 8 }}>
                                    <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
                                      <Col span={8}>
                                        <Statistic title="Total Hours" value={member.total_hours || 0} valueStyle={{ fontSize: 14 }} />
                                      </Col>
                                      <Col span={8}>
                                        <Statistic title="Worksheets" value={member.worksheets_count || 0} valueStyle={{ fontSize: 14 }} />
                                      </Col>
                                      <Col span={8}>
                                        <Statistic title="Tasks" value={member.tasks_count || 0} valueStyle={{ fontSize: 14 }} />
                                      </Col>
                                    </Row>
                                    {memberWorksheets.length > 0 && (
                                      <Table
                                        dataSource={memberWorksheets}
                                        columns={[
                                          { title: 'Date', dataIndex: 'date', key: 'date', width: 100 },
                                          { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                                          {
                                            title: 'Status',
                                            dataIndex: 'status',
                                            key: 'status',
                                            width: 100,
                                            render: (s) => {
                                              const colors = { draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' };
                                              return <Tag color={colors[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag>;
                                            }
                                          },
                                          { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours', width: 60 },
                                        ]}
                                        rowKey="id"
                                        size="small"
                                        pagination={false}
                                      />
                                    )}
                                  </Card>
                                );
                              })()}
                            </div>
                          )}

                          {/* Member List Expandable */}
                          <Collapse ghost size="small" style={{ marginTop: 12 }}>
                            <Panel header={`View Members (${project.total_members})`} key="1">
                              <Table
                                dataSource={project.members}
                                columns={[
                                  {
                                    title: 'Name',
                                    dataIndex: 'name',
                                    key: 'name',
                                    render: (name, record) => (
                                      <Space>
                                        <Tag color={record.is_logged_in ? 'green' : 'default'}>
                                          {record.is_logged_in ? 'Online' : 'Offline'}
                                        </Tag>
                                        {name}
                                      </Space>
                                    )
                                  },
                                  { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                                  ...(project.type === 'annotation' ? [
                                    { title: 'Images', dataIndex: 'image_count', key: 'image_count' }
                                  ] : []),
                                  ...(project.type === 'finance_pleo' ? [
                                    { title: 'Pleo', dataIndex: 'pleo_validation_count', key: 'pleo_validation_count' }
                                  ] : []),
                                ]}
                                rowKey="id"
                                size="small"
                                pagination={false}
                              />
                            </Panel>
                          </Collapse>
                        </Card>
                      </Col>
                    ))}
                  </Row>

                  {/* Project Managers Section */}
                  <Card title="Project Managers - Member Details" style={{ marginTop: 16 }}>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      {managerMembers.managers && managerMembers.managers.length > 0 && (
                        <Col xs={24} sm={12} md={8}>
                          <Text strong>Select Manager: </Text>
                          <Select
                            placeholder="Select a manager"
                            style={{ width: '100%', marginTop: 8 }}
                            value={selectedManager}
                            onChange={handleManagerChange}
                            allowClear
                          >
                            {managerMembers.managers.map(m => (
                              <Option key={m.id} value={m.id}>{m.name}</Option>
                            ))}
                          </Select>
                        </Col>
                      )}
                      <Col xs={24} sm={12} md={8}>
                        <Text strong>Select Member: </Text>
                        <Select
                          placeholder="Select a member to view details"
                          style={{ width: '100%', marginTop: 8 }}
                          value={selectedMember}
                          onChange={setSelectedMember}
                          allowClear
                        >
                          {managerMembers.data.map(m => (
                            <Option key={m.id} value={m.id}>
                              <Space>
                                <Tag color={m.is_logged_in ? 'green' : 'default'} style={{ marginRight: 0 }}>
                                  {m.is_logged_in ? 'Online' : 'Offline'}
                                </Tag>
                                {m.name}
                              </Space>
                            </Option>
                          ))}
                        </Select>
                      </Col>
                    </Row>

                    {/* Member Summary Table */}
                    <Table
                      dataSource={managerMembers.data}
                      columns={[
                        {
                          title: 'Associate',
                          dataIndex: 'name',
                          key: 'name',
                          render: (name, record) => (
                            <Space>
                              <Tag color={record.is_logged_in ? 'green' : 'default'}>
                                {record.is_logged_in ? 'Online' : 'Offline'}
                              </Tag>
                              {name}
                            </Space>
                          )
                        },
                        { title: 'Employee ID', dataIndex: 'employee_id', key: 'employee_id' },
                        { title: 'Role', dataIndex: 'role', key: 'role', render: (r) => (r || '').replace('_', ' ').toUpperCase() },
                        { title: 'Worksheets', dataIndex: 'total_worksheets', key: 'total_worksheets' },
                        { title: 'Total Hours', dataIndex: 'total_hours', key: 'total_hours' },
                        { title: 'Image Count', dataIndex: 'total_image_count', key: 'total_image_count' },
                        { title: 'Pleo Validations', dataIndex: 'total_pleo_validation', key: 'total_pleo_validation' },
                      ]}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      expandable={{
                        expandedRowRender: (record) => (
                          <Table
                            dataSource={record.worksheets}
                            columns={[
                              { title: 'Date', dataIndex: 'date', key: 'date' },
                              { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                              {
                                title: 'Status',
                                dataIndex: 'status',
                                key: 'status',
                                render: (s) => {
                                  const colors = { draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' };
                                  return <Tag color={colors[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag>;
                                }
                              },
                              { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                              { title: 'Images', dataIndex: 'image_count', key: 'image_count' },
                              { title: 'Pleo', dataIndex: 'pleo_validation_count', key: 'pleo_validation_count' },
                            ]}
                            rowKey="id"
                            size="small"
                            pagination={false}
                          />
                        ),
                      }}
                    />

                    {/* Selected Member Detail View */}
                    {selectedMember && (() => {
                      const member = managerMembers.data.find(m => m.id === selectedMember);
                      if (!member) return null;
                      return (
                        <Card
                          title={`${member.name} - Worksheet Details`}
                          size="small"
                          style={{ marginTop: 16 }}
                        >
                          <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col span={6}>
                              <Statistic title="Total Hours" value={member.total_hours} suffix="hrs" />
                            </Col>
                            <Col span={6}>
                              <Statistic title="Worksheets" value={member.total_worksheets} />
                            </Col>
                            <Col span={6}>
                              <Statistic title="Total Images" value={member.total_image_count} />
                            </Col>
                            <Col span={6}>
                              <Statistic title="Pleo Validations" value={member.total_pleo_validation} />
                            </Col>
                          </Row>
                          <Table
                            dataSource={member.worksheets}
                            columns={[
                              { title: 'Date', dataIndex: 'date', key: 'date' },
                              { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                              {
                                title: 'Status',
                                dataIndex: 'status',
                                key: 'status',
                                render: (s) => {
                                  const colors = { draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' };
                                  return <Tag color={colors[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag>;
                                }
                              },
                              { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                              { title: 'Images', dataIndex: 'image_count', key: 'image_count' },
                              { title: 'Pleo', dataIndex: 'pleo_validation_count', key: 'pleo_validation_count' },
                              { title: 'Notes', dataIndex: 'notes', key: 'notes' },
                            ]}
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 5 }}
                          />
                        </Card>
                      );
                    })()}
                  </Card>
                </div>
              ),
            },
            {
              key: 'attendance',
              label: 'Attendance',
              children: (
                <Card
                  title="Attendance Report"
                  extra={
                    <Button icon={<DownloadOutlined />} onClick={() => handleExport('attendance')}>
                      Export CSV
                    </Button>
                  }
                >
                  <Table
                    dataSource={attendanceData}
                    columns={attendanceColumns}
                    rowKey={(r) => `${r.employee_id}_${r.date}`}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: true }}
                  />
                </Card>
              ),
            },
            {
              key: 'overtime',
              label: 'Overtime',
              children: (
                <Card
                  title="Overtime Report"
                  extra={
                    <Button icon={<DownloadOutlined />} onClick={() => handleExport('overtime')}>
                      Export CSV
                    </Button>
                  }
                >
                  <Table
                    dataSource={overtimeData}
                    columns={overtimeColumns}
                    rowKey="employee_id"
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              ),
            },
            {
              key: 'worksheets',
              label: 'Worksheet Analytics',
              children: (
                <Card title="Worksheet Analytics">
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      {worksheetChartData.length > 0 && (
                        <Pie
                          data={worksheetChartData}
                          angleField="count"
                          colorField="status"
                          radius={0.8}
                          label={{
                            type: 'outer',
                            formatter: ({ status, count }) => `${status}: ${count}`,
                          }}
                          height={300}
                        />
                      )}
                    </Col>
                    <Col xs={24} md={12}>
                      <Title level={5}>Daily Submission Trend</Title>
                      {worksheetAnalytics?.daily_trend?.length > 0 && (
                        <Column
                          data={worksheetAnalytics.daily_trend}
                          xField="date"
                          yField="submitted"
                          height={250}
                        />
                      )}
                    </Col>
                  </Row>
                </Card>
              ),
            },
            {
              key: 'team',
              label: 'Team Performance',
              children: (
                <Card title="Team Performance Report">
                  <Table
                    dataSource={teamPerformance}
                    columns={teamColumns}
                    rowKey="team_id"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: true }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default Reports;

