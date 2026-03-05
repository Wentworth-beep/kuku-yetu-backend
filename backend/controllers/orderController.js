const pool = require('../config/database');

const generateOrderId = () => {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

const createOrder = async (req, res) => {
  try {
    console.log('🔵 Creating order for user:', req.user.id);
    console.log('📦 Received data:', JSON.stringify(req.body, null, 2));

    const {
      customer_name, phone, alternative_phone,
      location, specific_address, products, total_amount
    } = req.body;

    // Validation
    if (!customer_name || !phone || !location || !products || !total_amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const order_id = generateOrderId();
    const productsJson = JSON.stringify(products);
    const cleanTotal = parseFloat(total_amount);

    // First, check which columns exist
    const columns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders'
    `);
    
    const columnNames = columns.rows.map(col => col.column_name);
    console.log('📊 Available columns:', columnNames);

    // Build query dynamically based on existing columns
    let insertColumns = ['user_id', 'customer_name', 'phone', 'location', 'products', 'total_amount', 'status'];
    let insertValues = [req.user.id, customer_name, phone, location, productsJson, cleanTotal, 'pending'];
    let placeholders = ['$1', '$2', '$3', '$4', '$5', '$6', '$7'];
    let paramCount = 7;

    // Add order_id if column exists
    if (columnNames.includes('order_id')) {
      insertColumns.push('order_id');
      insertValues.push(order_id);
      placeholders.push(`$${++paramCount}`);
    }

    // Add alternative_phone if column exists AND value provided
    if (columnNames.includes('alternative_phone') && alternative_phone) {
      insertColumns.push('alternative_phone');
      insertValues.push(alternative_phone);
      placeholders.push(`$${++paramCount}`);
    }

    // Add specific_address if column exists AND value provided
    if (columnNames.includes('specific_address') && specific_address) {
      insertColumns.push('specific_address');
      insertValues.push(specific_address);
      placeholders.push(`$${++paramCount}`);
    }

    // Add created_at if column exists
    if (columnNames.includes('created_at')) {
      insertColumns.push('created_at');
      placeholders.push('NOW()');
    }

    const query = `
      INSERT INTO orders (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    console.log('📝 Query:', query);
    console.log('📝 Values:', insertValues);

    const result = await pool.query(query, insertValues);
    
    // Add order_id to response if it wasn't in DB
    const newOrder = result.rows[0];
    if (!newOrder.order_id) {
      newOrder.order_id = order_id;
    }
    
    console.log('✅ Order created successfully. ID:', newOrder.id);

    // Try to create notification
    try {
      const notifQuery = `
        INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
        VALUES ($1, $2, $3, $4, false, NOW())
      `;
      await pool.query(notifQuery, [
        req.user.id,
        'Order Received',
        `Your order #${order_id} has been received.`,
        'order'
      ]);
    } catch (notifErr) {
      console.log('⚠️ Notification not sent:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (err) {
    console.error('❌ Order error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// Keep all other functions as they were in the previous version
// ... (rest of the file remains the same)

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
