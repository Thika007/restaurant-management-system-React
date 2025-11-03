const { getConnection, sql } = require('../config/db');

const getAllBranches = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM Branches ORDER BY name');
    res.json({ success: true, branches: result.recordset });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ success: false, message: 'Error fetching branches' });
  }
};

const getBranchByName = async (req, res) => {
  try {
    const { name } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .query('SELECT * FROM Branches WHERE name = @name');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    res.json({ success: true, branch: result.recordset[0] });
  } catch (error) {
    console.error('Get branch error:', error);
    res.status(500).json({ success: false, message: 'Error fetching branch' });
  }
};

const createBranch = async (req, res) => {
  try {
    const { name, address, manager, phone, email } = req.body;

    if (!name || !address || !manager) {
      return res.status(400).json({ success: false, message: 'Name, address, and manager are required' });
    }

    const pool = await getConnection();

    // Check if branch exists
    const checkResult = await pool.request()
      .input('name', sql.NVarChar, name)
      .query('SELECT name FROM Branches WHERE name = @name');

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Branch already exists' });
    }

    await pool.request()
      .input('name', sql.NVarChar, name)
      .input('address', sql.NVarChar, address)
      .input('manager', sql.NVarChar, manager)
      .input('phone', sql.NVarChar, phone || null)
      .input('email', sql.NVarChar, email || null)
      .query(`
        INSERT INTO Branches (name, address, manager, phone, email)
        VALUES (@name, @address, @manager, @phone, @email)
      `);

    res.json({ success: true, message: 'Branch created successfully' });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ success: false, message: 'Error creating branch' });
  }
};

const updateBranch = async (req, res) => {
  try {
    const { originalName } = req.params;
    const { name, address, manager, phone, email } = req.body;

    if (!name || !address || !manager) {
      return res.status(400).json({ success: false, message: 'Name, address, and manager are required' });
    }

    const pool = await getConnection();

    // Check if new name conflicts with another branch
    if (name !== originalName) {
      const checkResult = await pool.request()
        .input('name', sql.NVarChar, name)
        .query('SELECT name FROM Branches WHERE name = @name');

      if (checkResult.recordset.length > 0) {
        return res.status(400).json({ success: false, message: 'Branch name already exists' });
      }
    }

    await pool.request()
      .input('originalName', sql.NVarChar, originalName)
      .input('name', sql.NVarChar, name)
      .input('address', sql.NVarChar, address)
      .input('manager', sql.NVarChar, manager)
      .input('phone', sql.NVarChar, phone || null)
      .input('email', sql.NVarChar, email || null)
      .query(`
        UPDATE Branches 
        SET name = @name, address = @address, manager = @manager, phone = @phone, email = @email, updatedAt = GETDATE()
        WHERE name = @originalName
      `);

    res.json({ success: true, message: 'Branch updated successfully' });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ success: false, message: 'Error updating branch' });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const { name } = req.params;
    const pool = await getConnection();

    await pool.request()
      .input('name', sql.NVarChar, name)
      .query('DELETE FROM Branches WHERE name = @name');

    res.json({ success: true, message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ success: false, message: 'Error deleting branch' });
  }
};

module.exports = {
  getAllBranches,
  getBranchByName,
  createBranch,
  updateBranch,
  deleteBranch
};

