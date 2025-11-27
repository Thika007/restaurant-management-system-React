# Restaurant Management System - Deployment Guide

This package contains the production-ready application for deployment on a target computer.

## Folder Structure

```
target-computer/
├── dist/          # React production build
├── server/        # Node.js backend server
└── scripts/       # Database SQL scripts
    ├── db.sql                              # Main database schema
    ├── insert-admin-user.sql               # Admin user creation
    ├── create-recent-activities-table.sql  # Migration script
    └── RECENT_ACTIVITIES_SETUP.md          # Migration documentation
```

## Prerequisites

Before deploying, ensure the target computer has:

1. **Node.js** installed (version 14 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **SQL Server** installed and running
   - SQL Server 2012 or higher
   - SQL Server Management Studio (SSMS) for database setup

3. **Database** created
   - Database name: `BakeryManagementDB`
   - SQL Server Authentication enabled
   - sa account enabled (or create a dedicated user)

## Setup Instructions

### Step 1: Install Server Dependencies

1. Navigate to the `server` folder:
   ```bash
   cd server
   ```

2. Install Node.js packages:
   ```bash
   npm install
   ```

### Step 2: Configure Database Connection

1. Create a `.env` file in the `server` folder (copy from `.env.example`):
   ```bash
   copy .env.example .env
   ```

2. Edit the `.env` file with your database settings:
   ```env
   # Server Configuration
   PORT=5000

   # Database Configuration
   DB_SERVER=localhost          # Use IP address for remote database
   DB_PORT=1433
   DB_DATABASE=BakeryManagementDB
   DB_USER=sa
   DB_PASSWORD=your_password
   DB_INSTANCE=                  # Leave empty for default instance, or use instance name like SQLEXPRESS

   # JWT Secret (change this in production!)
   JWT_SECRET=your-secret-key-change-this-in-production
   ```

### Step 3: Configure SQL Server

#### Enable SQL Server Authentication:

1. Open SQL Server Management Studio (SSMS)
2. Connect to your SQL Server
3. Right-click server → **Properties** → **Security**
4. Select **"SQL Server and Windows Authentication mode"**
5. Click **OK** and **restart SQL Server service**

#### Enable sa Account:

1. In SSMS: **Security** → **Logins** → **sa**
2. Right-click → **Properties**
3. **General** tab: Set password
4. **Status** tab: **Login** → **Enabled**
5. Click **OK**

#### Enable TCP/IP Protocol (for remote access):

1. Open **SQL Server Configuration Manager**
2. **SQL Server Network Configuration** → **Protocols for [Your Instance]**
3. Right-click **TCP/IP** → **Enable**
4. Right-click **TCP/IP** → **Properties** → **IP Addresses** tab
5. Set **TCP Port** to `1433`
6. Set **IPAll** → **TCP Dynamic Ports** to empty
7. **Restart SQL Server service**

#### Configure Windows Firewall (for remote access):

1. Open **Windows Firewall**
2. Allow port `1433` (or your SQL Server port)
3. Allow SQL Server application through firewall

### Step 4: Create Database

1. Open SQL Server Management Studio
2. Connect using SQL Server Authentication (sa/your_password)
3. Right-click **Databases** → **New Database**
4. Name: `BakeryManagementDB`
5. Click **OK**

6. Run the database schema script:
   - Open `scripts/db.sql` from this package in SSMS
   - Select `BakeryManagementDB` database
   - Execute the script (F5)

7. (Optional) Create admin user:
   - Open `scripts/insert-admin-user.sql` in SSMS
   - Modify the username and password as needed
   - Execute the script to create an admin user

8. (Optional) Run additional migrations:
   - If needed, run `scripts/create-recent-activities-table.sql`
   - See `scripts/RECENT_ACTIVITIES_SETUP.md` for details

### Step 5: Start the Application

1. Navigate to the `server` folder:
   ```bash
   cd server
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. The application will be available at:
   - **URL**: `http://localhost:5000`
   - Open in your web browser

## Database Connection Scenarios

### Local Database (Default Instance)
```env
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=BakeryManagementDB
DB_USER=sa
DB_PASSWORD=sqladmin
```

### Local Database (Named Instance - SQL Express)
```env
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_DATABASE=BakeryManagementDB
DB_USER=sa
DB_PASSWORD=sqladmin
```

### Remote Database (IP Address)
```env
DB_SERVER=192.168.1.100
DB_PORT=1433
DB_DATABASE=BakeryManagementDB
DB_USER=sa
DB_PASSWORD=your_password
```

### Remote Database (Computer Name)
```env
DB_SERVER=COMPUTERNAME
DB_PORT=1433
DB_DATABASE=BakeryManagementDB
DB_USER=sa
DB_PASSWORD=your_password
```

## Troubleshooting

### Database Connection Issues

**Error: "Connection timeout"**
- Check if SQL Server service is running
- Verify TCP/IP is enabled in SQL Server Configuration Manager
- Check firewall settings
- Verify port number in .env file

**Error: "Login failed for user 'sa'"**
- Ensure SQL Server Authentication is enabled
- Verify sa account is enabled
- Check password is correct in .env file

**Error: "Cannot connect to server"**
- Verify server name/IP is correct
- Check if SQL Server is accessible from network
- For remote: ensure SQL Server Browser service is running
- Test connection: `telnet <server-ip> 1433`

**Error: "Named instance not found"**
- Ensure SQL Server Browser service is running
- Use format: `localhost\INSTANCENAME` or `COMPUTERNAME\INSTANCENAME`
- Set `DB_INSTANCE` in .env file

### Application Issues

**Port already in use:**
- Change `PORT` in `.env` file to a different port (e.g., 5001)
- Or stop the application using the port

**Module not found errors:**
- Run `npm install` in the server folder
- Ensure all dependencies are installed

## Production Recommendations

1. **Use Environment Variables**: Never hardcode credentials
2. **Use HTTPS**: Set up SSL certificates for production
3. **Use PM2**: For process management:
   ```bash
   npm install -g pm2
   pm2 start server/index.js --name restaurant-server
   pm2 save
   pm2 startup
   ```
4. **Database Security**: Use a dedicated SQL user with limited permissions instead of `sa`
5. **Backup Strategy**: Set up regular database backups
6. **Change JWT Secret**: Use a strong, random JWT secret in production

## Support

For additional help, refer to:
- `server/README_SETUP.md` - Original setup documentation
- `server/TROUBLESHOOTING.md` - Troubleshooting guide

## Default Login

After setting up the database, you may need to create an admin user. Use the included `scripts/insert-admin-user.sql` file:

1. Open `scripts/insert-admin-user.sql` in SQL Server Management Studio
2. Modify the username and password as needed
3. Execute the script to create an admin user
4. Use the created credentials to log in to the application

## Database Scripts Included

This package includes the following database scripts in the `scripts/` folder:

- **`db.sql`** - Main database schema (creates all tables, indexes, and constraints)
- **`insert-admin-user.sql`** - Creates an admin user for initial login
- **`create-recent-activities-table.sql`** - Migration script for activities table (if needed)
- **`RECENT_ACTIVITIES_SETUP.md`** - Documentation for activities migration

**Important**: Always run `db.sql` first to create the database structure, then run other scripts as needed.

## Recent Updates

This deployment package includes the following updates:

### ✅ Toast Notification System
- Replaced all `alert()` messages with styled pop-up notifications
- Toast notifications appear at the top-right corner
- Auto-dismiss with configurable duration
- Different styles for success, error, warning, and info messages

### ✅ Internal Transfer Date Picker
- Added date picker to Internal Transfer section
- Can select past dates for backdating transfers
- For Grocery Items: Shows historical stock available on selected date
- For Normal Items: Validates batch finished status for selected date
- Transfer date is preserved in all reports and activity logs

### ✅ Historical Stock Calculation
- New API endpoint for calculating grocery stock at any past date
- Accounts for all transactions (additions, sales, returns, transfers) up to the selected date
- Enables accurate stock viewing for past dates

### ✅ Enhanced Reports
- Internal Transfer Report now displays the actual transfer date
- Improved date formatting and sorting
- Better error handling

### ✅ Static File Serving
- Server now serves React build files automatically
- No need for separate web server configuration
- All routes handled by single Node.js server

