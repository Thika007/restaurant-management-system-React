const { getConnection } = require('../config/db');

/**
 * Clear all transaction data (sales, transfers, returns, added details)
 * 
 * This function clears ALL data that appears on:
 * - Dashboard (sales, stock values, cash entries, returns, transfers, activities, recent activities)
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

    // 4. GroceryDailyRemaining - Daily remaining stock snapshots (auto-recorded)
    await pool.request().query('DELETE FROM GroceryDailyRemaining');

    // 5. GroceryStocks - Grocery stock batches with expiry dates (Dashboard stock values, Expire Tracking)
    await pool.request().query('DELETE FROM GroceryStocks');

    // 6. MachineSales - Machine sales records (Dashboard, Reports)
    await pool.request().query('DELETE FROM MachineSales');

    // 7. MachineBatches - Machine batch tracking (Dashboard)
    await pool.request().query('DELETE FROM MachineBatches');

    // 8. CashEntries - Cash reconciliation entries (Dashboard)
    await pool.request().query('DELETE FROM CashEntries');

    // 9. TransferHistory - Internal transfer records (Dashboard activities)
    await pool.request().query('DELETE FROM TransferHistory');

    // 10. FinishedBatches - Finished batch markers (Reports filtering)
    await pool.request().query('DELETE FROM FinishedBatches');

    // 11. Notifications - System notifications (Dashboard)
    await pool.request().query('DELETE FROM Notifications');

    // 12. RecentActivities - Recent activity logs (Dashboard Recent Activity table)
    await pool.request().query('DELETE FROM RecentActivities');

    // Reset auto-increment identities for tables that have them so they start from 1 again
    try {
      await pool.request().query("DBCC CHECKIDENT ('Stocks', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('GrocerySales', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('GroceryReturns', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('GroceryDailyRemaining', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('MachineSales', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('CashEntries', RESEED, 0)");
      await pool.request().query("DBCC CHECKIDENT ('RecentActivities', RESEED, 0)");
    } catch (e) {
      console.log('Note: Could not reset some identities (they might be empty already)');
    }

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

