import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LockOutlined } from '@ant-design/icons';

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f0f2f5'
    }}>
      <Result
        status="403"
        icon={<LockOutlined style={{ fontSize: 72, color: '#ff4d4f' }} />}
        title="403"
        subTitle="Sorry, you don't have permission to access this page."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        }
      />
    </div>
  );
};

export default Unauthorized;
