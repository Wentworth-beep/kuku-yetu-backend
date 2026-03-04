const { Pool } = require('pg');
require('dotenv').config();

let pool;

try {
  // Check if we're in production (Render) or development
  if (process.env.NODE_ENV === 'production') {
    // Production - use Neon database connection string
    console.log('🔧 Connecting to Neon production database...');
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    // Ensure SSL is properly configured for Neon
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Neon/Render - accepts self-signed certificates
      },
      // Add connection timeout and retry logic
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
  } else {
    // Development - use local socket
    console.log('🔧 Connecting to local development database...');
    pool = new Pool({
      host: '/var/run/postgresql',
      database: 'kukuyetu',
      user: 'the-hype',
    });
  }

  console.log('✅ Database pool created');

  // Test the connection
  pool.connect((err, client, release) => {
    if (err) {
      console.error('❌ Database connection error:', err.message);
      console.error('Please check:');
      console.error('1. DATABASE_URL is correct in your environment variables');
      console.error('2. Neon database is accessible (allowlist Render IP if needed)');
      console.error('3. SSL settings are correct');
    } else {
      console.log('✅ Successfully connected to database');
      release();
      createTables();
    }
  });

} catch (error) {
  console.error('❌ Database configuration error:', error.message);
}

// Create tables if they don't exist
const createTables = async () => {
  if (!pool) {
    console.log('⚠️ No database connection, skipping table creation');
    return;
  }

  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table ready');

    // Products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(10) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        old_price DECIMAL(10,2),
        description TEXT,
        category VARCHAR(50) NOT NULL,
        stock_status VARCHAR(50) DEFAULT 'available',
        rating DECIMAL(2,1) DEFAULT 0,
        images TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Products table ready');

    // Orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        customer_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        alternative_phone VARCHAR(50),
        location TEXT NOT NULL,
        specific_address TEXT,
        products JSONB NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Orders table ready');

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Notifications table ready');

    // Notification settings table
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
    console.log('✅ Notification settings table ready');

    console.log('🎉 All database tables created successfully!');
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
};

module.exports = pool;