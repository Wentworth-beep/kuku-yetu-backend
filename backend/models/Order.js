const pool = require('../config/database');

class Order {
  static async create(orderData) {
    const {
      order_id, user_id, customer_name, phone,
      alternative_phone, location, specific_address,
      products, total_amount, status
    } = orderData;

    const query = `
      INSERT INTO orders 
      (order_id, user_id, customer_name, phone, alternative_phone, 
       location, specific_address, products, total_amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `;

    const values = [
      order_id,
      user_id,
      customer_name,
      phone,
      alternative_phone,
      location,
      specific_address,
      products,
      total_amount,
      status || 'pending'
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Order model create error:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      const result = await pool.query(`
        SELECT o.*, u.full_name as user_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC
      `);
      return result.rows;
    } catch (error) {
      console.error('Order model findAll error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Order model findById error:', error);
      throw error;
    }
  }

  static async updateStatus(id, status) {
    try {
      const result = await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Order model updateStatus error:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const result = await pool.query(
        'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Order model findByUserId error:', error);
      throw error;
    }
  }
}

module.exports = Order;