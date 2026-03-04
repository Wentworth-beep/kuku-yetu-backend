const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { full_name, email, phone, password } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (full_name, email, phone, password)
      VALUES ($1, $2, $3, $4)
      RETURNING id, full_name, email, phone, created_at
    `;

    const values = [full_name, email, phone, hashedPassword];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }

  static async findByPhone(phone) {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT id, full_name, email, phone, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async validatePassword(user, password) {
    return bcrypt.compare(password, user.password);
  }
}

module.exports = User;