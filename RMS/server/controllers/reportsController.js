const { getConnection, sql } = require('../config/db');

const generateReport = async (req, res) => {
  try {
    const { type, dateFrom, dateTo, branch, itemFilter, itemTypeFilter } = req.body;
    const pool = await getConnection();

    let reportData = [];

    // This is a simplified version - full implementation would handle all report types
    if (type === 'item' || type === 'type' || type === 'branch') {
      // Get normal item sales (finished batches only)
      const stocksQuery = `
        SELECT s.date, s.branch, s.itemCode, s.added, s.returned, s.transferred,
               i.name as itemName, i.itemType, i.price
        FROM Stocks s
        INNER JOIN Items i ON s.itemCode = i.code
        INNER JOIN FinishedBatches f ON s.date = f.date AND s.branch = f.branch
        WHERE 1=1
      `;
      
      const request = pool.request();
      if (dateFrom) {
        request.input('dateFrom', sql.Date, dateFrom);
      }
      if (dateTo) {
        request.input('dateTo', sql.Date, dateTo);
      }
      if (branch && branch !== 'All Branches') {
        request.input('branch', sql.NVarChar, branch);
      }
      if (itemTypeFilter) {
        request.input('itemType', sql.NVarChar, itemTypeFilter);
      }

      // Build dynamic query
      let query = stocksQuery;
      if (dateFrom) query += ' AND s.date >= @dateFrom';
      if (dateTo) query += ' AND s.date <= @dateTo';
      if (branch && branch !== 'All Branches') query += ' AND s.branch = @branch';
      if (itemTypeFilter) query += ' AND i.itemType = @itemType';

      const stocksResult = await request.query(query);

      stocksResult.recordset.forEach(stock => {
        if (itemFilter && stock.itemName !== itemFilter) return;
        
        const soldQty = Math.max(0, (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0));
        if (type === 'item' && soldQty <= 0) return;

        reportData.push({
          date: stock.date.toISOString().split('T')[0],
          branch: stock.branch,
          itemName: stock.itemName,
          itemType: stock.itemType,
          returned: stock.returned || 0,
          sold: soldQty,
          sales: soldQty * parseFloat(stock.price)
        });
      });

      // Add grocery sales
      let groceryQuery = 'SELECT * FROM GrocerySales WHERE 1=1';
      const groceryRequest = pool.request();
      if (dateFrom) {
        groceryQuery += ' AND date >= @dateFrom';
        groceryRequest.input('dateFrom', sql.Date, dateFrom);
      }
      if (dateTo) {
        groceryQuery += ' AND date <= @dateTo';
        groceryRequest.input('dateTo', sql.Date, dateTo);
      }
      if (branch && branch !== 'All Branches') {
        groceryQuery += ' AND branch = @branch';
        groceryRequest.input('branch', sql.NVarChar, branch);
      }

      const groceryResult = await groceryRequest.query(groceryQuery);
      
      groceryResult.recordset.forEach(sale => {
        if (itemFilter && sale.itemName !== itemFilter) return;
        if (itemTypeFilter && 'Grocery Item' !== itemTypeFilter) return;
        if (type === 'item' && sale.soldQty <= 0) return;

        reportData.push({
          date: sale.date.toISOString().split('T')[0],
          branch: sale.branch,
          itemName: sale.itemName + ' (Grocery)',
          itemType: 'Grocery Item',
          returned: 0,
          sold: parseFloat(sale.soldQty),
          sales: parseFloat(sale.totalCash)
        });
      });

      // Add machine sales
      let machineQuery = 'SELECT * FROM MachineSales WHERE 1=1';
      const machineRequest = pool.request();
      if (dateFrom) {
        machineQuery += ' AND date >= @dateFrom';
        machineRequest.input('dateFrom', sql.Date, dateFrom);
      }
      if (dateTo) {
        machineQuery += ' AND date <= @dateTo';
        machineRequest.input('dateTo', sql.Date, dateTo);
      }
      if (branch && branch !== 'All Branches') {
        machineQuery += ' AND branch = @branch';
        machineRequest.input('branch', sql.NVarChar, branch);
      }

      const machineResult = await machineRequest.query(machineQuery);
      
      machineResult.recordset.forEach(sale => {
        if (itemFilter && sale.machineName !== itemFilter) return;
        if (itemTypeFilter && 'Machine' !== itemTypeFilter) return;
        if (type === 'item' && sale.soldQty <= 0) return;

        reportData.push({
          date: sale.date.toISOString().split('T')[0],
          branch: sale.branch,
          itemName: sale.machineName + ' (Machine)',
          itemType: 'Machine',
          returned: 0,
          sold: sale.soldQty,
          sales: parseFloat(sale.totalCash)
        });
      });
    }

    res.json({ success: true, data: reportData });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ success: false, message: 'Error generating report' });
  }
};

module.exports = {
  generateReport
};

