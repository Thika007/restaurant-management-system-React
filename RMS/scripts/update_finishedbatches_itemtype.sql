-- SQL Query to Add itemType to FinishedBatches Table
-- Run this query directly in SQL Server Management Studio or your SQL client

-- Step 1: Add itemType column
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'FinishedBatches' AND COLUMN_NAME = 'itemType'
)
BEGIN
    ALTER TABLE FinishedBatches
    ADD itemType NVARCHAR(50) NULL;
END

-- Step 2: Update existing records to 'Normal Item' (using dynamic SQL to avoid parse errors)
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'FinishedBatches' AND COLUMN_NAME = 'itemType'
)
BEGIN
    EXEC('UPDATE FinishedBatches SET itemType = ''Normal Item'' WHERE itemType IS NULL');
END

-- Step 3: Make itemType NOT NULL
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'FinishedBatches' 
    AND COLUMN_NAME = 'itemType' 
    AND IS_NULLABLE = 'YES'
)
BEGIN
    ALTER TABLE FinishedBatches
    ALTER COLUMN itemType NVARCHAR(50) NOT NULL;
END

-- Step 4: Drop existing primary key constraint
DECLARE @PKConstraintName NVARCHAR(200);
SELECT @PKConstraintName = name
FROM sys.key_constraints
WHERE type = 'PK' 
AND parent_object_id = OBJECT_ID('FinishedBatches');

IF @PKConstraintName IS NOT NULL
BEGIN
    DECLARE @DropPKSQL NVARCHAR(MAX) = 'ALTER TABLE FinishedBatches DROP CONSTRAINT [' + @PKConstraintName + ']';
    EXEC sp_executesql @DropPKSQL;
END

-- Step 5: Add new composite primary key with itemType
ALTER TABLE FinishedBatches
ADD CONSTRAINT PK_FinishedBatches PRIMARY KEY ([date], [branch], [itemType]);

-- Step 6: Add default constraint for itemType
IF NOT EXISTS (
    SELECT * FROM sys.default_constraints 
    WHERE parent_object_id = OBJECT_ID('FinishedBatches') 
    AND name = 'DF_FinishedBatches_itemType'
)
BEGIN
    ALTER TABLE FinishedBatches
    ADD CONSTRAINT DF_FinishedBatches_itemType DEFAULT 'Normal Item' FOR itemType;
END

-- Verification: Check the result
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'FinishedBatches'
ORDER BY ORDINAL_POSITION;

-- Check Primary Key columns (compatible with all SQL Server versions)
SELECT 
    tc.CONSTRAINT_NAME,
    kc.COLUMN_NAME,
    kc.ORDINAL_POSITION
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kc 
    ON tc.CONSTRAINT_NAME = kc.CONSTRAINT_NAME
WHERE tc.TABLE_NAME = 'FinishedBatches' 
    AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
ORDER BY tc.CONSTRAINT_NAME, kc.ORDINAL_POSITION;

PRINT 'FinishedBatches table updated successfully!';
PRINT 'Primary Key is now: (date, branch, itemType)';
PRINT 'You can now finish Normal Item and Grocery Item batches independently.';

