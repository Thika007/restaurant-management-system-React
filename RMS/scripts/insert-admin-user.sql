-- Insert Admin User into Users Table
-- This script creates the admin user with full system access
-- Password: admin (hashed with bcrypt)

USE BakeryManagementDB;
GO

-- Check if admin user already exists and delete it (optional - remove IF EXISTS if you want to keep existing)
IF EXISTS (SELECT * FROM Users WHERE username = 'admin')
BEGIN
    DELETE FROM Users WHERE username = 'admin';
END
GO

-- Insert Admin User
-- Password: 'admin' (bcrypt hash)
-- Run: node server/scripts/generate-password-hash.js admin  to generate a new hash if needed
INSERT INTO Users (
    id,
    username,
    fullName,
    password,
    role,
    status,
    accesses,
    assignedBranches,
    expireTrackingBranches,
    createdAt,
    updatedAt
)
VALUES (
    'admin',  -- id
    'admin',  -- username
    'Administrator',  -- fullName
    '$2a$10$vAQctYfh.kb3DkEomkKRX.6iIW11uHNFYXIk4yUts9WDJmjt/izKK',  -- password (admin - bcrypt hash)
    'admin',  -- role
    'Active',  -- status
    '["Dashboard", "Master Creation", "Add Item Stock", "Internal Transfer", "Add Return Stock", "Cash Management", "Reports", "Branch Management", "User Management"]',  -- accesses (JSON array)
    '[]',  -- assignedBranches (JSON array - empty means all branches)
    '[]',  -- expireTrackingBranches (JSON array - empty means all branches)
    GETDATE(),  -- createdAt
    GETDATE()   -- updatedAt
);
GO

-- Verify the insert
SELECT 
    id,
    username,
    fullName,
    role,
    status,
    accesses,
    assignedBranches,
    createdAt
FROM Users
WHERE username = 'admin';
GO

PRINT 'Admin user created successfully!';
PRINT 'Username: admin';
PRINT 'Password: admin';
PRINT '';
PRINT 'Note: For production, change the admin password immediately after first login.';

