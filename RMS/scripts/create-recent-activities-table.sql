-- RecentActivities table for storing system activity logs
-- This table centralizes all recent activity data to fix time bugs and improve performance
-- MS SQL Server

-- Create RecentActivities table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RecentActivities]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[RecentActivities] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [type] NVARCHAR(50) NOT NULL, -- Activity type: 'stock_added', 'return', 'grocery_stock_added', 'grocery_sale', 'grocery_return', 'cash_entry', 'cash_discrepancy', 'machine_sale', 'transfer', 'batch_finished_sale'
        [message] NVARCHAR(MAX) NOT NULL, -- Human-readable activity description
        [branch] NVARCHAR(200) NOT NULL, -- Branch where activity occurred
        [timestamp] DATETIME NOT NULL DEFAULT GETDATE(), -- Exact timestamp of when activity occurred (fixes time bugs)
        [metadata] NVARCHAR(MAX) NULL, -- JSON object for additional data (itemCode, quantity, etc.)
        [createdAt] DATETIME DEFAULT GETDATE(), -- When this record was created
        FOREIGN KEY ([branch]) REFERENCES [dbo].[Branches]([name])
    );
    
    -- Create indexes for better query performance
    CREATE INDEX IX_RecentActivities_Timestamp ON [dbo].[RecentActivities]([timestamp] DESC);
    CREATE INDEX IX_RecentActivities_Branch ON [dbo].[RecentActivities]([branch]);
    CREATE INDEX IX_RecentActivities_Type ON [dbo].[RecentActivities]([type]);
    CREATE INDEX IX_RecentActivities_BranchTimestamp ON [dbo].[RecentActivities]([branch], [timestamp] DESC);
END
ELSE
BEGIN
    PRINT 'RecentActivities table already exists';
END


