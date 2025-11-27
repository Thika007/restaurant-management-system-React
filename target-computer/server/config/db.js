const sql = require('mssql');
require('dotenv').config();

// SQL Server Authentication configuration
// Using SQL Server login credentials (sa/sqladmin)
const config = {
  server: process.env.DB_SERVER || 'localhost', // Try localhost first, then computer name
  database: process.env.DB_DATABASE || 'BakeryManagementDB',
  port: parseInt(process.env.DB_PORT) || 1433, // Explicitly set port
  // SQL Server Authentication
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'sqladmin',
  options: {
    encrypt: false, // Set to false for local connections, true for Azure/remote
    trustServerCertificate: true,
    enableArithAbort: true,
    // Additional connection options
    connectTimeout: 30000, // 30 seconds
    requestTimeout: 30000, // 30 seconds
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

async function getConnection() {
  try {
    if (!pool) {
      // Try primary config first
      try {
        pool = await sql.connect(config);
        console.log('Database connected successfully');
      } catch (primaryError) {
        console.error('Primary connection attempt failed:', primaryError.message);
        
        // Try alternative configurations
        // Note: For SQL Server Express, try 'localhost\\SQLEXPRESS' or 'localhost\\MSSQLSERVER'
        const instanceName = process.env.DB_INSTANCE;
        const alternatives = [
          { server: 'localhost', port: 1433 },
          { server: '127.0.0.1', port: 1433 },
          { server: instanceName ? `localhost\\${instanceName}` : 'localhost\\SQLEXPRESS', port: undefined }, // Named instance - no port
          { server: instanceName ? `127.0.0.1\\${instanceName}` : '127.0.0.1\\SQLEXPRESS', port: undefined },
          { server: process.env.DB_SERVER || 'DESKTOP-9AV7L99', port: 1433 },
          { server: '(local)', port: 1433 }
        ];
        
        for (const alt of alternatives) {
          if (alt.server === config.server && (alt.port === config.port || (!alt.port && config.port === 1433))) {
            continue; // Skip if already tried
          }
          
          try {
            const serverInfo = alt.port ? `${alt.server}:${alt.port}` : alt.server;
            console.log(`Trying alternative: ${serverInfo}`);
            const altConfig = {
              ...config,
              server: alt.server
            };
            if (alt.port !== undefined) {
              altConfig.port = alt.port;
            } else {
              delete altConfig.port; // Remove port for named instances
            }
            pool = await sql.connect(altConfig);
            console.log(`Database connected successfully using ${serverInfo}`);
            break;
          } catch (altError) {
            const serverInfo = alt.port ? `${alt.server}:${alt.port}` : alt.server;
            console.error(`Alternative connection (${serverInfo}) failed:`, altError.message);
          }
        }
        
        if (!pool) {
          throw new Error('All connection attempts failed. Please check:\n' +
            '1. SQL Server is running\n' +
            '2. TCP/IP protocol is enabled in SQL Server Configuration Manager\n' +
            '3. SQL Server Browser service is running (if using named instance)\n' +
            '4. Port 1433 is not blocked by firewall\n' +
            '5. Server name and port are correct\n' +
            '6. SQL Server Authentication is enabled (SQL Server and Windows Authentication mode)\n' +
            '7. sa account is enabled and password is correct\n' +
            'Original error: ' + primaryError.message);
        }
      }
    }
    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

async function closeConnection() {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('Database connection closed');
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

module.exports = {
  sql,
  getConnection,
  closeConnection
};

