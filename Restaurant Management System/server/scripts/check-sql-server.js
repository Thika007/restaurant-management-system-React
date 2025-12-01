/**
 * SQL Server Diagnostic Script
 * Run this to check SQL Server connectivity and find instance names
 * Uses SQL Server Authentication (sa/sqladmin) or environment variables
 */

const sql = require('mssql');
require('dotenv').config();

// Common SQL Server configurations to test
const testConfigs = [
  // Default instance on port 1433
  { server: 'localhost', port: 1433, name: 'localhost:1433 (Default Instance)' },
  { server: '127.0.0.1', port: 1433, name: '127.0.0.1:1433 (Default Instance)' },
  
  // Common named instances
  { server: 'localhost\\SQLEXPRESS', name: 'localhost\\SQLEXPRESS' },
  { server: 'localhost\\MSSQLSERVER', name: 'localhost\\MSSQLSERVER' },
  { server: 'localhost\\MSSQL2019', name: 'localhost\\MSSQL2019' },
  { server: 'localhost\\MSSQL2017', name: 'localhost\\MSSQL2017' },
  { server: 'localhost\\MSSQL2016', name: 'localhost\\MSSQL2016' },
  
  // Using IP
  { server: '127.0.0.1\\SQLEXPRESS', name: '127.0.0.1\\SQLEXPRESS' },
  
  // Computer name variants
  { server: 'DESKTOP-9AV7L99', port: 1433, name: 'DESKTOP-9AV7L99:1433' },
  { server: 'DESKTOP-9AV7L99\\SQLEXPRESS', name: 'DESKTOP-9AV7L99\\SQLEXPRESS' },
  
  // Other common formats
  { server: '(local)', port: 1433, name: '(local):1433' },
  { server: '.', port: 1433, name: '.:1433' },
];

async function testConnection(config, name) {
  // SQL Server Authentication credentials
  const dbUser = process.env.DB_USER || 'sa';
  const dbPassword = process.env.DB_PASSWORD || 'sqladmin';
  
  const connectionConfig = {
    server: config.server,
    database: 'master', // Connect to master database for testing
    user: dbUser,
    password: dbPassword,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 5000,
    },
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  if (config.port) {
    connectionConfig.port = config.port;
  }

  try {
    console.log(`\nTesting: ${name}...`);
    const pool = await sql.connect(connectionConfig);
    
    // Try a simple query
    const result = await pool.request().query('SELECT @@VERSION as version, @@SERVERNAME as servername, DB_NAME() as dbname');
    
    console.log(`✅ SUCCESS! Connected to: ${name}`);
    console.log(`   Server Name: ${result.recordset[0].servername}`);
    console.log(`   SQL Version: ${result.recordset[0].version.split('\n')[0]}`);
    console.log(`   Database: ${result.recordset[0].dbname}`);
    
    await pool.close();
    return { success: true, config: connectionConfig, name };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runDiagnostics() {
  // SQL Server Authentication credentials (used in error messages)
  const dbUser = process.env.DB_USER || 'sa';
  const dbPassword = process.env.DB_PASSWORD || 'sqladmin';
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SQL Server Connection Diagnostics');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\nTesting various SQL Server connection configurations...');
  console.log('This may take a minute...\n');

  const results = [];
  
  for (const testConfig of testConfigs) {
    const result = await testConnection(testConfig, testConfig.name);
    results.push({ ...testConfig, ...result });
    
    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log(`\n✅ Found ${successful.length} working configuration(s):\n`);
    successful.forEach(r => {
      console.log(`   ${r.name}`);
      console.log(`   Use in .env: DB_SERVER=${r.server}`);
      if (r.port) {
        console.log(`   Use in .env: DB_PORT=${r.port}`);
      }
      if (r.server.includes('\\')) {
        const instance = r.server.split('\\')[1];
        console.log(`   Use in .env: DB_INSTANCE=${instance}`);
      }
      console.log('');
    });
  } else {
    console.log('\n❌ No successful connections found.\n');
    console.log('Common issues and solutions:');
    console.log('1. SQL Server service is not running');
    console.log('   → Open Services (services.msc) and check for "SQL Server" services');
    console.log('   → Start the appropriate SQL Server service');
    console.log('');
    console.log('2. TCP/IP protocol is disabled');
    console.log('   → Open SQL Server Configuration Manager');
    console.log('   → SQL Server Network Configuration → Protocols for [Instance]');
    console.log('   → Right-click TCP/IP → Enable');
    console.log('   → Restart SQL Server service');
    console.log('');
    console.log('3. SQL Server Browser is not running (for named instances)');
    console.log('   → In Services, start "SQL Server Browser"');
    console.log('   → Set it to Automatic startup');
    console.log('');
    console.log('4. Firewall blocking connections');
    console.log('   → Windows Firewall → Allow port 1433 (TCP)');
    console.log('   → Windows Firewall → Allow port 1434 (UDP) for SQL Browser');
    console.log('');
    console.log('5. Wrong instance name');
    console.log('   → Open SQL Server Management Studio (SSMS)');
    console.log('   → Check the server name you use to connect');
    console.log('   → Use that exact format in your .env file');
    console.log('');
    console.log('6. SQL Server Authentication not enabled');
    console.log('   → In SSMS: Right-click server → Properties → Security');
    console.log('   → Select "SQL Server and Windows Authentication mode"');
    console.log('   → Restart SQL Server service');
    console.log('');
    console.log('7. sa account disabled or wrong password');
    console.log('   → In SSMS: Security → Logins → sa');
    console.log('   → Right-click → Properties → General → Enable login');
    console.log('   → Status → Login: Enabled');
    console.log('   → General → Set password if needed');
    console.log('   → Using credentials: ' + dbUser + ' / ' + (dbPassword ? '***' : 'not set'));
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
  
  // Cleanup
  try {
    await sql.close();
  } catch (e) {
    // Ignore cleanup errors
  }

  process.exit(successful.length > 0 ? 0 : 1);
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

