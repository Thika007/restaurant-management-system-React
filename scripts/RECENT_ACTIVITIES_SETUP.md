# Recent Activities Table Setup

This document explains how to set up the Recent Activities feature for the Restaurant Management System.

## Overview

The Recent Activities feature provides a centralized way to track and display all system activities with accurate timestamps, fixing time-related bugs that were present when activities were aggregated from multiple sources.

## Database Setup

1. **Run the SQL script** to create the `RecentActivities` table:
   ```sql
   -- Execute this file in your SQL Server Management Studio or via command line
   scripts/create-recent-activities-table.sql
   ```

   Or manually run:
   ```sql
   USE BakeryManagementDB;
   GO
   -- Copy and paste the contents of scripts/create-recent-activities-table.sql
   ```

## How It Works

### Database Table Structure

The `RecentActivities` table stores:
- `id`: Auto-incrementing primary key
- `type`: Activity type (e.g., 'stock_added', 'return', 'grocery_sale', etc.)
- `message`: Human-readable activity description
- `branch`: Branch where activity occurred
- `timestamp`: Exact DATETIME when activity occurred (fixes time bugs)
- `metadata`: Optional JSON for additional data
- `createdAt`: When the record was created

### Backend API

- **GET** `/api/activities` - Fetch recent activities
  - Query parameters:
    - `branch` (optional): Filter by branch
    - `dateFrom` (optional): Start date (YYYY-MM-DD)
    - `dateTo` (optional): End date (YYYY-MM-DD)
    - `limit` (optional): Maximum number of records (default: 100)

### Frontend Integration

The Dashboard component now fetches activities directly from the database instead of aggregating from multiple sources, which:
- ✅ Fixes time bugs by using accurate DATETIME timestamps
- ✅ Improves performance (single query instead of multiple)
- ✅ Simplifies code maintenance
- ✅ Ensures consistent activity ordering

## Next Steps: Populating Activities

Currently, the table is created but empty. To populate it with activities, you need to update the following controllers to log activities when actions occur:

1. **stocksController.js** - Log activities when:
   - Stock is added (`stock_added`)
   - Stock is returned (`return`)
   - Batch is finished (`batch_finished_sale`)

2. **groceryController.js** - Log activities when:
   - Grocery stock is added (`grocery_stock_added`)
   - Grocery sale is recorded (`grocery_sale`)
   - Grocery return is recorded (`grocery_return`)

3. **cashController.js** - Log activities when:
   - Cash entry is created (`cash_entry` or `cash_discrepancy`)

4. **machinesController.js** - Log activities when:
   - Machine batch is completed (`machine_sale`)

5. **transfersController.js** - Log activities when:
   - Transfer is processed (`transfer`)

### Example: Adding Activity Logging

To add activity logging to a controller, import and use the `createActivity` helper:

```javascript
const { createActivity } = require('../controllers/activitiesController');

// Example: When stock is added
await createActivity(
  'stock_added',
  `${quantity} ${itemName} added to ${branch}`,
  branch,
  new Date(), // Use actual timestamp when action occurred
  { itemCode, quantity } // Optional metadata
);
```

## Testing

1. After running the SQL script, verify the table exists:
   ```sql
   SELECT * FROM RecentActivities;
   ```

2. The Dashboard should now show an empty recent activities table (until activities are logged).

3. Once you update controllers to log activities, test by:
   - Adding stock
   - Recording returns
   - Creating cash entries
   - etc.

## Benefits

1. **Fixed Time Bugs**: Activities now use accurate DATETIME timestamps from the database
2. **Better Performance**: Single query instead of multiple API calls
3. **Cleaner Code**: Dashboard code simplified from ~400 lines to ~40 lines
4. **Scalability**: Easy to add new activity types
5. **Consistency**: All activities stored in one place with consistent format


