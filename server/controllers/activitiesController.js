const { getConnection, sql } = require('../config/db');

// Helper function to create activity record
const createActivity = async (type, message, branch, timestamp, metadata = null, realDate = null) => {
  try {
    const pool = await getConnection();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    
    // Extract realDate from metadata if not provided and metadata contains 'date'
    if (!realDate && metadata && metadata.date) {
      try {
        realDate = new Date(metadata.date);
        if (isNaN(realDate.getTime())) {
          realDate = null;
        }
      } catch (e) {
        realDate = null;
      }
    }
    
    const request = pool.request()
      .input('type', sql.NVarChar, type)
      .input('message', sql.NVarChar(sql.MAX), message)
      .input('branch', sql.NVarChar, branch)
      .input('timestamp', sql.DateTime, timestamp || new Date())
      .input('metadata', sql.NVarChar(sql.MAX), metadataJson);
    
    let query = `
      INSERT INTO RecentActivities (type, message, branch, timestamp, metadata`;
    
    if (realDate) {
      query += ', realDate) VALUES (@type, @message, @branch, @timestamp, @metadata, @realDate)';
      request.input('realDate', sql.Date, realDate);
    } else {
      query += ') VALUES (@type, @message, @branch, @timestamp, @metadata)';
    }
    
    await request.query(query);
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
    
    const limitValue = parseInt(limit) || 100;
    let query = `
      SELECT TOP (${limitValue})
        id, type, message, branch, timestamp, metadata, createdAt, realDate
      FROM RecentActivities 
      WHERE 1=1
    `;
    const request = pool.request();
    
    if (branch && branch !== 'All Branches' && branch !== '' && branch !== null) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    
    if (dateFrom) {
      query += ' AND timestamp >= @dateFrom';
      try {
        const dateFromObj = new Date(dateFrom);
        if (!isNaN(dateFromObj.getTime())) {
          dateFromObj.setHours(0, 0, 0, 0);
          request.input('dateFrom', sql.DateTime, dateFromObj);
        }
      } catch (err) {}
    }
    
    if (dateTo) {
      query += ' AND timestamp <= @dateTo';
      try {
        const dateToObj = new Date(dateTo);
        if (!isNaN(dateToObj.getTime())) {
          dateToObj.setHours(23, 59, 59, 999);
          request.input('dateTo', sql.DateTime, dateToObj);
        }
      } catch (err) {}
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const result = await request.query(query);
    
    const activities = result.recordset.map(activity => {
      try {
        return {
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
          realDate: activity.realDate != null ? (
            activity.realDate instanceof Date 
              ? activity.realDate.toISOString().split('T')[0]
              : (typeof activity.realDate === 'string' 
                  ? activity.realDate.split('T')[0]
                  : new Date(activity.realDate).toISOString().split('T')[0])
          ) : null,
          metadata: activity.metadata ? (typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata) : null,
          createdAt: activity.createdAt instanceof Date 
            ? activity.createdAt.toISOString() 
            : (activity.createdAt ? new Date(activity.createdAt).toISOString() : null)
        };
      } catch (parseError) {
        return null;
      }
    }).filter(activity => activity !== null);
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Get recent activities error:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching recent activities' });
  }
};

module.exports = {
  getRecentActivities,
  createActivity
};
