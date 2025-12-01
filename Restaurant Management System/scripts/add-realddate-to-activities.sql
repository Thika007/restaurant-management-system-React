-- Add realDate column to RecentActivities table
-- This column stores the actual date of the stock operation (for past date entries)
-- while timestamp stores when the activity was recorded

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[RecentActivities]') 
    AND name = 'realDate'
)
BEGIN
    ALTER TABLE [dbo].[RecentActivities]
    ADD [realDate] DATE NULL;
    
    PRINT 'realDate column added to RecentActivities table';
END
ELSE
BEGIN
    PRINT 'realDate column already exists in RecentActivities table';
END

