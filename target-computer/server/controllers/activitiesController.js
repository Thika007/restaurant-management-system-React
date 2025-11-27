const { getConnection, sql } = require('../config/db');

// Helper function to create activity record
const createActivity = async (type, message, branch, timestamp, metadata = null) => {
  try {
    const pool = await getConnection();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    
    await pool.request()
      .input('type', sql.NVarChar, type)
      .input('message', sql.NVarChar(sql.MAX), message)
      .input('branch', sql.NVarChar, branch)
      .input('timestamp', sql.DateTime, timestamp || new Date())
      .input('metadata', sql.NVarChar(sql.MAX), metadataJson)
      .query(`
        INSERT INTO RecentActivities (type, message, branch, timestamp, metadata)
        VALUES (@type, @message, @branch, @timestamp, @metadata)
      `);
  } catch (error) {
    console.error('Error creating activity:', error);
    // Don't throw error - activity logging should not break main operations
  }
};

// Get recent activities
const getRecentActivities = async (req, res) => {
  try {
    const { branch, dateFrom, dateTo, limit = 100 } = req.query;
    const pool = await getConnection();
    
    let query = `
      SELECT TOP (@limit) 
        id, type, message, branch, timestamp, metadata, createdAt
      FROM RecentActivities 
      WHERE 1=1
    `;
    const request = pool.request();
    request.input('limit', sql.Int, parseInt(limit) || 100);
    
    if (branch && branch !== 'All Branches') {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    
    if (dateFrom) {
      query += ' AND timestamp >= @dateFrom';
      request.input('dateFrom', sql.DateTime, new Date(dateFrom));
    }
    
    if (dateTo) {
      query += ' AND timestamp <= @dateTo';
      // Add end of day to dateTo
      const dateToObj = new Date(dateTo);
      dateToObj.setHours(23, 59, 59, 999);
      request.input('dateTo', sql.DateTime, dateToObj);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const result = await request.query(query);
    
    const activities = result.recordset.map(activity => ({
      id: activity.id,
      type: activity.type,
      message: activity.message,
      branch: activity.branch,
      timestamp: activity.timestamp instanceof Date 
        ? activity.timestamp.toISOString() 
        : new Date(activity.timestamp).toISOString(),
      date: activity.timestamp instanceof Date 
        ? activity.timestamp 
        : new Date(activity.timestamp),
      metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
      createdAt: activity.createdAt instanceof Date 
        ? activity.createdAt.toISOString() 
        : new Date(activity.createdAt).toISOString()
    }));
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching recent activities' });
  }
};

module.exports = {
  getRecentActivities,
  createActivity
};


