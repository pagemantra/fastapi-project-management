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
  SettingOutlined,
  CheckSquareOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
    const interval = setInterval(fetchNotificationCount, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchNotificationCount = async () => {
    try {
      const response = await notificationService.getCount();
      setUnreadCount(response.data.unread);
    } catch (error) {
      console.error('Failed to fetch notification count');
    }
  };

  const getMenuItems = () => {
    const items = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
      },
    ];

    // Admin & Manager menu items
    if (user?.role === 'admin' || user?.role === 'manager') {
      items.push(
        {
          key: '/users',
          icon: <UserOutlined />,
          label: 'Users',
        },
        {
          key: '/teams',
          icon: <TeamOutlined />,
          label: 'Teams',
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
          key: '/reports',
          icon: <BarChartOutlined />,
          label: 'Reports',
        }
      );
    }

    // Team Lead menu items
    if (user?.role === 'team_lead') {
      items.push(
        {
          key: '/my-team',
          icon: <TeamOutlined />,
          label: 'My Team',
        },
        {
          key: '/verify-worksheets',
          icon: <CheckSquareOutlined />,
          label: 'Verify Worksheets',
        }
      );
    }

    // Employee menu items
    if (user?.role === 'employee') {
      items.push(
        {
          key: '/my-tasks',
          icon: <CheckSquareOutlined />,
          label: 'My Tasks',
        },
        {
          key: '/my-worksheets',
          icon: <FileTextOutlined />,
          label: 'My Worksheets',
        }
      );
    }

    // Common items for all roles
    items.push(
      {
        key: '/attendance',
        icon: <ClockCircleOutlined />,
        label: 'Attendance',
      },
      {
        key: '/tasks',
        icon: <CheckSquareOutlined />,
        label: 'Tasks',
      }
    );

    return items;
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'notifications',
      icon: <BellOutlined />,
      label: 'Notifications',
      onClick: () => navigate('/notifications'),
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
        navigate('/login');
      },
    },
  ];

  const getRoleColor = (role) => {
    const colors = {
      admin: '#f50',
      manager: '#2db7f5',
      team_lead: '#87d068',
      employee: '#108ee9',
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
