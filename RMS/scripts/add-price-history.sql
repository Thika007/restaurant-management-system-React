-- ============================================================
-- Migration: Add ItemPriceHistory table for historical price tracking
-- Run this script ONCE on the database
-- After running: price changes will no longer affect old reports
-- ============================================================

-- Step 1: Create ItemPriceHistory table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ItemPriceHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ItemPriceHistory] (
        [id]            INT IDENTITY(1,1) PRIMARY KEY,
        [itemCode]      NVARCHAR(50) NOT NULL,
        [price]         DECIMAL(18, 2) NOT NULL,
        [effectiveFrom] DATE NOT NULL,          -- Price was valid FROM this date
        [changedAt]     DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([itemCode]) REFERENCES [dbo].[Items]([code])
    );

    CREATE INDEX IX_ItemPriceHistory_ItemDate ON ItemPriceHistory(itemCode, effectiveFrom DESC);

    PRINT 'ItemPriceHistory table created.';
END
ELSE
BEGIN
    PRINT 'ItemPriceHistory table already exists. Skipping creation.';
END

-- Step 2: SEED existing item prices with effectiveFrom = '2000-01-01'
-- This ensures ALL historical records (Stocks, GrocerySales etc.) can find a price
-- Logic: if no history exists for an item yet, insert current price as baseline
INSERT INTO ItemPriceHistory (itemCode, price, effectiveFrom)
SELECT code, price, '2000-01-01'
FROM Items
WHERE code NOT IN (SELECT DISTINCT itemCode FROM ItemPriceHistory);

PRINT 'Seeded existing item prices with effectiveFrom = 2000-01-01.';
PRINT 'Migration complete. Future price changes will be tracked automatically.';
