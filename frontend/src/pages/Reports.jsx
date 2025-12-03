import { useState, useEffect } from 'react';
import {
  Card, Tabs, DatePicker, Button, Table, Space, Typography, Row, Col,
  Statistic, message, Spin
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import { reportService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

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
  const { isAdmin, isManager } = useAuth();

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
      const [productivity, attendance, overtime, worksheet, team] = await Promise.all([
        reportService.getProductivityReport(params),
        reportService.getAttendanceReport(params),
        reportService.getOvertimeReport(params),
        reportService.getWorksheetAnalytics(params),
        reportService.getTeamPerformance(params),
      ]);

      setProductivityData(productivity.data.data || []);
      setAttendanceData(attendance.data.data || []);
      setOvertimeData(overtime.data.data || []);
      setWorksheetAnalytics(worksheet.data);
      setTeamPerformance(team.data.data || []);
    } catch (error) {
      message.error('Failed to fetch reports');
    } finally {
      setLoading(false);
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
    { title: 'Login', dataIndex: 'login_time', key: 'login_time', render: (v) => v ? dayjs(v).format('HH:mm') : '-' },
    { title: 'Logout', dataIndex: 'logout_time', key: 'logout_time', render: (v) => v ? dayjs(v).format('HH:mm') : '-' },
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
        status: status.replace('_', ' ').toUpperCase(),
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
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Pending"
                value={(worksheetAnalytics.summary?.pending_verification || 0) + (worksheetAnalytics.summary?.pending_approval || 0)}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Rejection Rate"
                value={worksheetAnalytics.summary?.rejection_rate || 0}
                suffix="%"
                valueStyle={{ color: worksheetAnalytics.summary?.rejection_rate > 10 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Spin spinning={loading}>
        <Tabs defaultActiveKey="productivity">
          <TabPane tab="Productivity" key="productivity">
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
          </TabPane>

          <TabPane tab="Attendance" key="attendance">
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
          </TabPane>

          <TabPane tab="Overtime" key="overtime">
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
          </TabPane>

          <TabPane tab="Worksheet Analytics" key="worksheets">
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
          </TabPane>

          <TabPane tab="Team Performance" key="team">
            <Card title="Team Performance Report">
              <Table
                dataSource={teamPerformance}
                columns={teamColumns}
                rowKey="team_id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
              />
            </Card>
          </TabPane>
        </Tabs>
      </Spin>
    </div>
  );
};

export default Reports;
