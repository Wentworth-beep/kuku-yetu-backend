const pool = require('../config/database');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getUserNotifications = async (req, res) => {
  try {
    console.log('🔔 Fetching notifications for user:', req.user.id);
    
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    
    console.log(`✅ Found ${result.rows.length} notifications`);
    
    res.json({
      success: true,
      count: result.rows.length,
      notifications: result.rows
    });
  } catch (err) {
    console.error('❌ Get notifications error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get unread notifications count
// @route   GET /api/notifications/unread/count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      count: parseInt(result.rows[0].count)
    });
  } catch (err) {
    console.error('❌ Get unread count error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found' 
      });
    }

    console.log(`✅ Notification ${id} marked as read for user ${userId}`);

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Mark as read error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 RETURNING *',
      [req.user.id]
    );

    console.log(`✅ All notifications marked as read for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      count: result.rows.length
    });
  } catch (err) {
    console.error('❌ Mark all as read error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Create notification (for internal use - can also be used as admin route)
// @route   POST /api/notifications (admin only)
// @access  Private/Admin
const createNotification = async (req, res) => {
  try {
    const { user_id, title, message, type } = req.body;

    // Validate required fields
    if (!title || !message || !type) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide title, message, and type' 
      });
    }

    let notification;
    
    if (user_id === 'all') {
      // Send to all users
      const users = await pool.query('SELECT id FROM users');
      const notifications = [];
      
      for (const user of users.rows) {
        const query = `
          INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
          VALUES ($1, $2, $3, $4, false, NOW())
          RETURNING *
        `;
        const result = await pool.query(query, [user.id, title, message, type]);
        notifications.push(result.rows[0]);
      }
      
      notification = {
        message: `Notification sent to ${notifications.length} users`,
        count: notifications.length
      };
    } else {
      // Send to specific user
      const query = `
        INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
        VALUES ($1, $2, $3, $4, false, NOW())
        RETURNING *
      `;
      const result = await pool.query(query, [user_id, title, message, type]);
      notification = result.rows[0];
    }

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (err) {
    console.error('❌ Create notification error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found' 
      });
    }

    console.log(`✅ Notification ${id} deleted for user ${userId}`);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (err) {
    console.error('❌ Delete notification error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Clear all notifications
// @route   DELETE /api/notifications/clear-all
// @access  Private
const clearAllNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 RETURNING *',
      [req.user.id]
    );

    console.log(`✅ All notifications cleared for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'All notifications cleared',
      count: result.rows.length
    });
  } catch (err) {
    console.error('❌ Clear all notifications error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get notification settings
// @route   GET /api/notifications/settings
// @access  Private
const getNotificationSettings = async (req, res) => {
  try {
    // Check if settings exist
    const settings = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [req.user.id]
    );

    if (settings.rows.length === 0) {
      // Create default settings
      const defaultSettings = await pool.query(
        `INSERT INTO notification_settings (user_id, order_updates, promotions, newsletters)
         VALUES ($1, true, true, true)
         RETURNING *`,
        [req.user.id]
      );
      
      return res.json({
        success: true,
        settings: defaultSettings.rows[0]
      });
    }

    res.json({
      success: true,
      settings: settings.rows[0]
    });
  } catch (err) {
    console.error('❌ Get notification settings error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Update notification settings
// @route   PUT /api/notifications/settings
// @access  Private
const updateNotificationSettings = async (req, res) => {
  try {
    const { order_updates, promotions, newsletters } = req.body;

    // First ensure the notification_settings table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) UNIQUE,
        order_updates BOOLEAN DEFAULT TRUE,
        promotions BOOLEAN DEFAULT TRUE,
        newsletters BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const result = await pool.query(
      `INSERT INTO notification_settings (user_id, order_updates, promotions, newsletters)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         order_updates = EXCLUDED.order_updates,
         promotions = EXCLUDED.promotions,
         newsletters = EXCLUDED.newsletters,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, order_updates, promotions, newsletters]
    );

    res.json({
      success: true,
      message: 'Notification settings updated',
      settings: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Update notification settings error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  clearAllNotifications,
  getNotificationSettings,
  updateNotificationSettings
};