const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  clearAllNotifications,
  getNotificationSettings,
  updateNotificationSettings
} = require('../controllers/notificationController');

// User routes
router.get('/', auth, getUserNotifications);
router.get('/unread/count', auth, getUnreadCount);
router.put('/:id/read', auth, markAsRead);
router.put('/read-all', auth, markAllAsRead);
router.delete('/:id', auth, deleteNotification);
router.delete('/clear-all', auth, clearAllNotifications);

// Notification settings
router.get('/settings', auth, getNotificationSettings);
router.put('/settings', auth, updateNotificationSettings);

// Admin routes
router.post('/', auth, createNotification);

module.exports = router;