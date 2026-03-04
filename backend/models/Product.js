const pool = require('../config/database');

class Product {
  static async create(productData) {
    const {
      product_id, title, price, old_price,
      description, category, stock_status,
      rating, images
    } = productData;

    const query = `
      INSERT INTO products 
      (product_id, title, price, old_price, description, category, stock_status, rating, images)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [product_id, title, price, old_price, description, category, stock_status, rating, images];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    return result.rows;
  }

  static async findByCategory(category) {
    const result = await pool.query('SELECT * FROM products WHERE category = $1', [category]);
    return result.rows;
  }

  static async search(query) {
    const searchQuery = `
      SELECT * FROM products 
      WHERE title ILIKE $1 
      OR description ILIKE $1 
      OR product_id ILIKE $1
      OR category ILIKE $1
    `;
    const result = await pool.query(searchQuery, [`%${query}%`]);
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByProductId(productId) {
    const result = await pool.query('SELECT * FROM products WHERE product_id = $1', [productId]);
    return result.rows[0];
  }
}

module.exports = Product;