const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../dist')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/items', require('./routes/items'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/grocery', require('./routes/grocery'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/cash', require('./routes/cash'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/system', require('./routes/system'));
app.use('/api/activities', require('./routes/activities'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Serve React app for all non-API routes (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Clean up existing notification messages on server startup
  setTimeout(async () => {
    try {
      const notificationsRoutes = require('./routes/notifications');
      if (notificationsRoutes.cleanupNotificationMessages) {
        await notificationsRoutes.cleanupNotificationMessages();
      }
    } catch (error) {
      console.error('Error cleaning up notification messages on startup:', error);
    }
  }, 3000); // Wait 3 seconds for database connection to be ready
});

// Graceful shutdown
process.on('SIGINT', async () => {
  const { closeConnection } = require('./config/db');
  await closeConnection();
  process.exit(0);
});

module.exports = app;

