const pool = require('../config/database');

class Product {
  // Helper function to clean image paths
  static cleanImagePaths(images) {
    if (!images) return [];
    
    // If it's already an array
    if (Array.isArray(images)) {
      return images.map(img => {
        if (typeof img === 'string') {
          // Remove double braces if they exist {{path}} -> path
          if (img.startsWith('{{') && img.endsWith('}}')) {
            return img.slice(1, -1);
          }
          // Remove single braces if they exist {path} -> path
          if (img.startsWith('{') && img.endsWith('}')) {
            return img.slice(1, -1);
          }
          return img;
        }
        return img;
      });
    }
    
    // If it's a single string (not array)
    if (typeof images === 'string') {
      // Remove double braces if they exist {{path}} -> path
      if (images.startsWith('{{') && images.endsWith('}}')) {
        return [images.slice(1, -1)];
      }
      // Remove single braces if they exist {path} -> path
      if (images.startsWith('{') && images.endsWith('}')) {
        return [images.slice(1, -1)];
      }
      return [images];
    }
    
    return [];
  }

  static async create(productData) {
    const {
      product_id, title, price, old_price,
      description, category, stock_status,
      rating, images
    } = productData;

    // Clean the image paths before storing
    const cleanImages = this.cleanImagePaths(images);

    const query = `
      INSERT INTO products 
      (product_id, title, price, old_price, description, category, stock_status, rating, images, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;

    const values = [
      product_id, 
      title, 
      price, 
      old_price, 
      description, 
      category, 
      stock_status || 'available', 
      rating, 
      cleanImages
    ];
    
    try {
      const result = await pool.query(query, values);
      const product = result.rows[0];
      // Clean images in the returned product too
      product.images = this.cleanImagePaths(product.images);
      return product;
    } catch (error) {
      console.error('Product model create error:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      // Check if created_at column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='products' AND column_name='created_at'
      `);
      
      let query;
      if (columnCheck.rows.length > 0) {
        query = 'SELECT * FROM products ORDER BY created_at DESC';
      } else {
        query = 'SELECT * FROM products ORDER BY id DESC';
      }
      
      const result = await pool.query(query);
      
      // Clean image paths for each product
      return result.rows.map(product => {
        product.images = this.cleanImagePaths(product.images);
        return product;
      });
    } catch (error) {
      console.error('Product model findAll error:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const product = result.rows[0];
      // Clean image paths
      product.images = this.cleanImagePaths(product.images);
      return product;
    } catch (error) {
      console.error('Product model findById error:', error);
      throw error;
    }
  }

  static async findByProductId(productId) {
    try {
      const result = await pool.query('SELECT * FROM products WHERE product_id = $1', [productId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const product = result.rows[0];
      // Clean image paths
      product.images = this.cleanImagePaths(product.images);
      return product;
    } catch (error) {
      console.error('Product model findByProductId error:', error);
      throw error;
    }
  }

  static async findByCategory(category) {
    try {
      const result = await pool.query(
        'SELECT * FROM products WHERE category = $1 ORDER BY id DESC',
        [category]
      );
      
      // Clean image paths for each product
      return result.rows.map(product => {
        product.images = this.cleanImagePaths(product.images);
        return product;
      });
    } catch (error) {
      console.error('Product model findByCategory error:', error);
      throw error;
    }
  }

  static async search(searchTerm) {
    try {
      const query = `
        SELECT * FROM products 
        WHERE title ILIKE $1 
        OR description ILIKE $1 
        OR category ILIKE $1
        OR product_id ILIKE $1
        ORDER BY id DESC
      `;
      const result = await pool.query(query, [`%${searchTerm}%`]);
      
      // Clean image paths for each product
      return result.rows.map(product => {
        product.images = this.cleanImagePaths(product.images);
        return product;
      });
    } catch (error) {
      console.error('Product model search error:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    const {
      title, price, old_price, description,
      category, stock_status, rating, images
    } = updateData;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (price !== undefined) {
      updates.push(`price = $${paramCount}`);
      values.push(price);
      paramCount++;
    }
    if (old_price !== undefined) {
      updates.push(`old_price = $${paramCount}`);
      values.push(old_price);
      paramCount++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount}`);
      values.push(category);
      paramCount++;
    }
    if (stock_status !== undefined) {
      updates.push(`stock_status = $${paramCount}`);
      values.push(stock_status);
      paramCount++;
    }
    if (rating !== undefined) {
      updates.push(`rating = $${paramCount}`);
      values.push(rating);
      paramCount++;
    }
    if (images !== undefined) {
      // Clean images before updating
      const cleanImages = this.cleanImagePaths(images);
      updates.push(`images = $${paramCount}`);
      values.push(cleanImages);
      paramCount++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE products 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      const product = result.rows[0];
      product.images = this.cleanImagePaths(product.images);
      return product;
    } catch (error) {
      console.error('Product model update error:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      // First, get the product to return it after deletion
      const product = await this.findById(id);
      if (!product) {
        return null;
      }

      // Delete the product
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const deletedProduct = result.rows[0];
      deletedProduct.images = this.cleanImagePaths(deletedProduct.images);
      return deletedProduct;
    } catch (error) {
      console.error('Product model delete error:', error);
      throw error;
    }
  }

  static async getFeatured(limit = 10) {
    try {
      const query = `
        SELECT * FROM products 
        WHERE rating >= 4.5 
        ORDER BY id DESC 
        LIMIT $1
      `;
      const result = await pool.query(query, [limit]);
      
      // Clean image paths for each product
      return result.rows.map(product => {
        product.images = this.cleanImagePaths(product.images);
        return product;
      });
    } catch (error) {
      console.error('Product model getFeatured error:', error);
      throw error;
    }
  }

  static async updateStock(id, stockStatus) {
    try {
      const result = await pool.query(
        'UPDATE products SET stock_status = $1 WHERE id = $2 RETURNING *',
        [stockStatus, id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const product = result.rows[0];
      product.images = this.cleanImagePaths(product.images);
      return product;
    } catch (error) {
      console.error('Product model updateStock error:', error);
      throw error;
    }
  }

  static async getByPriceRange(min, max) {
    try {
      const result = await pool.query(
        'SELECT * FROM products WHERE price BETWEEN $1 AND $2 ORDER BY price',
        [min || 0, max || 999999]
      );
      
      // Clean image paths for each product
      return result.rows.map(product => {
        product.images = this.cleanImagePaths(product.images);
        return product;
      });
    } catch (error) {
      console.error('Product model getByPriceRange error:', error);
      throw error;
    }
  }

  static async count() {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM products');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Product model count error:', error);
      throw error;
    }
  }
}

module.exports = Product;
