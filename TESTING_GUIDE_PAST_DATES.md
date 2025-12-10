# Testing Guide: Past Date Support Verification

This document provides a comprehensive testing checklist to verify that past date inputs work correctly for all item types and subsystems.

## Prerequisites
- Application server running
- Database accessible
- Test branches and items available
- Access to all system modules (Add Stock, Add Return, Cash Management, Reports, Transfers)

## Test Scenarios

### 1. Normal Items - Past Date Support

#### Test 1.1: Add Stock for Past Date
1. Navigate to "Add Stock" page
2. Select a branch
3. Select a past date (e.g., 7 days ago)
4. Add normal items with quantities
5. **Verify**: Check database - stocks should be recorded with the selected past date
6. **Verify**: Activity log should show the past date as realDate

#### Test 1.2: Finish Batch for Past Date
1. Complete Test 1.1 first
2. Navigate to "Add Return" page
3. Select same branch and past date
4. Click "Finish Batch"
5. **Verify**: Batch is marked as finished for the past date
6. **Verify**: Sold quantities are calculated correctly
7. **Verify**: Cash calculation includes these sales

### 2. Grocery Items - Past Date Support

#### Test 2.1: Add Grocery Stock for Past Date
1. Navigate to "Add Stock" page
2. Select a branch
3. Select a past date (e.g., 5 days ago)
4. Add grocery items with quantities and expiry dates
5. **Verify**: Check database - GroceryStocks should have the past date in `date` and `addedDate` fields

#### Test 2.2: Update Remaining for Past Date (CRITICAL - This was the bug)
1. Complete Test 2.1 first
2. Navigate to "Add Return" page
3. Select same branch and past date
4. Update remaining quantities for grocery items
5. **Verify**: Check GrocerySales table - sales should be recorded with the **past date**, NOT today's date
6. **Verify**: Activity log should show the past date as realDate
7. **Verify**: Reports should show these sales under the past date

#### Test 2.3: Finish Grocery Batch for Past Date
1. Complete Test 2.2 first
2. Click "Finish Grocery Batch"
3. **Verify**: Batch is marked as finished for the past date
4. **Verify**: Cash calculation includes grocery sales for the past date

### 3. Machine Items - Past Date Support

#### Test 3.1: Start Machine Batch for Past Date
1. Navigate to "Add Return" page
2. Select "Machine" tab
3. Select a branch
4. Select a past date (e.g., 3 days ago)
5. Start a machine batch with start value
6. **Verify**: Check MachineBatches table - batch should have the past date
7. **Verify**: System should allow past dates (not block them)

#### Test 3.2: Finish Machine Batch for Past Date
1. Complete Test 3.1 first
2. Enter end value and finish the batch
3. **Verify**: Check MachineSales table - sales should be recorded with the **past date** from the batch
4. **Verify**: Activity log should show the past date

### 4. Cash Entry - Past Date Support

#### Test 4.1: Create Cash Entry for Past Date
1. Complete tests 1.2, 2.3, and 3.2 for the same past date and branch
2. Navigate to "Cash Management" page
3. Click "Add Cash Entry"
4. Select the same branch and past date
5. **Verify**: Expected cash should include:
   - Normal item sales (from finished batch)
   - Grocery sales (from finished batch)
   - Machine sales (from finished batch)
6. Enter actual cash and save
7. **Verify**: Cash entry is created with correct expected amount
8. **Verify**: Difference calculation is correct

### 5. Reports - Past Date Support

#### Test 5.1: Generate Report for Past Date Range
1. Navigate to "Reports" page
2. Select date range that includes the past dates used in previous tests
3. Generate report
4. **Verify**: All sales appear with correct dates:
   - Normal item sales show the past date
   - Grocery sales show the past date (not today)
   - Machine sales show the past date
5. **Verify**: Sales amounts match what was recorded
6. **Verify**: Date filtering works correctly (only shows sales within date range)

### 6. Internal Transfers - Past Date Support

#### Test 6.1: Transfer Items for Past Date
1. Complete Test 1.1 for Branch A with past date
2. Navigate to "Transfers" page
3. Create a transfer:
   - Date: Same past date
   - From: Branch A
   - To: Branch B
   - Items: Normal items that were added
4. **Verify**: Transfer is created successfully
5. **Verify**: Finished batch check works correctly (should allow if batch not finished)
6. **Verify**: Stock is deducted from sender and added to receiver for the past date

#### Test 6.2: Transfer with Finished Batch (Should Fail)
1. Complete Test 1.2 (finish batch) for Branch A with past date
2. Try to create a transfer for the same past date and branch
3. **Verify**: System should reject the transfer (batch is finished)

### 7. Regression Testing - Today's Date Still Works

#### Test 7.1: Verify Today's Date Functionality
1. Repeat Test 1.1, 2.1, 3.1 with **today's date**
2. **Verify**: All functionality works as before
3. **Verify**: Sales are recorded with today's date
4. **Verify**: Cash entries work correctly
5. **Verify**: Reports show today's sales correctly

## Database Verification Queries

Use these SQL queries to verify data is stored correctly:

```sql
-- Check Normal Items Stock
SELECT date, branch, itemCode, added, returned, transferred, sold 
FROM Stocks 
WHERE date = '2025-01-15'  -- Replace with your test past date
ORDER BY branch, itemCode;

-- Check Grocery Sales (CRITICAL - verify date is correct)
SELECT date, branch, itemCode, itemName, soldQty, totalCash, timestamp
FROM GrocerySales 
WHERE date = '2025-01-15'  -- Replace with your test past date
ORDER BY branch, itemCode;

-- Check Machine Sales
SELECT date, branch, machineCode, machineName, soldQty, totalCash
FROM MachineSales 
WHERE date = '2025-01-15'  -- Replace with your test past date
ORDER BY branch, machineCode;

-- Check Cash Entries
SELECT date, branch, expected, actual, difference
FROM CashEntries 
WHERE date = '2025-01-15'  -- Replace with your test past date
ORDER BY branch;

-- Check Finished Batches
SELECT date, branch, finishedAt
FROM FinishedBatches 
WHERE date = '2025-01-15'  -- Replace with your test past date
ORDER BY branch;
```

## Expected Results Summary

| Test | Expected Result | Status |
|------|----------------|--------|
| Normal Items - Add Stock | Date stored correctly | ✅ Should work |
| Normal Items - Finish Batch | Batch finished, sales calculated | ✅ Should work |
| Grocery Items - Add Stock | Date stored correctly | ✅ Should work |
| Grocery Items - Update Remaining | **Sales recorded with past date (not today)** | ✅ **FIXED** |
| Grocery Items - Finish Batch | Batch finished, sales included | ✅ Should work |
| Machine Items - Start Batch | Date stored correctly | ✅ Should work |
| Machine Items - Finish Batch | Sales recorded with past date | ✅ Should work |
| Cash Entry - Past Date | Expected cash includes all item types | ✅ Should work |
| Reports - Past Date Range | All sales show with correct dates | ✅ Should work |
| Transfers - Past Date | Transfers work correctly | ✅ Should work |
| Regression - Today's Date | All functionality still works | ✅ Should work |

## Critical Verification Points

1. **Grocery Sales Date**: The most critical test is Test 2.2 - verify that when updating remaining quantities for a past date, the GrocerySales table records the sale with the **past date**, not today's date.

2. **Cash Calculation**: Verify that cash entries for past dates correctly calculate expected cash from all three item types.

3. **Reports**: Verify that reports show sales under the correct dates, especially grocery sales.

4. **No Breaking Changes**: Verify that using today's date still works exactly as before.

## Notes

- All tests should be performed with dates that are clearly in the past (e.g., 7 days ago)
- Use the same branch and date across related tests for consistency
- Check both the UI and database to verify correctness
- Pay special attention to grocery sales dates as this was the bug that was fixed

