const { getConnection, sql } = require('../config/db');

const getStockTracking = async (req, res) => {
  try {
    const { branch, category, status } = req.query;

    if (!branch) {
      return res.status(400).json({ success: false, message: 'Branch is required' });
    }

    const pool = await getConnection();

    // Query grocery items with their current stock (including expired batches since they are physically present)
    const result = await pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('category', sql.NVarChar, category || null)
      .query(`
        SELECT 
          i.code,
          i.name,
          i.category,
          i.minQty,
          i.maxQty,
          ISNULL(SUM(gs.remaining), 0) AS currentQty
        FROM Items i
        LEFT JOIN GroceryStocks gs ON gs.itemCode = i.code AND gs.branch = @branch
        WHERE i.itemType = 'Grocery Item'
          AND (@category IS NULL OR i.category = @category)
        GROUP BY i.code, i.name, i.category, i.minQty, i.maxQty
        ORDER BY currentQty ASC, i.name ASC
      `);

    // Calculate status for each item
    const items = result.recordset.map(item => {
      const currentQty = parseFloat(item.currentQty || 0);
      const minQty = item.minQty != null ? parseFloat(item.minQty) : null;
      const maxQty = item.maxQty != null ? parseFloat(item.maxQty) : null;

      let status = 'Unknown';
      if (minQty != null && maxQty != null) {
        if (currentQty <= minQty) {
          status = 'Low';
        } else if (currentQty >= maxQty) {
          status = 'Full';
        } else {
          status = 'Medium';
        }
      }

      return {
        code: item.code,
        name: item.name,
        category: item.category,
        currentQty: currentQty,
        minQty: minQty,
        maxQty: maxQty,
        status: status,
        branch: branch
      };
    });

    // Filter by status if provided
    let filteredItems = items;
    if (status && status !== 'All' && status !== '') {
      filteredItems = items.filter(item => item.status === status);
    }

    res.json({ success: true, items: filteredItems });
  } catch (error) {
    console.error('Get stock tracking error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stock tracking data' });
  }
};

module.exports = {
  getStockTracking
};

