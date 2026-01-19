# Deployment Guide - Restaurant Management System

This guide will help you copy the built project to another computer.

## What to Copy

Copy the following folders and files to your deployment location:

### 1. Build Folder
- **Location**: `client/dist/`
- **Contents**: All production-ready frontend files
- **Copy entire folder**: `dist/`

### 2. Backend Folder
- **Location**: `server/`
- **Contents**: All Node.js backend code
- **Copy entire folder**: `server/`

### 3. Scripts Folder
- **Location**: `scripts/`
- **Contents**: SQL scripts and database setup files
- **Copy entire folder**: `scripts/`

### 4. README Files
- **Files to copy**:
  - `README.md` (main project README)
  - `server/README_SETUP.md` (server setup instructions)
  - `ADMIN_SETUP.md` (if exists)
  - `TROUBLESHOOTING.md` (if exists in server folder)

## Deployment Structure

Your deployment folder should look like this:

```
Restaurant Management System/
├── dist/                    # Frontend build files (from client/dist/)
├── server/                  # Backend Node.js application
├── scripts/                 # Database scripts
└── README.md                # Main documentation
```

## Step-by-Step Instructions

### Step 1: Build the Project (Already Done ✅)

The React frontend has been built successfully. The build output is in `client/dist/`.

### Step 2: Create Deployment Folder

On the target computer, create a folder for your deployment (e.g., `Restaurant Management System`).

### Step 3: Copy Folders

Copy the following to your deployment folder:

#### Option A: Manual Copy (Windows)
```powershell
# On source computer, navigate to project root
# Copy these folders:
- client/dist/ → deployment_folder/dist/
- server/ → deployment_folder/server/
- scripts/ → deployment_folder/scripts/
- README.md → deployment_folder/README.md
- server/README_SETUP.md → deployment_folder/README.md (optional, for reference)
```

#### Option B: Using Command Line (PowerShell)
```powershell
# Navigate to project root directory
cd "E:\Report-System\React\Restaurant Management System2"

# Create deployment folder (adjust path as needed)
$deployPath = "E:\Deployment\Restaurant Management System"
New-Item -ItemType Directory -Path $deployPath -Force

# Copy build folder
Copy-Item -Path "client\dist" -Destination "$deployPath\dist" -Recurse -Force

# Copy server folder
Copy-Item -Path "server" -Destination "$deployPath\server" -Recurse -Force

# Copy scripts folder
Copy-Item -Path "scripts" -Destination "$deployPath\scripts" -Recurse -Force

# Copy README files
Copy-Item -Path "README.md" -Destination "$deployPath\README.md" -Force
if (Test-Path "server\README_SETUP.md") {
    Copy-Item -Path "server\README_SETUP.md" -Destination "$deployPath\README_SETUP.md" -Force
}
if (Test-Path "ADMIN_SETUP.md") {
    Copy-Item -Path "ADMIN_SETUP.md" -Destination "$deployPath\ADMIN_SETUP.md" -Force
}

Write-Host "Deployment files copied successfully to: $deployPath"
```

### Step 4: Setup on Target Computer

#### A. Backend Setup

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Install version 16 or higher

2. **Install Backend Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Configure Database**
   - Create `.env` file in `server/` folder:
   ```env
   DB_SERVER=YOUR_SQL_SERVER_NAME
   DB_DATABASE=BakeryManagementDB
   PORT=5000
   NODE_ENV=production
   JWT_SECRET=your-secret-key-change-in-production
   ```
   - Replace `YOUR_SQL_SERVER_NAME` with your SQL Server instance name
   - Replace `JWT_SECRET` with a secure random string

4. **Setup Database**
   - Install SQL Server Management Studio
   - Create database: `BakeryManagementDB`
   - Run SQL scripts from `scripts/` folder:
     - `db.sql` (main database schema)
     - `insert-admin-user.sql` (create admin user)
     - Other migration scripts as needed

5. **Start Backend Server**
   ```bash
   cd server
   npm start
   ```

#### B. Frontend Setup

The `dist/` folder contains the built frontend. You have two options:

**Option 1: Serve with Backend (Recommended)**

The backend can serve the frontend files. Make sure your backend serves the `dist` folder at the root route.

**Option 2: Use a Web Server**

You can use any static file server to serve the `dist/` folder:
- **Node.js**: `npx serve dist`
- **Python**: `python -m http.server 3000` (in dist folder)
- **IIS**: Configure IIS to serve the dist folder

#### C. Configure API URL

1. Check `dist/index.html` - the API URL should be configured
2. If needed, rebuild with correct API URL:
   ```bash
   # In client folder, create/update .env:
   VITE_API_URL=http://localhost:5000/api
   # Then rebuild:
   npm run build
   ```

## Files NOT to Copy

Do **NOT** copy these (to keep deployment size small):

- `node_modules/` folders (install dependencies on target machine)
- `client/src/` (source files - already built in `dist/`)
- `client/node_modules/`
- Development files like `.git/`, `.vscode/`, etc.
- `client/package.json` and `client/package-lock.json` (unless needed for rebuilding)

## Post-Deployment Checklist

- [ ] Node.js installed on target computer
- [ ] Backend dependencies installed (`npm install` in server folder)
- [ ] SQL Server installed and running
- [ ] Database created and scripts run
- [ ] `.env` file configured in server folder
- [ ] Backend server starts successfully
- [ ] Frontend files accessible (either through backend or separate web server)
- [ ] Can access application in browser
- [ ] Can login with admin credentials

## Troubleshooting

### Backend won't start
- Check Node.js version: `node --version` (should be 16+)
- Check database connection in `.env`
- Check if SQL Server is running
- Check if port 5000 is available

### Frontend can't connect to backend
- Verify backend is running on correct port
- Check API URL configuration
- Check CORS settings in backend
- Check firewall settings

### Database connection errors
- Verify SQL Server instance name
- Check Windows Authentication or SQL Authentication
- Verify database exists
- Check user permissions

## Production Recommendations

1. **Environment Variables**: Use secure environment variables for production
2. **HTTPS**: Configure SSL/TLS certificates for production
3. **Process Manager**: Use PM2 or similar for running Node.js in production
4. **Database Backup**: Set up regular database backups
5. **Logging**: Configure proper logging for production
6. **Security**: Review and update JWT secret and other security settings

## Additional Notes

- The `dist` folder contains optimized production build (minified, bundled)
- Source files are not needed on production server
- Always test the deployment on a staging environment first
- Keep deployment folder structure simple and organized

---

For more details, refer to:
- `README.md` - Main project documentation
- `server/README_SETUP.md` - Backend setup details
- `server/TROUBLESHOOTING.md` - Troubleshooting guide

