import { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  UserOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  FormOutlined,
  BarChartOutlined,
  BellOutlined,
  LogoutOutlined,
  CheckSquareOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../api/services';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchNotificationCount();
    const interval = setInterval(fetchNotificationCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotificationCount = async () => {
    try {
      const response = await notificationService.getCount();
      setUnreadCount(response.data?.unread || 0);
    } catch (error) {
      // Silently fail
    }
  };

  const getMenuItems = () => {
    const role = user?.role;
    const items = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
      },
    ];

    // Admin menu items
    if (role === 'admin') {
      items.push(
        {
          key: '/users',
          icon: <UserOutlined />,
          label: 'Master Data',
        },
        {
          key: '/teams',
          icon: <TeamOutlined />,
          label: 'Teams',
        },
        {
          key: '/tasks',
          icon: <CheckSquareOutlined />,
          label: 'All Tasks',
        },
        {
          key: '/forms',
          icon: <FormOutlined />,
          label: 'Forms',
        },
        {
          key: '/worksheets',
          icon: <FileTextOutlined />,
          label: 'Worksheets',
        },
        {
          key: '/attendance',
          icon: <ClockCircleOutlined />,
          label: 'Attendance',
        },
        {
          key: '/reports',
          icon: <BarChartOutlined />,
          label: 'Reports',
        }
      );
    }

    // Manager menu items
    if (role === 'manager') {
      items.push(
        {
          key: '/users',
          icon: <UserOutlined />,
          label: 'Master Data',
        },
        {
          key: '/teams',
          icon: <TeamOutlined />,
          label: 'Teams',
        },
        {
          key: '/tasks',
          icon: <CheckSquareOutlined />,
          label: 'All Tasks',
        },
        {
          key: '/forms',
          icon: <FormOutlined />,
          label: 'Forms',
        },
        {
          key: '/worksheets',
          icon: <FileTextOutlined />,
          label: 'Worksheets',
        },
        {
          key: '/attendance',
          icon: <ClockCircleOutlined />,
          label: 'Attendance',
        },
        {
          key: '/reports',
          icon: <BarChartOutlined />,
          label: 'Reports',
        }
      );
    }

    // Team Lead menu items
    if (role === 'team_lead') {
      items.push(
        {
          key: '/my-team',
          icon: <TeamOutlined />,
          label: 'My Team',
        },
        {
          key: '/tasks',
          icon: <CheckSquareOutlined />,
          label: 'Tasks',
        },
        {
          key: '/worksheets',
          icon: <FileTextOutlined />,
          label: 'Worksheets',
        },
        {
          key: '/attendance',
          icon: <ClockCircleOutlined />,
          label: 'Attendance',
        }
      );
    }

    // Associate menu items
    if (role === 'employee') {
      items.push(
        {
          key: '/tasks',
          icon: <CheckSquareOutlined />,
          label: 'My Tasks',
        },
        {
          key: '/worksheets',
          icon: <FileTextOutlined />,
          label: 'My Worksheets',
        },
        {
          key: '/attendance',
          icon: <ClockCircleOutlined />,
          label: 'Attendance',
        }
      );
    }

    // Notifications for all roles
    items.push({
      key: '/notifications',
      icon: <BellOutlined />,
      label: 'Notifications',
    });

    return items;
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <ProfileOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: () => {
        logout();
        navigate('/login', { replace: true, state: null });
      },
    },
  ];

  const getRoleColor = (role) => {
    const colors = {
      admin: '#f50',
      manager: '#2db7f5',
      team_lead: '#87d068',
      associate: '#108ee9',
    };
    return colors[role] || '#108ee9';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 14 : 18,
          fontWeight: 'bold',
        }}>
          {collapsed ? 'EWT' : 'Work Tracker'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={getMenuItems()}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'all 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          <Space size="large">
            <Badge count={unreadCount} size="small">
              <Button
                type="text"
                icon={<BellOutlined />}
                onClick={() => navigate('/notifications')}
              />
            </Badge>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ backgroundColor: getRoleColor(user?.role) }}>
                  {user?.full_name?.charAt(0)?.toUpperCase()}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <Text strong>{user?.full_name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                    {user?.role?.replace('_', ' ')}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
