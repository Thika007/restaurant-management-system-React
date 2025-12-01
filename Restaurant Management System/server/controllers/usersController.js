const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcryptjs');

// All available access options
const ALL_ACCESS_OPTIONS = [
  'Dashboard',
  'Master Creation',
  'Add Item Stock',
  'Internal Transfer',
  'Add Return Stock',
  'Cash Management',
  'Reports',
  'Expire Tracking',
  'Branch Management',
  'User Management'
];

const getAllUsers = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT id, username, fullName, role, status, accesses, assignedBranches, expireTrackingBranches, lastLogin, createdAt
      FROM Users
      ORDER BY createdAt DESC
    `);

    // Get all branches for admin users
    const branchesResult = await pool.request().query('SELECT name FROM Branches');
    const allBranchNames = branchesResult.recordset.map(b => b.name);

    const users = result.recordset.map(u => {
      const isAdmin = u.role === 'admin';
      return {
        ...u,
        accesses: isAdmin ? ALL_ACCESS_OPTIONS : (u.accesses ? JSON.parse(u.accesses) : []),
        assignedBranches: isAdmin ? allBranchNames : (u.assignedBranches ? JSON.parse(u.assignedBranches) : []),
        expireTrackingBranches: isAdmin ? allBranchNames : (u.expireTrackingBranches ? JSON.parse(u.expireTrackingBranches) : [])
      };
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM Users WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.recordset[0];
    const isAdmin = user.role === 'admin';

    // Get all branches for admin users
    let allBranchNames = [];
    if (isAdmin) {
      const branchesResult = await pool.request().query('SELECT name FROM Branches');
      allBranchNames = branchesResult.recordset.map(b => b.name);
    }

    user.accesses = isAdmin ? ALL_ACCESS_OPTIONS : (user.accesses ? JSON.parse(user.accesses) : []);
    user.assignedBranches = isAdmin ? allBranchNames : (user.assignedBranches ? JSON.parse(user.assignedBranches) : []);
    user.expireTrackingBranches = isAdmin ? allBranchNames : (user.expireTrackingBranches ? JSON.parse(user.expireTrackingBranches) : []);

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, fullName, password, accesses = [], assignedBranches = [] } = req.body;

    if (!username || !fullName || !password) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Check if username exists
    const checkResult = await pool.request()
      .input('username', sql.NVarChar, username.toLowerCase())
      .query('SELECT id FROM Users WHERE LOWER(username) = @username');

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    // Generate ID
    const countResult = await pool.request().query('SELECT COUNT(*) as count FROM Users');
    const id = 'U' + String(countResult.recordset[0].count + 1).padStart(3, '0');

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('username', sql.NVarChar, username)
      .input('fullName', sql.NVarChar, fullName)
      .input('password', sql.NVarChar, hashedPassword)
      .input('accesses', sql.NVarChar, JSON.stringify(accesses))
      .input('assignedBranches', sql.NVarChar, JSON.stringify(assignedBranches))
      .input('expireTrackingBranches', sql.NVarChar, JSON.stringify(assignedBranches))
      .query(`
        INSERT INTO Users (id, username, fullName, password, accesses, assignedBranches, expireTrackingBranches, role, status)
        VALUES (@id, @username, @fullName, @password, @accesses, @assignedBranches, @expireTrackingBranches, 'custom', 'Active')
      `);

    res.json({ success: true, message: 'User created successfully', user: { id, username, fullName } });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Error creating user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, fullName, password, status, accesses = [], assignedBranches = [] } = req.body;

    if (!username || !fullName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Check if user is admin
    const userResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT role FROM Users WHERE id = @id');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isAdmin = userResult.recordset[0].role === 'admin';

    // Get all branches for admin users
    let finalAccesses = accesses;
    let finalBranches = assignedBranches;
    
    if (isAdmin) {
      finalAccesses = ALL_ACCESS_OPTIONS;
      const branchesResult = await pool.request().query('SELECT name FROM Branches');
      finalBranches = branchesResult.recordset.map(b => b.name);
    }

    // Check if username exists for another user
    const checkResult = await pool.request()
      .input('username', sql.NVarChar, username.toLowerCase())
      .input('id', sql.NVarChar, id)
      .query('SELECT id FROM Users WHERE LOWER(username) = @username AND id != @id');

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    let updateQuery = `
      UPDATE Users 
      SET username = @username, 
          fullName = @fullName, 
          status = @status,
          accesses = @accesses,
          assignedBranches = @assignedBranches,
          expireTrackingBranches = @expireTrackingBranches,
          updatedAt = GETDATE()
    `;

    const request = pool.request()
      .input('id', sql.NVarChar, id)
      .input('username', sql.NVarChar, username)
      .input('fullName', sql.NVarChar, fullName)
      .input('status', sql.NVarChar, status || 'Active')
      .input('accesses', sql.NVarChar, JSON.stringify(finalAccesses))
      .input('assignedBranches', sql.NVarChar, JSON.stringify(finalBranches))
      .input('expireTrackingBranches', sql.NVarChar, JSON.stringify(finalBranches));

    if (password) {
      // Hash password with bcrypt before updating
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password = @password';
      request.input('password', sql.NVarChar, hashedPassword);
    }

    updateQuery += ' WHERE id = @id';

    await request.query(updateQuery);

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM Users WHERE id = @id');

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Error deleting user' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};

