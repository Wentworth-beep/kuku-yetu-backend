const pool = require('../config/database');

class Notification {
  static async create(notificationData) {
    const { user_id, title, message, type } = notificationData;

    const query = `
      INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      RETURNING *
    `;

    const values = [user_id, title, message, type];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async findUnreadByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async markAsRead(id, userId) {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  static async markAllAsRead(userId) {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 RETURNING *',
      [userId]
    );
    return result.rows;
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  static async deleteAll(userId) {
    const result = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 RETURNING *',
      [userId]
    );
    return result.rows;
  }

  static async getUnreadCount(userId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = Notification;
