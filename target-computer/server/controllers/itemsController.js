const { getConnection, sql } = require('../config/db');

const getAllItems = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM Items ORDER BY itemType, name');
    res.json({ success: true, items: result.recordset });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ success: false, message: 'Error fetching items' });
  }
};

const getItemByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('code', sql.NVarChar, code)
      .query('SELECT * FROM Items WHERE code = @code');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    res.json({ success: true, item: result.recordset[0] });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ success: false, message: 'Error fetching item' });
  }
};

const generateItemCode = async (pool) => {
  let code;
  let exists = true;
  
  // Keep generating until we get a unique code
  while (exists) {
    code = 'ITEM' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const result = await pool.request()
      .input('code', sql.NVarChar, code)
      .query('SELECT code FROM Items WHERE code = @code');
    exists = result.recordset.length > 0;
  }
  
  return code;
};

const createItem = async (req, res) => {
  try {
    const { itemType, name, category, subcategory, price, description, soldByWeight, notifyExpiry } = req.body;

    if (!itemType || !name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // For machines, check duplicate name
    if (itemType === 'Machine') {
      const pool = await getConnection();
      const checkResult = await pool.request()
        .input('name', sql.NVarChar, name.toLowerCase())
        .input('itemType', sql.NVarChar, 'Machine')
        .query('SELECT code FROM Items WHERE LOWER(name) = @name AND itemType = @itemType');

      if (checkResult.recordset.length > 0) {
        return res.status(400).json({ success: false, message: 'Machine with this name already exists' });
      }
    }

    const pool = await getConnection();
    const code = await generateItemCode(pool);

    await pool.request()
      .input('code', sql.NVarChar, code)
      .input('itemType', sql.NVarChar, itemType)
      .input('name', sql.NVarChar, name)
      .input('category', sql.NVarChar, category)
      .input('subcategory', sql.NVarChar, subcategory || null)
      .input('price', sql.Decimal(18, 2), price)
      .input('description', sql.NVarChar, description || null)
      .input('soldByWeight', sql.Bit, soldByWeight || false)
      .input('notifyExpiry', sql.Bit, notifyExpiry || false)
      .query(`
        INSERT INTO Items (code, itemType, name, category, subcategory, price, description, soldByWeight, notifyExpiry)
        VALUES (@code, @itemType, @name, @category, @subcategory, @price, @description, @soldByWeight, @notifyExpiry)
      `);

    res.json({ success: true, message: 'Item created successfully', item: { code, name } });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ success: false, message: 'Error creating item' });
  }
};

const updateItem = async (req, res) => {
  try {
    const { code } = req.params;
    const { name, category, subcategory, price, description, soldByWeight, notifyExpiry } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Get current item to check type
    const currentItem = await pool.request()
      .input('code', sql.NVarChar, code)
      .query('SELECT itemType FROM Items WHERE code = @code');

    if (currentItem.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const itemType = currentItem.recordset[0].itemType;

    // For machines, check duplicate name (excluding current item)
    if (itemType === 'Machine') {
      const checkResult = await pool.request()
        .input('name', sql.NVarChar, name.toLowerCase())
        .input('itemType', sql.NVarChar, 'Machine')
        .input('code', sql.NVarChar, code)
        .query('SELECT code FROM Items WHERE LOWER(name) = @name AND itemType = @itemType AND code != @code');

      if (checkResult.recordset.length > 0) {
        return res.status(400).json({ success: false, message: 'Machine with this name already exists' });
      }
    }

    // For non-machine items, require category
    if (itemType !== 'Machine' && !category) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }

    // For machines, use fixed category and subcategory
    const finalCategory = itemType === 'Machine' ? 'Machine' : category;
    const finalSubcategory = itemType === 'Machine' ? 'Coffee Machine' : subcategory;

    await pool.request()
      .input('code', sql.NVarChar, code)
      .input('name', sql.NVarChar, name)
      .input('category', sql.NVarChar, finalCategory)
      .input('subcategory', sql.NVarChar, finalSubcategory || null)
      .input('price', sql.Decimal(18, 2), price)
      .input('description', sql.NVarChar, description || null)
      .input('soldByWeight', sql.Bit, soldByWeight || false)
      .input('notifyExpiry', sql.Bit, notifyExpiry || false)
      .query(`
        UPDATE Items 
        SET name = @name, category = @category, subcategory = @subcategory, 
            price = @price, description = @description, 
            soldByWeight = @soldByWeight, notifyExpiry = @notifyExpiry,
            updatedAt = GETDATE()
        WHERE code = @code
      `);

    res.json({ success: true, message: 'Item updated successfully' });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ success: false, message: 'Error updating item' });
  }
};

// Helper: check if a table exists in current database
const tableExists = async (pool, tableName) => {
  try {
    const result = await pool.request()
      .input('name', sql.NVarChar, tableName)
      .query("SELECT 1 as existsFlag FROM sys.objects WHERE object_id = OBJECT_ID(@name) AND type in ('U')");
    return result.recordset.length > 0;
  } catch (_) {
    return false;
  }
};

const deleteItem = async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await getConnection();

    // Determine item type first (machine vs others)
    const itemTypeResult = await pool.request()
      .input('code', sql.NVarChar, code)
      .query('SELECT itemType FROM Items WHERE code = @code');

    if (itemTypeResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const itemType = itemTypeResult.recordset[0].itemType;

    // Check if item has stock (basic check) - handle NULLs safely
    let stockCheck = { recordset: [] };
    if (await tableExists(pool, 'Stocks')) {
      stockCheck = await pool.request()
        .input('code', sql.NVarChar, code)
        .query(`
          SELECT TOP 1 id 
          FROM Stocks 
          WHERE itemCode = @code 
            AND (ISNULL(added,0) - ISNULL(returned,0) - ISNULL(transferred,0)) > 0
        `);
    }

    if (stockCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item with existing stock' });
    }

    // Check grocery stock (any reference blocks delete due to FK)
    let groceryCheck = { recordset: [] };
    if (await tableExists(pool, 'GroceryStocks')) {
      groceryCheck = await pool.request()
        .input('code', sql.NVarChar, code)
        .query('SELECT TOP 1 id FROM GroceryStocks WHERE itemCode = @code');
    }

    if (groceryCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item: it has grocery stock records' });
    }

    // Check machine batches (for machines). Any batch reference may block due to FK
    if (itemType === 'Machine' && await tableExists(pool, 'MachineBatches')) {
      const machineBatchCheck = await pool.request()
        .input('code', sql.NVarChar, code)
        .query('SELECT TOP 1 id FROM MachineBatches WHERE machineCode = @code');

      if (machineBatchCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete machine: it has batch records' });
      }
    }

    // Check other references that typically block deletion
    const [grocerySalesCheck, groceryReturnsCheck, machineSalesCheck, transfersCheck] = await (async () => {
      const out = [];
      if (await tableExists(pool, 'GrocerySales')) {
        out.push(pool.request().input('code', sql.NVarChar, code)
          .query('SELECT TOP 1 id FROM GrocerySales WHERE itemCode = @code'));
      } else { out.push(Promise.resolve({ recordset: [] })); }

      if (await tableExists(pool, 'GroceryReturns')) {
        out.push(pool.request().input('code', sql.NVarChar, code)
          .query('SELECT TOP 1 id FROM GroceryReturns WHERE itemCode = @code'));
      } else { out.push(Promise.resolve({ recordset: [] })); }

      if (await tableExists(pool, 'MachineSales')) {
        if (itemType === 'Machine') {
          out.push(pool.request().input('code', sql.NVarChar, code)
            .query('SELECT TOP 1 id FROM MachineSales WHERE machineCode = @code'));
        } else {
          out.push(Promise.resolve({ recordset: [] }));
        }
      } else { out.push(Promise.resolve({ recordset: [] })); }

      if (await tableExists(pool, 'TransferHistory')) {
        const needle = `%"itemCode":"${code}"%`;
        out.push(pool.request()
          .input('needle', sql.NVarChar, needle)
          .query('SELECT TOP 1 id FROM TransferHistory WHERE items LIKE @needle'));
      } else { out.push(Promise.resolve({ recordset: [] })); }

      return Promise.all(out);
    })();

    if (grocerySalesCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item: it has grocery sales records' });
    }
    if (groceryReturnsCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item: it has grocery return records' });
    }
    if (itemType === 'Machine' && machineSalesCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete machine: it has machine sales records' });
    }
    if (transfersCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete item: it is referenced by transfers' });
    }

    try {
      const result = await pool.request()
        .input('code', sql.NVarChar, code)
        .query('DELETE FROM Items WHERE code = @code');

      const rowsAffected = Array.isArray(result?.rowsAffected)
        ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
        : 0;
      if (rowsAffected === 0) {
        return res.status(404).json({ success: false, message: 'Item not found or already deleted' });
      }

      res.json({ success: true, message: 'Item deleted successfully' });
    } catch (dbError) {
      // SQL Server FK violation is error number 547
      const isFkViolation = dbError && (dbError.number === 547 || /foreign key/i.test(dbError.message || ''));
      if (isFkViolation) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete item: it is referenced by existing records (sales, returns, stocks, batches, or transfers)'
        });
      }
      console.error('Delete item DB error:', dbError);
      return res.status(500).json({ success: false, message: 'Error deleting item', error: dbError.message });
    }
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ success: false, message: 'Error deleting item', error: error.message });
  }
};

module.exports = {
  getAllItems,
  getItemByCode,
  createItem,
  updateItem,
  deleteItem
};

