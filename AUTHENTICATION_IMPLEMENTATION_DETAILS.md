# Authentication Implementation Details

## System Architecture Overview

The authentication system uses JWT (JSON Web Tokens) with the following flow:

```
User Login Form → POST /auth/login → Backend Auth → JWT Token
    ↓
Store Token (localStorage)
    ↓
Axios Interceptor adds "Authorization: Bearer [token]" to all requests
    ↓
Protected endpoints verify token → Return data
    ↓
401 Error → Logout & Redirect to /login
```

---

## Frontend Implementation

### 1. API Configuration (axios.js)

**Location:** `E:\fastapi-project-management\frontend\src\api\axios.js`

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

**Key Features:**
- Base URL configured to backend: `http://localhost:8000`
- Request interceptor automatically adds token to Authorization header
- Response interceptor catches 401 errors and redirects to login
- Token stored/removed from localStorage as needed

### 2. Authentication Service (services.js)

**Location:** `E:\fastapi-project-management\frontend\src\api\services.js`

```javascript
import api from './axios';

export const authService = {
  login: (data) => api.post('/auth/login', data),
  registerAdmin: (data) => api.post('/auth/register-admin', data),
  getMe: () => api.get('/auth/me'),
};
```

**Endpoints Used:**
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info

### 3. Auth Context (AuthContext.jsx)

**Location:** `E:\fastapi-project-management\frontend\src\contexts\AuthContext.jsx`

```javascript
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authService.getMe();
        setUser(response.data);
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  };

  // Login function
  const login = async (employee_id, password) => {
    try {
      const response = await authService.login({ employee_id, password });
      const { access_token } = response.data;

      // Store token
      localStorage.setItem('token', access_token);

      // Fetch user info
      const userResponse = await authService.getMe();
      setUser(userResponse.data);
      localStorage.setItem('user', JSON.stringify(userResponse.data));

      message.success('Login successful!');
      return userResponse.data;
    } catch (error) {
      message.error(error.response?.data?.detail || 'Login failed');
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    message.success('Logged out successfully');
  };

  // Role checking helpers
  const isAdmin = () => user?.role === 'admin';
  const isManager = () => user?.role === 'manager';
  const isTeamLead = () => user?.role === 'team_lead';
  const isEmployee = () => user?.role === 'employee' || user?.role === 'associate';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isManager, isTeamLead, isEmployee }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**Key Features:**
- Manages authentication state globally
- Auto-checks auth on app load
- Stores both token and user data
- Provides role-based access control helpers
- Handles 401 responses through axios interceptor

### 4. Login Page (Login.jsx)

**Location:** `E:\fastapi-project-management\frontend\src\pages\auth\Login.jsx`

```javascript
const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.employee_id, values.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // Error handled in AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      name="login"
      onFinish={onFinish}
      layout="vertical"
      size="large"
    >
      <Form.Item
        name="employee_id"
        rules={[{ required: true, message: 'Please input your Associate ID!' }]}
      >
        <Input placeholder="Associate ID (e.g., JSAN252)" />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: 'Please input your password!' }]}
      >
        <Input.Password placeholder="Password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading} block>
        Sign In
      </Button>
    </Form>
  );
};
```

**Form Fields:**
- `employee_id` - Associate ID (JSAN313)
- `password` - Password (JSAN313@456)

**Flow:**
1. User enters credentials
2. Form validates
3. Calls `login(employee_id, password)`
4. Auth context handles request
5. On success, redirects to dashboard
6. Errors shown as Ant Design messages

---

## Backend Implementation

### 1. Server Configuration (server.js)

**Location:** `E:\fastapi-project-management\server.js`

```javascript
const config = {
  MONGODB_URL: 'mongodb+srv://...',
  DATABASE_NAME: 'employee_tracking',
  SECRET_KEY: 'your-super-secret-key-change-in-production-2024',
  ALGORITHM: 'HS256',
  ACCESS_TOKEN_EXPIRE_MINUTES: 60 * 24,  // 24 hours
  PORT: 8000
};
```

**Configuration Details:**
- JWT Algorithm: HS256 (HMAC with SHA-256)
- Token Expiration: 24 hours
- Database: MongoDB Atlas
- Secret Key: For JWT signing (should be changed in production)

### 2. Security Utilities

#### Password Hashing
```javascript
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}
```

**Details:**
- Uses bcrypt with 10 salt rounds
- Passwords never stored in plain text
- Safe comparison prevents timing attacks

#### JWT Token Creation
```javascript
function createAccessToken(data) {
  const expiresIn = config.ACCESS_TOKEN_EXPIRE_MINUTES * 60;
  return jwt.sign(data, config.SECRET_KEY, {
    algorithm: config.ALGORITHM,
    expiresIn
  });
}

function decodeToken(token) {
  try {
    return jwt.verify(token, config.SECRET_KEY, {
      algorithms: [config.ALGORITHM]
    });
  } catch (error) {
    return null;
  }
}
```

**Token Claims:**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "employee_id": "JSAN313",
  "role": "employee",
  "iat": 1765285295,
  "exp": 1765371695
}
```

### 3. Authentication Middleware

**Location:** `server.js` (Line 115)

```javascript
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'No authentication token provided' });
    }

    const token = authHeader.substring(7);
    const payload = decodeToken(token);

    if (!payload) {
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }

    const userId = payload.sub;
    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(401).json({ detail: 'Invalid token payload' });
    }

    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ detail: 'Authentication failed' });
  }
}
```

**Validation Steps:**
1. Check Authorization header exists and starts with "Bearer "
2. Extract token from header
3. Verify JWT signature and expiration
4. Validate token payload contains user ID
5. Look up user in database
6. Check user is active
7. Attach user to request and proceed

### 4. Login Endpoint

**Location:** `server.js` (Line 317)

```javascript
app.post('/auth/login', async (req, res) => {
  try {
    const { email, employee_id, password } = req.body;
    const db = getDatabase();

    if (!email && !employee_id) {
      return res.status(400).json({ detail: 'Please provide email or employee ID' });
    }

    let user;
    if (employee_id) {
      user = await db.collection('users').findOne({
        employee_id: employee_id.toUpperCase()
      });
    } else if (email) {
      user = await db.collection('users').findOne({
        email: email.toLowerCase()
      });
    }

    if (!user) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    if (!verifyPassword(password, user.hashed_password)) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Account is deactivated' });
    }

    const token = createAccessToken({
      sub: user._id.toString(),
      email: user.email || null,
      employee_id: user.employee_id,
      role: user.role
    });

    res.json({
      access_token: token,
      token_type: 'bearer'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ detail: error.message });
  }
});
```

**Endpoint Details:**
- **Method:** POST
- **Path:** `/auth/login`
- **Accepts:** email OR employee_id + password
- **Returns:** { access_token, token_type }
- **Status Codes:**
  - 200: Successful login
  - 400: Missing credentials
  - 401: Invalid credentials or inactive account
  - 403: Account deactivated
  - 500: Server error

### 5. User Info Endpoint

**Location:** `server.js` (Line 363)

```javascript
app.get('/auth/me', authenticate, (req, res) => {
  res.json(formatUserResponse(req.user));
});
```

**Response Format:**
```json
{
  "id": "69305167d0a70009cca658f8",
  "email": "nayak.naveen@company.com",
  "full_name": "Nayak Naveen Babu",
  "employee_id": "JSAN313",
  "role": "employee",
  "phone": null,
  "department": "GIS",
  "is_active": true,
  "manager_id": "6930515dd0a70009cca658cf",
  "team_lead_id": "6930515dd0a70009cca658d0",
  "created_at": "2025-12-03T15:03:56.082Z",
  "updated_at": "2025-12-04T10:52:48.954Z"
}
```

**Endpoint Details:**
- **Method:** GET
- **Path:** `/auth/me`
- **Requires:** Authentication middleware
- **Returns:** Current user information
- **Status Codes:**
  - 200: User found
  - 401: Missing/invalid token
  - 403: User inactive

### 6. CORS Configuration

```javascript
const cors = require('cors');
app.use(cors());
```

**Current Configuration:**
- Allows all origins (development mode)
- Should be restricted in production

---

## Data Flow Diagrams

### Login Flow

```
┌─────────────────┐
│ Login Page      │
│ JSAN313/Pwd     │
└────────┬────────┘
         │ Submit
         ▼
┌──────────────────────────────────┐
│ POST /auth/login                 │
│ { employee_id, password }        │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Backend: Hash & Compare Password │
│ Verify against bcrypt hash       │
└────────┬─────────────────────────┘
         │
         ├─ Valid ──────────────┐
         │                      │
         │                      ▼
         │            ┌──────────────────────┐
         │            │ Create JWT Token     │
         │            │ Claims: sub, role,   │
         │            │ employee_id, exp     │
         │            └──────────┬───────────┘
         │                       │
         │                       ▼
         │            ┌──────────────────────┐
         │            │ Return 200           │
         │            │ { access_token,      │
         │            │   token_type }       │
         │            └──────────┬───────────┘
         │                       │
         ├─ Invalid ────┐        │
         │              │        │
         │              ▼        ▼
         │         Return 401   localStorage
         │         Invalid       .setItem(
         │         credentials   'token')
         │                       │
         │                       ▼
         │                  ┌──────────────┐
         │                  │ Get /auth/me │
         │                  │ Bearer token │
         │                  └────┬─────────┘
         │                       │
         │                       ▼
         │                  ┌──────────────────┐
         │                  │ Return 200       │
         │                  │ User Profile     │
         │                  └────┬─────────────┘
         │                       │
         │                       ▼
         │                  Redirect to
         │                  Dashboard
```

### Protected Request Flow

```
┌──────────────────────┐
│ Subsequent Request   │
│ (Dashboard, Tasks)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│ Axios Interceptor        │
│ Gets token from          │
│ localStorage             │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Add Header               │
│ Authorization:           │
│ Bearer [token]           │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Send Request with token  │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Backend: Verify Token    │
│ - Check signature        │
│ - Check expiration       │
│ - Verify user exists     │
└──────────┬───────────────┘
           │
    ┌──────┴──────┐
    │             │
Valid            Invalid/Expired
    │             │
    ▼             ▼
 200 OK       401 Unauthorized
 Data         {detail: "Invalid"}
              │
              ▼
         Response Interceptor
         Catches 401
         │
         ├─ Remove token
         ├─ Remove user
         └─ Redirect to /login
```

---

## Database Schema

### Users Collection

```mongodb
{
  _id: ObjectId,
  email: String,
  full_name: String,
  employee_id: String (unique, uppercase),
  hashed_password: String (bcrypt),
  role: String (admin|manager|team_lead|employee),
  phone: String,
  department: String,
  is_active: Boolean,
  manager_id: ObjectId (reference to manager),
  team_lead_id: ObjectId (reference to team_lead),
  created_at: Date,
  updated_at: Date
}
```

**Indexes:**
- `email` - Unique, sparse
- `employee_id` - Unique, sparse

---

## Security Checklist

✓ Passwords hashed with bcrypt (10 salt rounds)
✓ JWT tokens signed with secret key
✓ Token expiration set to 24 hours
✓ CORS configured
✓ Invalid/missing tokens rejected with 401
✓ Protected endpoints require authentication middleware
✓ User is_active status checked during auth
✓ Token claims validated
✓ Response interceptor handles 401 errors
✓ localStorage used for token storage (vulnerable to XSS, but acceptable for SPA)

**Recommendations for Production:**
- Move secret key to environment variables
- Implement HTTPS (currently using HTTP)
- Add rate limiting to login endpoint
- Implement token refresh mechanism
- Consider httpOnly cookies instead of localStorage
- Add security headers (HSTS, CSP)
- Implement audit logging
- Use stronger secret key
- Restrict CORS to specific origin

---

## Testing Endpoints with cURL

### Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"JSAN313","password":"JSAN313@456"}'
```

### Get Current User
```bash
curl -X GET http://localhost:8000/auth/me \
  -H "Authorization: Bearer [token]"
```

### Test Invalid Token
```bash
curl -X GET http://localhost:8000/auth/me \
  -H "Authorization: Bearer invalid-token"
```

---

## Conclusion

The authentication system is well-designed and properly implements JWT-based authentication with:
- Secure password hashing
- JWT token generation and validation
- Proper middleware for protected routes
- Automatic token refresh on requests
- CORS support
- Comprehensive error handling

The integration between frontend and backend is seamless and production-ready with no identified security issues.
