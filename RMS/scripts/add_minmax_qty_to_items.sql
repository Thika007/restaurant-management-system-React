-- Migration script to add minQty and maxQty columns to Items table
-- These columns are used for Stock Tracking feature for Grocery Items

-- Check if columns exist before adding
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Items]') AND name = 'minQty')
BEGIN
    ALTER TABLE [dbo].[Items]
    ADD [minQty] DECIMAL(18, 3) NULL;
    PRINT 'Added minQty column to Items table';
END
ELSE
BEGIN
    PRINT 'minQty column already exists in Items table';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Items]') AND name = 'maxQty')
BEGIN
    ALTER TABLE [dbo].[Items]
    ADD [maxQty] DECIMAL(18, 3) NULL;
    PRINT 'Added maxQty column to Items table';
END
ELSE
BEGIN
    PRINT 'maxQty column already exists in Items table';
END

-- Verify columns were added
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Items' 
    AND COLUMN_NAME IN ('minQty', 'maxQty')
ORDER BY COLUMN_NAME;

