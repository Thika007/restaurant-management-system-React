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

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const pool = await getConnection();
    
    // Check user in database
    const userResult = await pool.request()
      .input('username', sql.NVarChar, username.toLowerCase())
      .query(`
        SELECT id, username, fullName, password, role, status, accesses, assignedBranches, expireTrackingBranches
        FROM Users 
        WHERE LOWER(username) = @username AND status = 'Active'
      `);

    const user = userResult.recordset[0];
    
    // User not found or inactive
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password using bcrypt
    // Check if password is hashed (starts with $2a$ or $2b$) or plain text (for backward compatibility)
    const isPasswordValid = user.password.startsWith('$2a$') || user.password.startsWith('$2b$')
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Update last login
    await pool.request()
      .input('id', sql.NVarChar, user.id)
      .query('UPDATE Users SET lastLogin = GETDATE() WHERE id = @id');

    // If user is admin, automatically set all accesses and all branches
    const isAdmin = user.role === 'admin';
    let finalAccesses = user.accesses ? JSON.parse(user.accesses) : [];
    let finalBranches = user.assignedBranches ? JSON.parse(user.assignedBranches) : [];
    let finalExpireTrackingBranches = user.expireTrackingBranches ? JSON.parse(user.expireTrackingBranches) : [];

    if (isAdmin) {
      finalAccesses = ALL_ACCESS_OPTIONS;
      // Get all branches
      const branchesResult = await pool.request().query('SELECT name FROM Branches');
      finalBranches = branchesResult.recordset.map(b => b.name);
      finalExpireTrackingBranches = finalBranches;
    }

    // Parse JSON fields
    const response = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role || 'custom',
        status: user.status,
        accesses: finalAccesses,
        assignedBranches: finalBranches,
        expireTrackingBranches: finalExpireTrackingBranches
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  login
};

