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
    console.log('Getting recent activities with params:', { branch, dateFrom, dateTo, limit }); // Debug log
    
    const pool = await getConnection();
    
    // First, check total count of activities in database (for debugging)
    try {
      const countResult = await pool.request().query('SELECT COUNT(*) as total FROM RecentActivities');
      console.log(`Total activities in database: ${countResult.recordset[0]?.total || 0}`);
    } catch (countError) {
      console.error('Error counting activities:', countError);
    }
    
    const limitValue = parseInt(limit) || 100;
    let query = `
      SELECT TOP (${limitValue})
        id, type, message, branch, timestamp, metadata, createdAt
      FROM RecentActivities 
      WHERE 1=1
    `;
    const request = pool.request();
    
    // Only filter by branch if a specific branch is selected (not "All Branches" or empty)
    // When "All Branches" is selected or no branch filter, show all activities (including NULL branches)
    if (branch && branch !== 'All Branches' && branch !== '' && branch !== null) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    
    // Make date filtering optional - only apply if dates are provided
    if (dateFrom) {
      query += ' AND timestamp >= @dateFrom';
      try {
        const dateFromObj = new Date(dateFrom);
        if (!isNaN(dateFromObj.getTime())) {
          dateFromObj.setHours(0, 0, 0, 0);
          request.input('dateFrom', sql.DateTime, dateFromObj);
        }
      } catch (err) {
        console.error('Error parsing dateFrom:', err);
      }
    }
    
    if (dateTo) {
      query += ' AND timestamp <= @dateTo';
      try {
        const dateToObj = new Date(dateTo);
        if (!isNaN(dateToObj.getTime())) {
          // Add end of day to dateTo
          dateToObj.setHours(23, 59, 59, 999);
          request.input('dateTo', sql.DateTime, dateToObj);
        }
      } catch (err) {
        console.error('Error parsing dateTo:', err);
      }
    }
    
    query += ' ORDER BY timestamp DESC';
    
    console.log('Executing query:', query); // Debug log
    const result = await request.query(query);
    
    console.log(`Found ${result.recordset.length} activities`); // Debug log
    
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
          metadata: activity.metadata ? (typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata) : null,
          createdAt: activity.createdAt instanceof Date 
            ? activity.createdAt.toISOString() 
            : (activity.createdAt ? new Date(activity.createdAt).toISOString() : null)
        };
      } catch (parseError) {
        console.error('Error parsing activity:', parseError, activity);
        return null;
      }
    }).filter(activity => activity !== null);
    
    console.log(`Returning ${activities.length} parsed activities`); // Debug log
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Get recent activities error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Error fetching recent activities', error: error.message });
  }
};

module.exports = {
  getRecentActivities,
  createActivity
};


