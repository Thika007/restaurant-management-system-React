# Admin User Setup Guide

## Overview

The authentication system has been updated to:
- ✅ Remove hardcoded admin/operator credentials
- ✅ Use database-only authentication
- ✅ Implement bcrypt password hashing
- ✅ Support both hashed and plain text passwords (for backward compatibility during migration)

## Changes Made

### Backend Changes

1. **`server/controllers/authController.js`**
   - Removed hardcoded admin/operator fallback credentials
   - All users must exist in the database
   - Password verification uses bcrypt (supports both hashed and plain text for backward compatibility)
   - Only active users can login

2. **`server/controllers/usersController.js`**
   - Passwords are now hashed with bcrypt when creating new users
   - Passwords are hashed when updating user passwords
   - All new passwords stored in database are hashed

3. **`server/scripts/generate-password-hash.js`**
   - Utility script to generate bcrypt hashes for passwords
   - Usage: `node server/scripts/generate-password-hash.js <password>`

### Frontend Changes

1. **`client/src/pages/Login.jsx`**
   - Removed default username/password values
   - Removed demo credentials text
   - Clean login form requiring user input

## Setting Up Admin User

### Step 1: Run the SQL Script

Execute the SQL script to insert the admin user:

```sql
-- Run this in SQL Server Management Studio
-- File: scripts/insert-admin-user.sql

USE BakeryManagementDB;
GO

-- Insert Admin User
INSERT INTO Users (
    id, username, fullName, password, role, status, accesses, 
    assignedBranches, expireTrackingBranches, createdAt, updatedAt
)
VALUES (
    'admin',
    'admin',
    'Administrator',
    '$2a$10$vAQctYfh.kb3DkEomkKRX.6iIW11uHNFYXIk4yUts9WDJmjt/izKK',  -- password: admin (bcrypt hash)
    'admin',
    'Active',
    '["Dashboard", "Master Creation", "Add Item Stock", "Internal Transfer", "Add Return Stock", "Cash Management", "Reports", "Branch Management", "User Management"]',
    '[]',
    '[]',
    GETDATE(),
    GETDATE()
);
GO
```

**Or simply run the script file:**
```bash
# In SQL Server Management Studio, open and execute:
scripts/insert-admin-user.sql
```

### Step 2: Verify Admin User

```sql
SELECT id, username, fullName, role, status, createdAt
FROM Users
WHERE username = 'admin';
```

### Step 3: Login

- **Username:** `admin`
- **Password:** `admin`

⚠️ **Important:** Change the admin password immediately after first login for security!

## Generating New Password Hashes

If you need to generate a new bcrypt hash for a password:

```bash
cd server
node scripts/generate-password-hash.js <your-password>
```

Example:
```bash
node scripts/generate-password-hash.js mypassword123
```

Output:
```
Password: mypassword123
Bcrypt Hash: $2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Use this hash in SQL INSERT or UPDATE statements.

## Creating Additional Users

### Via API (Recommended)

Use the user management API to create users - passwords will be automatically hashed:

```javascript
POST /api/users
{
  "username": "newuser",
  "fullName": "New User",
  "password": "password123",
  "accesses": ["Dashboard"],
  "assignedBranches": []
}
```

### Via SQL (Manual)

If creating users directly in SQL, you must hash the password first:

```sql
-- 1. Generate hash (run in Node.js)
-- node server/scripts/generate-password-hash.js mypassword

-- 2. Use the hash in SQL
INSERT INTO Users (id, username, fullName, password, role, status, ...)
VALUES ('U001', 'newuser', 'New User', '$2a$10$...hash...', 'custom', 'Active', ...);
```

## Password Verification

The system supports both:
- **Hashed passwords** (bcrypt) - for new users and updated passwords
- **Plain text passwords** - for backward compatibility with existing users

During login:
1. System checks if password starts with `$2a$` or `$2b$` (bcrypt hash indicator)
2. If hashed: Uses `bcrypt.compare()` to verify
3. If plain text: Uses direct comparison (legacy support)

## Migration Notes

If you have existing users with plain text passwords:

1. They will continue to work (backward compatible)
2. When you update their password via the API, it will be hashed automatically
3. To migrate all existing passwords, you can create a migration script

## Troubleshooting

### Can't login with admin credentials?

1. Verify admin user exists in database:
   ```sql
   SELECT * FROM Users WHERE username = 'admin';
   ```

2. Check user status is 'Active':
   ```sql
   SELECT username, status FROM Users WHERE username = 'admin';
   ```

3. Verify password hash is correct (re-generate if needed):
   ```bash
   node server/scripts/generate-password-hash.js admin
   ```

4. Update password if hash is wrong:
   ```sql
   UPDATE Users 
   SET password = '$2a$10$vAQctYfh.kb3DkEomkKRX.6iIW11uHNFYXIk4yUts9WDJmjt/izKK'
   WHERE username = 'admin';
   ```

### Password verification failing?

- Ensure bcrypt hash format is correct (starts with `$2a$10$` or `$2b$10$`)
- Check for extra whitespace in SQL insert statements
- Verify the hash was generated correctly using the utility script

## Security Best Practices

1. ✅ Always use bcrypt hashing for passwords
2. ✅ Change default admin password after first login
3. ✅ Use strong passwords (minimum 8 characters, mix of letters/numbers)
4. ✅ Regularly update user passwords
5. ✅ Never store plain text passwords in code or documentation

## Files Modified

- `server/controllers/authController.js` - Database-only authentication with bcrypt
- `server/controllers/usersController.js` - Bcrypt password hashing for create/update
- `client/src/pages/Login.jsx` - Removed demo credentials
- `server/scripts/generate-password-hash.js` - Password hash generator utility
- `scripts/insert-admin-user.sql` - Admin user SQL insert script

