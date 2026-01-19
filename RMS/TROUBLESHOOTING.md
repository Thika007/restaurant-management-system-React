# SQL Server Connection Troubleshooting Guide

## Quick Diagnostic

Run this command to test various SQL Server connection configurations:

```bash
npm run test-db
```

This will automatically test multiple connection methods and tell you which one works (if any).

## Common Issues and Solutions

### Issue 1: "Could not connect (sequence)" Error

This means SQL Server cannot be reached. Check the following:

#### ✅ Check 1: Is SQL Server Running?

1. Press `Win + R`, type `services.msc`, press Enter
2. Look for services named:
   - `SQL Server (MSSQLSERVER)` - Default instance
   - `SQL Server (SQLEXPRESS)` - Express instance
   - `SQL Server (MSSQL2019)`, etc. - Named instances
3. If any are **Stopped**, right-click → **Start**
4. If you see SQL Server services, note the exact instance name in parentheses

#### ✅ Check 2: Enable TCP/IP Protocol

1. Press `Win + R`, type `compmgmt.msc`, press Enter (or search "Computer Management")
2. Navigate to: **Services and Applications** → **SQL Server Configuration Manager** → **SQL Server Network Configuration**
3. Click on **Protocols for [Your Instance Name]**
   - If you see **MSSQLSERVER**, click that
   - If you see **SQLEXPRESS**, click that
4. Find **TCP/IP** in the list
5. If it's **Disabled**:
   - Right-click **TCP/IP** → **Enable**
   - Restart the SQL Server service (go back to services.msc)

#### ✅ Check 3: Start SQL Server Browser (For Named Instances)

If you're using SQL Server Express or a named instance:

1. In `services.msc`, find **SQL Server Browser**
2. Right-click → **Start**
3. Right-click → **Properties** → Set **Startup type** to **Automatic**

#### ✅ Check 4: Firewall Settings

1. Press `Win + R`, type `wf.msc`, press Enter (Windows Firewall)
2. Click **Inbound Rules** → **New Rule**
3. Rule Type: **Port** → Next
4. Protocol: **TCP**, Specific local ports: **1433** → Next
5. Action: **Allow the connection** → Next
6. Apply to all profiles → Next
7. Name: "SQL Server" → Finish

**Also allow UDP port 1434** (for SQL Browser):
- Same steps, but use **UDP** and port **1434**

#### ✅ Check 5: Find Your Exact Server Name

1. Open **SQL Server Management Studio (SSMS)**
2. When connecting, look at the **Server name** dropdown
3. Common formats you might see:
   - `DESKTOP-9AV7L99` - Computer name (default instance)
   - `DESKTOP-9AV7L99\SQLEXPRESS` - Computer name with Express instance
   - `localhost` - Local connection
   - `localhost\SQLEXPRESS` - Local with Express instance
   - `(local)` - Local connection alias
   - `.` - Local connection shorthand

**Use the EXACT format that works in SSMS in your `.env` file!**

### Issue 2: "Port for SQLEXPRESS not found" Error

This means SQL Server Browser service is not running or not accessible.

**Solution:**
1. Start **SQL Server Browser** service (see Check 3 above)
2. Allow UDP port 1434 in firewall (see Check 4 above)

### Issue 3: Windows Authentication Issues

If you can connect via SSMS but not via Node.js:

1. Make sure you're running Node.js/terminal **as the same Windows user** who can connect in SSMS
2. Check if your user has SQL Server login:
   - In SSMS: **Security** → **Logins**
   - Look for your Windows user or group (e.g., `DESKTOP-9AV7L99\YourUsername`)
   - If missing, create a new login for your Windows user

## Creating/Updating .env File

Based on what works in SSMS, create a `.env` file in the `server` directory:

### Example 1: Default Instance (Port 1433)
```env
DB_SERVER=localhost
DB_DATABASE=BakeryManagementDB
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

### Example 2: Named Instance (SQL Express)
```env
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=BakeryManagementDB
DB_INSTANCE=SQLEXPRESS
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

### Example 3: Computer Name (Default Instance)
```env
DB_SERVER=DESKTOP-9AV7L99
DB_DATABASE=BakeryManagementDB
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

### Example 4: Computer Name with Named Instance
```env
DB_SERVER=DESKTOP-9AV7L99\SQLEXPRESS
DB_DATABASE=BakeryManagementDB
DB_INSTANCE=SQLEXPRESS
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

## Testing Your Connection

After fixing the issues:

1. Run the diagnostic: `npm run test-db`
2. If it finds a working configuration, use those settings in your `.env`
3. Restart your server: `npm start`

## Still Having Issues?

1. **Check SQL Server Logs:**
   - In SSMS: Right-click server → **Reports** → **Standard Reports** → **Error Log**

2. **Verify SQL Server Installation:**
   - Check if SQL Server is actually installed
   - Run: `sqlcmd -L` to list local SQL Server instances

3. **Check Network Configuration:**
   - In SQL Server Configuration Manager → SQL Server Network Configuration
   - Right-click TCP/IP → Properties → IP Addresses tab
   - Make sure **IPAll** → **TCP Dynamic Ports** is set (or static port 1433)
   - Restart SQL Server service after changes

4. **Try SQL Server Authentication (temporary test):**
   - If Windows Auth isn't working, temporarily enable SQL Server Authentication
   - In SSMS: Server Properties → Security → SQL Server and Windows Authentication mode
   - Create a SQL login user and test with that (then switch back to Windows Auth)

## Quick Checklist

Before running the app, verify:

- [ ] SQL Server service is running
- [ ] TCP/IP protocol is enabled
- [ ] SQL Server Browser is running (if using named instance)
- [ ] Firewall allows ports 1433 (TCP) and 1434 (UDP)
- [ ] Can connect via SSMS with Windows Authentication
- [ ] `.env` file has correct server name format
- [ ] Running Node.js as the same Windows user who can access SQL Server

