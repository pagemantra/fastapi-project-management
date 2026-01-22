import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Tabs, DatePicker, Button, Table, Space, Typography, Row, Col,
  Statistic, message, Select, Tag, Collapse, Badge, Skeleton
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

// Cache for report data
const dataCache = {
  productivity: null,
  projects: null,
  managerMembers: null,
  attendance: null,
  overtime: null,
  worksheets: null,
  team: null,
  lastParams: null
};

const Reports = () => {
  const [activeTab, setActiveTab] = useState('productivity');
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(30, 'day'),
    dayjs()
  ]);
  // Separate date range for Projects tab - defaults to today
  const [projectsDateRange, setProjectsDateRange] = useState([dayjs(), dayjs()]);
  const [productivityData, setProductivityData] = useState(dataCache.productivity || []);
  const [attendanceData, setAttendanceData] = useState(dataCache.attendance || []);
  const [overtimeData, setOvertimeData] = useState(dataCache.overtime || []);
  const [worksheetAnalytics, setWorksheetAnalytics] = useState(dataCache.worksheets);
  const [teamPerformance, setTeamPerformance] = useState(dataCache.team || []);
  const [projectsData, setProjectsData] = useState(dataCache.projects || []);
  const [managerMembers, setManagerMembers] = useState(dataCache.managerMembers || { managers: [], data: [] });
  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedProjectMember, setSelectedProjectMember] = useState({});
  const [initialLoading, setInitialLoading] = useState(!dataCache.productivity);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const fetchingRef = useRef({});
  useAuth();

  const getParams = useCallback(() => ({
    start_date: dateRange[0].format('YYYY-MM-DD'),
    end_date: dateRange[1].format('YYYY-MM-DD'),
  }), [dateRange]);

  // Get params for projects tab (uses separate date range, defaults to today)
  const getProjectsParams = useCallback(() => ({
    start_date: projectsDateRange[0].format('YYYY-MM-DD'),
    end_date: projectsDateRange[1].format('YYYY-MM-DD'),
  }), [projectsDateRange]);

  // Check if params changed
  const paramsChanged = useCallback(() => {
    const currentParams = JSON.stringify(getParams());
    return dataCache.lastParams !== currentParams;
  }, [getParams]);

  // Fetch projects data with specific date range
  const fetchProjectsData = useCallback(async (params) => {
    if (fetchingRef.current.projectsSpecific) return;
    fetchingRef.current.projectsSpecific = true;
    setProjectsLoading(true);

    try {
      const [projects, mm] = await Promise.all([
        reportService.getProjectsReport(params),
        reportService.getManagerMembers(params),
      ]);
      const pData = projects.data.data || [];
      const mmData = { managers: mm.data.managers || [], data: mm.data.data || [] };
      setProjectsData(pData);
      setManagerMembers(mmData);
    } catch (error) {
      console.error('Failed to fetch projects data:', error);
    } finally {
      setProjectsLoading(false);
      fetchingRef.current.projectsSpecific = false;
    }
  }, []);

  // Fetch all data in background without blocking UI
  const fetchAllDataBackground = useCallback(async () => {
    const params = getParams();
    const paramsKey = JSON.stringify(params);

    if (dataCache.lastParams === paramsKey && dataCache.productivity) {
      return; // Already have fresh data
    }

    try {
      // Fetch productivity first (current tab) - fastest response
      if (!fetchingRef.current.productivity) {
        fetchingRef.current.productivity = true;
        reportService.getProductivityReport(params).then(res => {
          const data = res.data.data || [];
          dataCache.productivity = data;
          setProductivityData(data);
          setInitialLoading(false);
          fetchingRef.current.productivity = false;
        }).catch(() => { fetchingRef.current.productivity = false; });
      }

      // Fetch other data in parallel without blocking
      setTimeout(() => {
        // Projects data uses its own date range (defaults to today)
        // It will be fetched separately via useEffect on projectsDateRange

        if (!fetchingRef.current.attendance) {
          fetchingRef.current.attendance = true;
          reportService.getAttendanceReport(params).then(res => {
            const data = res.data.data || [];
            dataCache.attendance = data;
            setAttendanceData(data);
            fetchingRef.current.attendance = false;
          }).catch(() => { fetchingRef.current.attendance = false; });
        }

        if (!fetchingRef.current.overtime) {
          fetchingRef.current.overtime = true;
          reportService.getOvertimeReport(params).then(res => {
            const data = res.data.data || [];
            dataCache.overtime = data;
            setOvertimeData(data);
            fetchingRef.current.overtime = false;
          }).catch(() => { fetchingRef.current.overtime = false; });
        }

        if (!fetchingRef.current.worksheets) {
          fetchingRef.current.worksheets = true;
          reportService.getWorksheetAnalytics(params).then(res => {
            dataCache.worksheets = res.data;
            setWorksheetAnalytics(res.data);
            fetchingRef.current.worksheets = false;
          }).catch(() => { fetchingRef.current.worksheets = false; });
        }

        if (!fetchingRef.current.team) {
          fetchingRef.current.team = true;
          reportService.getTeamPerformance(params).then(res => {
            const data = res.data.data || [];
            dataCache.team = data;
            setTeamPerformance(data);
            fetchingRef.current.team = false;
          }).catch(() => { fetchingRef.current.team = false; });
        }
      }, 50);

      dataCache.lastParams = paramsKey;
    } catch {
      message.error('Failed to fetch reports');
      setInitialLoading(false);
    }
  }, [getParams]);

  // Load data on mount
  useEffect(() => {
    fetchAllDataBackground();
  }, []);

  // Reload when date range changes
  useEffect(() => {
    if (paramsChanged()) {
      dataCache.lastParams = null;
      fetchAllDataBackground();
    }
  }, [dateRange, paramsChanged, fetchAllDataBackground]);

  // Fetch projects data when projectsDateRange changes (defaults to today)
  useEffect(() => {
    fetchProjectsData(getProjectsParams());
  }, [projectsDateRange, fetchProjectsData, getProjectsParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleRefresh = () => {
    dataCache.lastParams = null;
    fetchingRef.current = {};
    fetchAllDataBackground();
    // Also refresh projects with current projects date range
    fetchProjectsData(getProjectsParams());
  };

  // Handle projects date filter change
  const handleProjectsDateChange = (dates) => {
    if (dates && dates.length === 2) {
      setProjectsDateRange(dates);
    }
  };

  // Reset projects to today's data
  const handleProjectsToday = () => {
    setProjectsDateRange([dayjs(), dayjs()]);
  };

  const handleManagerChange = async (managerId) => {
    setSelectedManager(managerId);
    setSelectedMember(null);
    const params = { ...getProjectsParams(), manager_id: managerId };
    try {
      const response = await reportService.getManagerMembers(params);
      setManagerMembers(prev => ({ ...prev, data: response.data.data || [] }));
    } catch {
      message.error('Failed to fetch member data');
    }
  };

  const handleExport = async (type) => {
    try {
      const params = { ...getParams(), format: 'csv' };
      let response, filename;

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

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Report exported successfully');
    } catch {
      message.error('Failed to export report');
    }
  };

  const productivityColumns = [
    { title: 'Associate', dataIndex: 'employee_name', key: 'employee_name' },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: 'Tasks Completed', dataIndex: 'tasks_completed', key: 'tasks_completed' },
    { title: 'Total Tasks', dataIndex: 'total_tasks', key: 'total_tasks' },
    { title: 'Completion Rate', dataIndex: 'completion_rate', key: 'completion_rate', render: (v) => `${v}%`, sorter: (a, b) => a.completion_rate - b.completion_rate },
    { title: 'Days Worked', dataIndex: 'days_worked', key: 'days_worked' },
    { title: 'Total Hours', dataIndex: 'total_work_hours', key: 'total_work_hours', sorter: (a, b) => a.total_work_hours - b.total_work_hours },
    { title: 'Overtime', dataIndex: 'total_overtime_hours', key: 'total_overtime_hours', render: (v) => <Text type={v > 0 ? 'warning' : 'secondary'}>{v} hrs</Text> },
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
    { title: 'Total Overtime', dataIndex: 'total_overtime_hours', key: 'total_overtime_hours', sorter: (a, b) => a.total_overtime_hours - b.total_overtime_hours, defaultSortOrder: 'descend' },
    { title: 'Days with Overtime', dataIndex: 'overtime_days', key: 'overtime_days' },
    { title: 'Avg per Day', dataIndex: 'average_overtime_per_day', key: 'average_overtime_per_day' },
  ];

  const teamColumns = [
    { title: 'Team', dataIndex: 'team_name', key: 'team_name' },
    { title: 'Team Lead', dataIndex: 'team_lead', key: 'team_lead' },
    { title: 'Members', dataIndex: 'member_count', key: 'member_count' },
    { title: 'Tasks Completed', dataIndex: 'tasks_completed', key: 'tasks_completed' },
    { title: 'Completion Rate', dataIndex: 'task_completion_rate', key: 'task_completion_rate', render: (v) => `${v}%` },
    { title: 'Worksheets', dataIndex: 'worksheets_submitted', key: 'worksheets_submitted' },
    { title: 'Approval Rate', dataIndex: 'worksheet_approval_rate', key: 'worksheet_approval_rate', render: (v) => `${v}%` },
    { title: 'Total Hours', dataIndex: 'total_work_hours', key: 'total_work_hours' },
  ];

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

  // Show skeleton only on very first load
  if (initialLoading) {
    return (
      <div>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col><Title level={3}>Reports & Analytics</Title></Col>
          <Col><Space><Skeleton.Input active size="default" style={{ width: 250 }} /><Skeleton.Button active /></Space></Col>
        </Row>
        <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </div>
    );
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={3}>Reports & Analytics</Title></Col>
        <Col>
          <Space>
            <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      {worksheetAnalytics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="Total Worksheets" value={worksheetAnalytics.summary?.total_worksheets || 0} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="Approved" value={worksheetAnalytics.summary?.approved || 0} valueStyle={{ color: '#3f8600' }} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="Pending" value={(worksheetAnalytics.summary?.pending_verification || 0) + (worksheetAnalytics.summary?.pending_approval || 0)} valueStyle={{ color: '#faad14' }} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="Rejection Rate" value={worksheetAnalytics.summary?.rejection_rate || 0} suffix="%" valueStyle={{ color: worksheetAnalytics.summary?.rejection_rate > 10 ? '#cf1322' : '#3f8600' }} /></Card>
          </Col>
        </Row>
      )}

      <Tabs activeKey={activeTab} onChange={handleTabChange} items={[
        {
          key: 'productivity',
          label: 'Productivity',
          children: (
            <Card title="Associate Productivity Report" extra={<Button icon={<DownloadOutlined />} onClick={() => handleExport('productivity')}>Export CSV</Button>}>
              {productivityChartData.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <Column data={productivityChartData} xField="name" yField="value" label={{ position: 'top', formatter: ({ value }) => `${value}%` }} height={250} meta={{ value: { alias: 'Completion Rate (%)' } }} />
                </div>
              )}
              <Table dataSource={productivityData} columns={productivityColumns} rowKey="employee_id" pagination={{ pageSize: 10 }} scroll={{ x: true }} />
            </Card>
          ),
        },
        {
          key: 'projects',
          label: 'Projects',
          children: (
            <div>
              {/* Projects Date Filter */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row align="middle" gutter={16}>
                  <Col>
                    <Text strong>Date Filter:</Text>
                  </Col>
                  <Col>
                    <Button
                      type={projectsDateRange[0].isSame(dayjs(), 'day') && projectsDateRange[1].isSame(dayjs(), 'day') ? 'primary' : 'default'}
                      onClick={handleProjectsToday}
                      size="small"
                    >
                      Today
                    </Button>
                  </Col>
                  <Col>
                    <RangePicker
                      value={projectsDateRange}
                      onChange={handleProjectsDateChange}
                      size="small"
                      allowClear={false}
                    />
                  </Col>
                  <Col>
                    {projectsLoading && <Text type="secondary">Loading...</Text>}
                  </Col>
                  <Col flex="auto" style={{ textAlign: 'right' }}>
                    <Text type="secondary">
                      Showing data from {projectsDateRange[0].format('MMM D, YYYY')} to {projectsDateRange[1].format('MMM D, YYYY')}
                    </Text>
                  </Col>
                </Row>
              </Card>

              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {projectsData.map(project => (
                  <Col xs={24} sm={12} lg={8} key={project.id}>
                    <Card
                      title={<Space><TeamOutlined /><span>{project.name}</span></Space>}
                      extra={<Badge count={`${project.logged_in_today}/${project.total_members}`} style={{ backgroundColor: project.logged_in_today > 0 ? '#52c41a' : '#d9d9d9' }} />}
                      size="small"
                    >
                      <Row gutter={[8, 8]}>
                        <Col span={12}><Statistic title="Team Lead" value={project.team_lead} valueStyle={{ fontSize: 14 }} /></Col>
                        <Col span={12}><Statistic title="Logged In Today" value={project.logged_in_today} suffix={`/ ${project.total_members}`} valueStyle={{ fontSize: 14, color: project.logged_in_today > 0 ? '#52c41a' : '#999' }} prefix={<UserOutlined />} /></Col>
                        <Col span={12}><Statistic title="Worksheets" value={project.worksheets_submitted} valueStyle={{ fontSize: 14 }} prefix={<FileTextOutlined />} /></Col>
                        {project.type === 'annotation' && <Col span={12}><Statistic title="Total Images" value={project.total_image_count || 0} valueStyle={{ fontSize: 14, color: '#1890ff' }} prefix={<PictureOutlined />} /></Col>}
                        {project.type === 'finance_pleo' && <Col span={12}><Statistic title="Pleo Validations" value={project.total_pleo_validation || 0} valueStyle={{ fontSize: 14, color: '#722ed1' }} prefix={<CheckCircleOutlined />} /></Col>}
                      </Row>

                      {project.type === 'project_managers' && project.members?.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Member:</Text>
                          <Select placeholder="Select a member" style={{ width: '100%', marginBottom: 12 }} value={selectedProjectMember[project.id]} onChange={(value) => setSelectedProjectMember(prev => ({ ...prev, [project.id]: value }))} allowClear showSearch optionFilterProp="children">
                            {project.members.map(m => (
                              <Option key={m.id} value={m.id}><Space><Tag color={m.is_logged_in ? 'green' : 'default'} style={{ marginRight: 0 }}>{m.is_logged_in ? 'Online' : 'Offline'}</Tag>{m.name}</Space></Option>
                            ))}
                          </Select>
                          {selectedProjectMember[project.id] && (() => {
                            const member = project.members.find(m => m.id === selectedProjectMember[project.id]);
                            if (!member) return null;
                            return (
                              <Card size="small" style={{ marginTop: 8 }}>
                                <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
                                  <Col span={8}><Statistic title="Total Hours" value={member.total_hours || 0} valueStyle={{ fontSize: 14 }} /></Col>
                                  <Col span={8}><Statistic title="Worksheets" value={member.worksheets_count || 0} valueStyle={{ fontSize: 14 }} /></Col>
                                  <Col span={8}><Statistic title="Tasks" value={member.tasks_count || 0} valueStyle={{ fontSize: 14 }} /></Col>
                                </Row>
                                {member.worksheets?.length > 0 && (
                                  <Table dataSource={member.worksheets} columns={[
                                    { title: 'Date', dataIndex: 'date', key: 'date', width: 100 },
                                    { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                                    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s) => <Tag color={{ draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' }[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag> },
                                    { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours', width: 60 },
                                  ]} rowKey="id" size="small" pagination={false} />
                                )}
                              </Card>
                            );
                          })()}
                        </div>
                      )}

                      <Collapse ghost size="small" style={{ marginTop: 12 }}>
                        <Panel header={`View Members (${project.total_members})`} key="1">
                          <Table dataSource={project.members} columns={[
                            { title: 'Name', dataIndex: 'name', key: 'name', render: (name, record) => <Space><Tag color={record.is_logged_in ? 'green' : 'default'}>{record.is_logged_in ? 'Online' : 'Offline'}</Tag>{name}</Space> },
                            { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                            ...(project.type === 'annotation' ? [{ title: 'Images', dataIndex: 'image_count', key: 'image_count' }] : []),
                            ...(project.type === 'finance_pleo' ? [{ title: 'Pleo', dataIndex: 'pleo_validation_count', key: 'pleo_validation_count' }] : []),
                          ]} rowKey="id" size="small" pagination={false} />
                        </Panel>
                      </Collapse>
                    </Card>
                  </Col>
                ))}
              </Row>

              <Card title="Project Managers - Member Details" style={{ marginTop: 16 }}>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {managerMembers.managers?.length > 0 && (
                    <Col xs={24} sm={12} md={8}>
                      <Text strong>Select Manager: </Text>
                      <Select placeholder="Select a manager" style={{ width: '100%', marginTop: 8 }} value={selectedManager} onChange={handleManagerChange} allowClear>
                        {managerMembers.managers.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
                      </Select>
                    </Col>
                  )}
                  <Col xs={24} sm={12} md={8}>
                    <Text strong>Select Member: </Text>
                    <Select placeholder="Select a member" style={{ width: '100%', marginTop: 8 }} value={selectedMember} onChange={setSelectedMember} allowClear>
                      {managerMembers.data.map(m => <Option key={m.id} value={m.id}><Space><Tag color={m.is_logged_in ? 'green' : 'default'} style={{ marginRight: 0 }}>{m.is_logged_in ? 'Online' : 'Offline'}</Tag>{m.name}</Space></Option>)}
                    </Select>
                  </Col>
                </Row>
                <Table dataSource={managerMembers.data} columns={[
                  { title: 'Associate', dataIndex: 'name', key: 'name', render: (name, record) => <Space><Tag color={record.is_logged_in ? 'green' : 'default'}>{record.is_logged_in ? 'Online' : 'Offline'}</Tag>{name}</Space> },
                  { title: 'Employee ID', dataIndex: 'employee_id', key: 'employee_id' },
                  { title: 'Role', dataIndex: 'role', key: 'role', render: (r) => (r || '').replace('_', ' ').toUpperCase() },
                  { title: 'Worksheets', dataIndex: 'total_worksheets', key: 'total_worksheets' },
                  { title: 'Total Hours', dataIndex: 'total_hours', key: 'total_hours' },
                  { title: 'Image Count', dataIndex: 'total_image_count', key: 'total_image_count' },
                  { title: 'Pleo Validations', dataIndex: 'total_pleo_validation', key: 'total_pleo_validation' },
                ]} rowKey="id" pagination={{ pageSize: 10 }} expandable={{
                  expandedRowRender: (record) => (
                    <Table dataSource={record.worksheets} columns={[
                      { title: 'Date', dataIndex: 'date', key: 'date' },
                      { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={{ draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' }[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag> },
                      { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                    ]} rowKey="id" size="small" pagination={false} />
                  ),
                }} />
                {selectedMember && (() => {
                  const member = managerMembers.data.find(m => m.id === selectedMember);
                  if (!member) return null;
                  return (
                    <Card title={`${member.name} - Worksheet Details`} size="small" style={{ marginTop: 16 }}>
                      <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col span={6}><Statistic title="Total Hours" value={member.total_hours} suffix="hrs" /></Col>
                        <Col span={6}><Statistic title="Worksheets" value={member.total_worksheets} /></Col>
                        <Col span={6}><Statistic title="Total Images" value={member.total_image_count} /></Col>
                        <Col span={6}><Statistic title="Pleo Validations" value={member.total_pleo_validation} /></Col>
                      </Row>
                      <Table dataSource={member.worksheets} columns={[
                        { title: 'Date', dataIndex: 'date', key: 'date' },
                        { title: 'Form', dataIndex: 'form_name', key: 'form_name' },
                        { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={{ draft: 'default', submitted: 'blue', tl_verified: 'cyan', manager_approved: 'green', rejected: 'red' }[s]}>{(s || '').replace('_', ' ').toUpperCase()}</Tag> },
                        { title: 'Hours', dataIndex: 'total_hours', key: 'total_hours' },
                      ]} rowKey="id" size="small" pagination={{ pageSize: 5 }} />
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
            <Card title="Attendance Report" extra={<Button icon={<DownloadOutlined />} onClick={() => handleExport('attendance')}>Export CSV</Button>}>
              <Table dataSource={attendanceData} columns={attendanceColumns} rowKey={(r) => `${r.employee_id}_${r.date}`} pagination={{ pageSize: 15 }} scroll={{ x: true }} />
            </Card>
          ),
        },
        {
          key: 'overtime',
          label: 'Overtime',
          children: (
            <Card title="Overtime Report" extra={<Button icon={<DownloadOutlined />} onClick={() => handleExport('overtime')}>Export CSV</Button>}>
              <Table dataSource={overtimeData} columns={overtimeColumns} rowKey="employee_id" pagination={{ pageSize: 10 }} />
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
                  {worksheetChartData.length > 0 && <Pie data={worksheetChartData} angleField="count" colorField="status" radius={0.8} label={{ type: 'outer', formatter: ({ status, count }) => `${status}: ${count}` }} height={300} />}
                </Col>
                <Col xs={24} md={12}>
                  <Title level={5}>Daily Submission Trend</Title>
                  {worksheetAnalytics?.daily_trend?.length > 0 && <Column data={worksheetAnalytics.daily_trend} xField="date" yField="submitted" height={250} />}
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
              <Table dataSource={teamPerformance} columns={teamColumns} rowKey="team_id" pagination={{ pageSize: 10 }} scroll={{ x: true }} />
            </Card>
          ),
        },
      ]} />
    </div>
  );
};

export default Reports;
