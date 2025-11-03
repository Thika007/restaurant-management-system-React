const { getConnection } = require('../config/db');

/**
 * Clear all transaction data (sales, transfers, returns, added details)
 * 
 * This function clears ALL data that appears on:
 * - Dashboard (sales, stock values, cash entries, returns, transfers, activities)
 * - Reports (all transaction data)
 * - Expire Tracking (grocery stock with expiry dates)
 * 
 * PRESERVES (does NOT delete):
 * - Users
 * - Branches  
 * - Items (master data)
 * 
 * After clearing, Dashboard, Reports, and Expire Tracking pages will show NO data.
 */
const clearTransactionData = async (req, res) => {
  try {
    const pool = await getConnection();

    // Delete from all transaction-related tables (preserves master data: Users, Branches, Items)
    // Tables cleared (will show empty on Dashboard/Reports/Expire Tracking):
    
    // 1. Stocks - Normal items: added, returned, transferred, sold quantities (Dashboard, Reports)
    await pool.request().query('DELETE FROM Stocks');
    
    // 2. GrocerySales - Grocery item sales records (Dashboard, Reports)
    await pool.request().query('DELETE FROM GrocerySales');
    
    // 3. GroceryReturns - Grocery item returns/waste (Dashboard, Reports)
    await pool.request().query('DELETE FROM GroceryReturns');
    
    // 4. GroceryStocks - Grocery stock batches with expiry dates (Dashboard stock values, Expire Tracking)
    await pool.request().query('DELETE FROM GroceryStocks');
    
    // 5. MachineSales - Machine sales records (Dashboard, Reports)
    await pool.request().query('DELETE FROM MachineSales');
    
    // 6. MachineBatches - Machine batch tracking (Dashboard)
    await pool.request().query('DELETE FROM MachineBatches');
    
    // 7. CashEntries - Cash reconciliation entries (Dashboard)
    await pool.request().query('DELETE FROM CashEntries');
    
    // 8. TransferHistory - Internal transfer records (Dashboard activities)
    await pool.request().query('DELETE FROM TransferHistory');
    
    // 9. FinishedBatches - Finished batch markers (Reports filtering)
    await pool.request().query('DELETE FROM FinishedBatches');
    
    // 10. Notifications - System notifications (Dashboard)
    await pool.request().query('DELETE FROM Notifications');

    res.json({ 
      success: true, 
      message: 'All transaction data cleared successfully. Dashboard, Reports, and Expire Tracking will show no data. Users, branches, and items are preserved.' 
    });
  } catch (error) {
    console.error('Clear transaction data error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error clearing transaction data',
      error: error.message 
    });
  }
};

module.exports = {
  clearTransactionData
};

