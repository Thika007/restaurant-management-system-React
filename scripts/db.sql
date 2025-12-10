-- Bakery Management System Database Schema
-- MS SQL Server
-- Server: DESKTOP-9AV7L99
-- Authentication: Windows Authentication

-- Create database (uncomment if needed)
-- CREATE DATABASE BakeryManagementDB;
-- USE BakeryManagementDB;

-- Users table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Users] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [username] NVARCHAR(100) NOT NULL UNIQUE,
        [fullName] NVARCHAR(200) NOT NULL,
        [password] NVARCHAR(255) NOT NULL,
        [role] NVARCHAR(50) DEFAULT 'custom',
        [status] NVARCHAR(20) DEFAULT 'Active',
        [accesses] NVARCHAR(MAX), -- JSON array
        [assignedBranches] NVARCHAR(MAX), -- JSON array
        [expireTrackingBranches] NVARCHAR(MAX), -- JSON array
        [lastLogin] DATETIME NULL,
        [createdAt] DATETIME DEFAULT GETDATE(),
        [updatedAt] DATETIME DEFAULT GETDATE()
    );
END

-- Branches table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Branches]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Branches] (
        [name] NVARCHAR(200) PRIMARY KEY,
        [address] NVARCHAR(500) NOT NULL,
        [manager] NVARCHAR(200) NOT NULL,
        [phone] NVARCHAR(50) NULL,
        [email] NVARCHAR(200) NULL,
        [createdAt] DATETIME DEFAULT GETDATE(),
        [updatedAt] DATETIME DEFAULT GETDATE()
    );
END

-- Items table
-- Stores all item types: 'Normal Item', 'Grocery Item', 'Machine'
-- Normal Items: Use Stocks table for inventory tracking
-- Grocery Items: Use GroceryStocks table for inventory tracking  
-- Machines: Use MachineBatches and MachineSales for tracking
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Items]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Items] (
        [code] NVARCHAR(50) PRIMARY KEY,
        [itemType] NVARCHAR(50) NOT NULL, -- 'Normal Item', 'Grocery Item', 'Machine'
        [name] NVARCHAR(200) NOT NULL,
        [category] NVARCHAR(100) NOT NULL,
        [subcategory] NVARCHAR(100) NULL,
        [price] DECIMAL(18, 2) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [soldByWeight] BIT DEFAULT 0,     -- For Grocery Items: whether sold by weight (e.g., kg)
        [notifyExpiry] BIT DEFAULT 0,     -- For Grocery Items: whether to notify on expiry
        [createdAt] DATETIME DEFAULT GETDATE(),
        [updatedAt] DATETIME DEFAULT GETDATE(),
        CHECK ([itemType] IN ('Normal Item', 'Grocery Item', 'Machine'))
    );
END

-- Stocks table (for Normal Items ONLY)
-- This table stores stock transactions for Normal Items only (not Grocery Items or Machines)
-- Each record represents stock for a specific item on a specific date at a specific branch
-- Key structure matches: date_branch_itemCode (enforced by UNIQUE constraint)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Stocks]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Stocks] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [date] DATE NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [itemCode] NVARCHAR(50) NOT NULL,
        [added] INT DEFAULT 0,           -- Quantity added for this item on this date
        [returned] INT DEFAULT 0,        -- Quantity returned/wasted
        [transferred] INT DEFAULT 0,     -- Quantity transferred out to other branches
        [sold] INT DEFAULT 0,            -- Calculated: added - returned - transferred
        [createdAt] DATETIME DEFAULT GETDATE(),
        [updatedAt] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([itemCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name]),
        UNIQUE ([date], [branch], [itemCode])
        -- Note: Application logic should ensure only Normal Items (itemType='Normal Item') are stored here
        -- Grocery Items use GroceryStocks table, Machines use MachineBatches table
    );
END

-- GroceryStocks table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroceryStocks]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GroceryStocks] (
        [id] NVARCHAR(100) PRIMARY KEY,
        [batchId] NVARCHAR(100) NULL,
        [itemCode] NVARCHAR(50) NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [quantity] DECIMAL(18, 3) NOT NULL,
        [remaining] DECIMAL(18, 3) NOT NULL,
        [expiryDate] DATE NULL,
        [date] DATE NULL,
        [addedDate] DATE NULL,
        [addedBy] NVARCHAR(50) NULL,
        [createdAt] DATETIME DEFAULT GETDATE(),
        [updatedAt] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([itemCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- GrocerySales table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GrocerySales]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GrocerySales] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [itemCode] NVARCHAR(50) NOT NULL,
        [itemName] NVARCHAR(200) NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [date] DATE NOT NULL,
        [soldQty] DECIMAL(18, 3) NOT NULL,
        [totalCash] DECIMAL(18, 2) NOT NULL,
        [timestamp] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([itemCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- GroceryReturns table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroceryReturns]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GroceryReturns] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [itemCode] NVARCHAR(50) NOT NULL,
        [itemName] NVARCHAR(200) NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [date] DATE NOT NULL,
        [returnedQty] DECIMAL(18, 3) NOT NULL,
        [reason] NVARCHAR(100) DEFAULT 'waste',
        [timestamp] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([itemCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- MachineBatches table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MachineBatches]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[MachineBatches] (
        [id] NVARCHAR(100) PRIMARY KEY,
        [machineCode] NVARCHAR(50) NOT NULL,
        [startValue] INT NOT NULL,
        [endValue] INT NULL,
        [date] DATE NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [status] NVARCHAR(20) DEFAULT 'active',
        [startTime] DATETIME DEFAULT GETDATE(),
        [endTime] DATETIME NULL,
        FOREIGN KEY ([machineCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- MachineSales table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MachineSales]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[MachineSales] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [machineCode] NVARCHAR(50) NOT NULL,
        [machineName] NVARCHAR(200) NOT NULL,
        [date] DATE NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [startValue] INT NOT NULL,
        [endValue] INT NOT NULL,
        [soldQty] INT NOT NULL,
        [unitPrice] DECIMAL(18, 2) NOT NULL,
        [totalCash] DECIMAL(18, 2) NOT NULL,
        [timestamp] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([machineCode]) REFERENCES [dbo].[Items]([code]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- CashEntries table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashEntries]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CashEntries] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [date] DATE NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [expected] DECIMAL(18, 2) NOT NULL,
        [actual] DECIMAL(18, 2) NOT NULL,
        [actualCash] DECIMAL(18, 2) NULL,
        [cardPayment] DECIMAL(18, 2) NULL,
        [difference] DECIMAL(18, 2) NOT NULL,
        [status] NVARCHAR(20) DEFAULT 'Match',
        [operatorId] NVARCHAR(50) NULL,
        [operatorName] NVARCHAR(200) NULL,
        [notes] NVARCHAR(MAX) NULL,
        [timestamp] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name]),
        UNIQUE ([date], [branch])
    );
END

-- TransferHistory table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TransferHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TransferHistory] (
        [id] NVARCHAR(100) PRIMARY KEY,
        [date] DATE NOT NULL,
        [senderBranch] NVARCHAR(200) NOT NULL,
        [receiverBranch] NVARCHAR(200) NOT NULL,
        [itemType] NVARCHAR(50) NOT NULL,
        [items] NVARCHAR(MAX) NOT NULL, -- JSON array
        [processedBy] NVARCHAR(50) NULL,
        [processedAt] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([senderBranch]) REFERENCES [dbo].[Branches]([name]),
        FOREIGN KEY ([receiverBranch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- FinishedBatches table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinishedBatches]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinishedBatches] (
        [date] DATE NOT NULL,
        [branch] NVARCHAR(200) NOT NULL,
        [itemType] NVARCHAR(50) NOT NULL DEFAULT 'Normal Item',
        [finishedAt] DATETIME DEFAULT GETDATE(),
        PRIMARY KEY ([date], [branch], [itemType]),
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name]),
        CHECK ([itemType] IN ('Normal Item', 'Grocery Item'))
    );
END

-- Notifications table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Notifications]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Notifications] (
        [id] NVARCHAR(100) PRIMARY KEY,
        [type] NVARCHAR(50) NOT NULL,
        [message] NVARCHAR(MAX) NOT NULL,
        [branch] NVARCHAR(200) NULL,
        [itemCode] NVARCHAR(50) NULL,
        [itemName] NVARCHAR(200) NULL,
        [batchId] NVARCHAR(100) NULL,
        [quantity] DECIMAL(18, 3) NULL,
        [expiryDate] DATE NULL,
        [dateAdded] DATE NULL,
        [createdAt] DATETIME DEFAULT GETDATE(),
        [readBy] NVARCHAR(MAX) NULL, -- JSON array
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
END

-- Create indexes for better performance
-- Normal Items stock lookup by date and branch
CREATE INDEX IX_Stocks_DateBranch ON [dbo].[Stocks]([date], [branch]);
-- Normal Items stock lookup by item code
CREATE INDEX IX_Stocks_ItemCode ON [dbo].[Stocks]([itemCode]);
-- Grocery Items indexes
CREATE INDEX IX_GroceryStocks_BranchItem ON [dbo].[GroceryStocks]([branch], [itemCode]);
CREATE INDEX IX_GrocerySales_DateBranch ON [dbo].[GrocerySales]([date], [branch]);
-- Cash entries lookup
CREATE INDEX IX_CashEntries_DateBranch ON [dbo].[CashEntries]([date], [branch]);
-- Transfer history lookup
CREATE INDEX IX_TransferHistory_Date ON [dbo].[TransferHistory]([date]);

-- Add summary comment for table organization
/*
DATABASE STRUCTURE SUMMARY:
==========================

1. Items Table: Master table for all item types
   - Normal Items: Tracked in Stocks table
   - Grocery Items: Tracked in GroceryStocks, GrocerySales, GroceryReturns tables
   - Machines: Tracked in MachineBatches and MachineSales tables

2. Normal Items Tracking:
   - Items (itemType = 'Normal Item') → Stock data in Stocks table
   - Stocks table: One record per item per date per branch
   - Key: (date, branch, itemCode) - unique combination
   - Fields: added, returned, transferred, sold (calculated)

3. Grocery Items Tracking:
   - Items (itemType = 'Grocery Item') → Stock in GroceryStocks table (batch-based)
   - Sales in GrocerySales table
   - Returns in GroceryReturns table

4. Machines Tracking:
   - Items (itemType = 'Machine') → Batches in MachineBatches table
   - Sales in MachineSales table

5. Supporting Tables:
   - FinishedBatches: Tracks when normal item batches are completed
   - CashEntries: Cash reconciliation records
   - TransferHistory: Internal transfers between branches
   - Notifications: System notifications
*/

