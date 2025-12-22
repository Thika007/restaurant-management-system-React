# Database Setup with SQL Server Authentication

## Server Configuration
- **Server Name:** localhost (or your SQL Server instance)
- **Authentication:** SQL Server Authentication
- **Username:** sa
- **Password:** sqladmin

## Prerequisites

1. **Enable SQL Server Authentication:**
   - Open SQL Server Management Studio (SSMS)
   - Connect to your server
   - Right-click server → Properties → Security
   - Select "SQL Server and Windows Authentication mode"
   - Click OK and **restart SQL Server service**

2. **Enable and Configure sa Account:**
   - In SSMS: Security → Logins → sa
   - Right-click → Properties
   - General tab: Set password to `sqladmin` (or your preferred password)
   - Status tab: Login → Enabled
   - Click OK

## Setup Steps

1. **Create Database in SQL Server Management Studio:**
   - Open SSMS
   - Connect to server using SQL Server Authentication (sa/sqladmin)
   - Right-click on "Databases" → New Database
   - Name: `BakeryManagementDB`
   - Click OK

2. **Run the Schema Script:**
   - Open `scripts/db.sql` in SSMS
   - Make sure `BakeryManagementDB` is selected in the database dropdown
   - Or uncomment the CREATE DATABASE and USE statements at the top of the script
   - Execute the script (F5)

3. **Verify Connection:**
   - The Node.js server will connect using SQL Server Authentication (sa/sqladmin)

## Environment Variables (.env)

Create a `.env` file in the `server` directory with:
```env
DB_SERVER=localhost
DB_DATABASE=BakeryManagementDB
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=sqladmin
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

**For Named Instances (e.g., SQL Express):**
```env
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=BakeryManagementDB
DB_INSTANCE=SQLEXPRESS
DB_USER=sa
DB_PASSWORD=sqladmin
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

**Important:** 
- Default credentials are `sa` / `sqladmin` (set in code)
- You can override via `.env` file with `DB_USER` and `DB_PASSWORD`
- Make sure SQL Server Authentication mode is enabled

## Troubleshooting

If you get connection errors, run the diagnostic script:
```bash
npm run test-db
```

Common issues:

1. **Check SQL Server is running:**
   - Open Services (`services.msc`)
   - Look for "SQL Server" services and ensure they're running

2. **SQL Server Authentication not enabled:**
   - In SSMS: Right-click server → Properties → Security
   - Select "SQL Server and Windows Authentication mode"
   - Restart SQL Server service

3. **sa account disabled:**
   - In SSMS: Security → Logins → sa
   - Right-click → Properties → Status → Login: Enabled
   - General tab: Verify password is set correctly

4. **TCP/IP protocol disabled:**
   - Open SQL Server Configuration Manager
   - SQL Server Network Configuration → Protocols for [Instance]
   - Enable TCP/IP protocol
   - Restart SQL Server service

5. **Check Firewall:**
   - Ensure port 1433 (TCP) is allowed
   - For named instances, allow port 1434 (UDP) for SQL Browser

6. **Test Connection in SSMS:**
   - Try connecting to your server using SQL Server Authentication (sa/sqladmin)
   - If that works, the Node.js app should work too
   - Use the exact server name format that works in SSMS

For more detailed troubleshooting, see `TROUBLESHOOTING.md`


