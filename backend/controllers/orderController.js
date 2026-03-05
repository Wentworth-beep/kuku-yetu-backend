const pool = require('../config/database');

const generateOrderId = () => {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

const createOrder = async (req, res) => {
  try {
    console.log('Creating order for user:', req.user.id);
    
    const {
      customer_name, phone, location, products, total_amount
    } = req.body;

    if (!customer_name || !phone || !location || !products || !total_amount) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    const order_id = generateOrderId();
    const productsJson = JSON.stringify(products);
    const cleanTotal = parseFloat(total_amount);

    // ABSOLUTE MINIMAL INSERT - only 6 parameters
    const query = `
      INSERT INTO orders (user_id, customer_name, phone, location, products, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const values = [
      req.user.id,
      customer_name,
      phone,
      location,
      productsJson,
      cleanTotal
    ];

    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: 'Order created',
      order: { id: result.rows[0].id, order_id: order_id }
    });

  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export all required functions
module.exports = {
  createOrder,
  getAllOrders: async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
      res.json({ success: true, orders: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getUserOrders: async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders WHERE user_id = $1', [req.user.id]);
      res.json({ success: true, orders: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getOrderById: async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
      res.json({ success: true, order: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  updateOrderStatus: async (req, res) => {
    try {
      const { status } = req.body;
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
      res.json({ success: true, message: 'Status updated' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  cancelOrder: async (req, res) => {
    try {
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', req.params.id]);
      res.json({ success: true, message: 'Order cancelled' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getOrderStats: async (req, res) => {
    try {
      const result = await pool.query('SELECT COUNT(*) as total FROM orders');
      res.json({ success: true, stats: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getRecentOrders: async (req, res) => {
    try {
      const limit = req.params.limit || 10;
      const result = await pool.query('SELECT * FROM orders ORDER BY id DESC LIMIT $1', [limit]);
      res.json({ success: true, orders: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};
