import { useState, useEffect } from 'react';
import { List, Card, Button, Typography, Space, Tag, Empty, message, Popconfirm } from 'antd';
import {
  BellOutlined, CheckOutlined, DeleteOutlined, ClearOutlined,
  FileTextOutlined, CheckSquareOutlined, ClockCircleOutlined, WarningOutlined
} from '@ant-design/icons';
import { notificationService } from '../api/services';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationService.getNotifications({ limit: 50 });
      setNotifications(response.data);
    } catch (error) {
      message.error('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ));
    } catch (error) {
      message.error('Failed to mark as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      message.success('All notifications marked as read');
    } catch (error) {
      message.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications(notifications.filter(n => n.id !== id));
      message.success('Notification deleted');
    } catch (error) {
      message.error('Failed to delete notification');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await notificationService.deleteAll();
      setNotifications([]);
      message.success('All notifications deleted');
    } catch (error) {
      message.error('Failed to delete notifications');
    }
  };

  const handleClick = (notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'worksheet_submitted':
      case 'worksheet_verified':
      case 'worksheet_rejected':
        navigate(`/worksheets/${notification.related_id}`);
        break;
      case 'task_assigned':
      case 'task_updated':
        navigate(`/tasks/${notification.related_id}`);
        break;
      case 'overtime_alert':
        navigate('/reports');
        break;
      default:
        break;
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'worksheet_submitted':
      case 'worksheet_verified':
      case 'worksheet_rejected':
        return <FileTextOutlined />;
      case 'task_assigned':
      case 'task_updated':
        return <CheckSquareOutlined />;
      case 'overtime_alert':
        return <ClockCircleOutlined />;
      case 'break_limit_warning':
        return <WarningOutlined />;
      default:
        return <BellOutlined />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'worksheet_verified':
        return 'green';
      case 'worksheet_rejected':
        return 'red';
      case 'worksheet_submitted':
        return 'blue';
      case 'task_assigned':
        return 'purple';
      case 'overtime_alert':
        return 'orange';
      case 'break_limit_warning':
        return 'gold';
      default:
        return 'default';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div>
      <Card
        title={
          <Space>
            <BellOutlined />
            <Title level={4} style={{ margin: 0 }}>Notifications</Title>
            {unreadCount > 0 && <Tag color="red">{unreadCount} unread</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<CheckOutlined />}
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              Mark All Read
            </Button>
            <Popconfirm
              title="Delete all notifications?"
              onConfirm={handleDeleteAll}
              okText="Yes"
              cancelText="No"
            >
              <Button
                danger
                icon={<ClearOutlined />}
                disabled={notifications.length === 0}
              >
                Clear All
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        {notifications.length === 0 ? (
          <Empty description="No notifications" />
        ) : (
          <List
            loading={loading}
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{
                  background: item.is_read ? 'transparent' : '#f6ffed',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
                onClick={() => handleClick(item)}
                actions={[
                  !item.is_read && (
                    <Button
                      type="link"
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(item.id);
                      }}
                    >
                      Mark Read
                    </Button>
                  ),
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                  >
                    Delete
                  </Button>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: `var(--ant-${getTypeColor(item.type)}-1, #f0f0f0)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}>
                      {getIcon(item.type)}
                    </div>
                  }
                  title={
                    <Space>
                      <Text strong={!item.is_read}>{item.title}</Text>
                      <Tag color={getTypeColor(item.type)} style={{ fontSize: 10 }}>
                        {item.type.replace(/_/g, ' ')}
                      </Tag>
                    </Space>
                  }
                  description={
                    <>
                      <Text>{item.message}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(item.created_at).fromNow()}
                      </Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default Notifications;
