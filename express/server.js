require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const connectDB = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const formRoutes = require('./src/routes/formRoutes');
const worksheetRoutes = require('./src/routes/worksheetRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// CORS Middleware - MUST BE FIRST
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5174');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/teams', teamRoutes);
app.use('/tasks', taskRoutes);
app.use('/forms', formRoutes);
app.use('/worksheets', worksheetRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/reports', reportRoutes);
app.use('/notifications', notificationRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ detail: 'Route not found' });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`\n🚀 Express Server is running on port ${PORT}`);
  console.log(`📡 API: http://localhost:8000`);
  console.log(`💚 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
