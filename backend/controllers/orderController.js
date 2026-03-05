const pool = require('../config/database');

const generateOrderNumber = () => {
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

    if (!customer_name || !phone || !location || !products || !total_amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // GENERATE ORDER NUMBER - THIS IS CRITICAL
    const order_number = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    console.log('📋 Generated order_number:', order_number);

    const productsJson = JSON.stringify(products);
    const cleanTotal = parseFloat(total_amount);

    // Log each value before insert
    console.log('📝 Values to insert:');
    console.log('   order_number:', order_number);
    console.log('   user_id:', req.user.id);
    console.log('   customer_name:', customer_name);
    console.log('   phone:', phone);
    console.log('   alternative_phone:', alternative_phone || null);
    console.log('   location:', location);
    console.log('   specific_address:', specific_address || null);
    console.log('   products:', productsJson.substring(0, 100) + '...');
    console.log('   total_amount:', cleanTotal);

    const query = `
      INSERT INTO orders 
      (order_number, user_id, customer_name, phone, alternative_phone, 
       location, specific_address, products, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      order_number,  // $1 - MUST NOT BE NULL
      req.user.id,   // $2
      customer_name, // $3
      phone,         // $4
      alternative_phone || null, // $5
      location,      // $6
      specific_address || null,  // $7
      productsJson,  // $8
      cleanTotal     // $9
    ];

    console.log('📝 Executing query with', values.length, 'parameters');
    console.log('📝 Full values array:', JSON.stringify(values));

    const result = await pool.query(query, values);
    const newOrder = result.rows[0];
    
    console.log('✅ Order created successfully! ID:', newOrder.id, 'Number:', newOrder.order_number);

    // Try notification
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, 'Order Received', `Order #${order_number} received`, 'order']
      );
      console.log('✅ Notification sent');
    } catch (e) {
      console.log('⚠️ Notification not sent:', e.message);
    }

    res.json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

    const order_number = generateOrderNumber();
    const productsJson = JSON.stringify(products);
    const cleanTotal = parseFloat(total_amount);

    // EXACT columns matching your table
    const query = `
      INSERT INTO orders 
      (order_number, user_id, customer_name, phone, alternative_phone, 
       location, specific_address, products, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      order_number,
      req.user.id,
      customer_name,
      phone,
      alternative_phone || null,
      location,
      specific_address || null,
      productsJson,
      cleanTotal
    ];

    console.log('📝 Inserting with 9 parameters');
    console.log('📝 Values:', values);

    const result = await pool.query(query, values);
    const newOrder = result.rows[0];
    
    console.log('✅ Order created. ID:', newOrder.id, 'Number:', newOrder.order_number);

    // Try notification
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type) 
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, 'Order Received', `Order #${order_number} received`, 'order']
      );
    } catch (e) {
      console.log('⚠️ Notification not sent:', e.message);
    }

    res.json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// Keep other functions simple
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
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
          COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders
      `);
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
