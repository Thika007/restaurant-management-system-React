# Restaurant Management System (RMS)
### Version Update: April 9, 2026 (Hotfix)

> **This folder is the production distribution package.**  
> Copy this entire `RMS` folder to the client machine to deploy.

---

## What's New in This Update (2026-04-09 Hotfix)

### 🔴 Critical Bug Fixes
- **Normal Items Report Visibility Fixed** — Fixed an SQL table alias binding error that was preventing "Normal Items" from loading and displaying across all system Reports.
- **Historical Price Bug Fixed** — Previously, when an item's price was updated, ALL old sales reports were recalculated using the new price. This corrupted historical revenue data. Now, reports always show the price that was valid **at the time of the sale**.
- **Transfer System — Database Transaction Added** — Internal transfers are now atomic. If anything fails during a transfer, ALL changes are rolled back. Previously, a server crash mid-transfer could silently lose stock.
- **Grocery Transfer — Out-of-Stock Validation** — System now blocks transfers before deducting stock if sender does not have enough quantity.
- **Normal Item Transfer — Stock Check Added** — System now validates sender has available stock before processing.

### 🟠 UI & Performance Improvements
- **Extreme Frontend Buffering Delays Resolved** — Generating "Zero Added Items" and "Added Items" reports previously caused the system to freeze up completely due to iterating over 7,500+ sequentially blocked network requests in complex deep loops. This data is now pre-fetched in a batch format, reducing a ~3-minute buffering hang down to milliseconds.
- **Reports Data Table Pagination Added** — The table UI in the Reports section now slices output to show a max of **100 rows per page**. Next and Previous controls have been added to browse through loaded report data securely without freezing the application with excessive HTML node rendering.

### 🟠 Performance Improvements
- **Dashboard & Reports load 10× faster** — Previously, the system made 150+ individual database calls when loading the dashboard or generating reports (one per branch per date). Now, a single batch query fetches all data at once.
- **Server stability improved** — Removed debug code that was running a full table scan (`COUNT(*)`) on the 20,000+ row activity log on every 30-second poll. Server was crashing under load.

### 🟡 Other Fixes
- Grocery receiver batch `addedDate` now correctly stores the original batch date (not the transfer date)
- Grocery batch "finished" check now also applies to the **receiving** branch during transfers
- Transfer activity log message corrected: "received from X **at** Y" (was wrong: "from X to Y")
- Removed SQL injection risk in item code queries (now fully parameterized)
- Dashboard Expected Cash formula fixed — unsold grocery inventory value was being incorrectly added to expected cash
- `itemType` filter parameter was not being bound in stock queries (potential SQL error fixed)

---

## ⚠️ IMPORTANT: Database Migration Required

**Before running the updated server, you MUST run the following SQL script on the client's SQL Server database.**  
This only needs to be done **once**.

### Migration Script: `scripts/add-price-history.sql`

**Steps:**

1. Open **SQL Server Management Studio (SSMS)**
2. Connect to the client's SQL Server instance
3. Select database: **`BakeryManagementDB`**
4. Open the file: `RMS\scripts\add-price-history.sql`
5. Click **Execute** (or press `F5`)

**What the script does:**
```sql
-- Step 1: Creates the ItemPriceHistory table (only if it doesn't exist)
CREATE TABLE ItemPriceHistory (
    id            INT IDENTITY PRIMARY KEY,
    itemCode      NVARCHAR(50) NOT NULL,
    price         DECIMAL(18,2) NOT NULL,
    effectiveFrom DATE NOT NULL,   -- Price was valid FROM this date
    changedAt     DATETIME DEFAULT GETDATE()
)

-- Step 2: Seeds all current item prices with effectiveFrom = '2000-01-01'
-- This ensures all historical records map to a correct price
INSERT INTO ItemPriceHistory (itemCode, price, effectiveFrom)
SELECT code, price, '2000-01-01' FROM Items
WHERE code NOT IN (SELECT DISTINCT itemCode FROM ItemPriceHistory)
```

> **Safe to run multiple times** — The script uses `IF NOT EXISTS` checks. Running it again on a database that already has the table will safely skip creation and show a message.

---

## Folder Structure

```
RMS/
├── client/
│   └── dist/               ← Built React frontend (production bundle)
│       ├── index.html
│       └── assets/
├── server/                 ← Node.js backend (Express + MS SQL Server)
│   ├── controllers/
│   ├── routes/
│   ├── config/
│   ├── index.js
│   └── package.json
├── scripts/
│   ├── db.sql              ← Full database schema (for fresh install)
│   └── add-price-history.sql  ← ⚠️ Run this migration on existing databases
└── README.md               ← This file
```

---

## Deployment Instructions

### Step 1 — Database Migration (Existing Installation)

Run `scripts/add-price-history.sql` in SSMS as described above.

---

### Step 2 — Update Server Files

1. Stop the currently running server (close the terminal or task)
2. Replace the existing `server` folder on the client machine with the new `RMS/server` folder
3. The `server/.env` file contains database connection settings — **do not overwrite it**

```
⚠️  Do NOT replace the server/.env file.
    It contains the client's database credentials.
    Only copy the server code files, NOT the .env file.
```

If you are doing a fresh copy, create a new `.env` file in the server folder:
```env
DB_SERVER=YOUR_SQL_SERVER_NAME
DB_DATABASE=BakeryManagementDB
PORT=5000
NODE_ENV=production
JWT_SECRET=your-secret-key-here
```

---

### Step 3 — Install Server Dependencies

Only needed if this is the first time or `package.json` changed:

```bash
cd server
npm install --production
```

---

### Step 4 — Update Frontend Files

1. Replace the existing `client/dist` folder with `RMS/client/dist`
2. The web server (IIS or wherever the frontend is served from) should point to `client/dist`
3. No `npm install` needed for the frontend — it is already pre-built

---

### Step 5 — Start Server

```bash
cd server
npm start
```

Server runs on: `http://localhost:5000`  
Frontend served from: `client/dist/index.html`

---

## Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin` |
| Operator | `operator` | `operator` |

> **Security Note:** Change the default passwords immediately after first login in production.

---

## Troubleshooting

### Server won't start
- Check that SQL Server is running
- Verify `.env` file has correct `DB_SERVER` and `DB_DATABASE`
- Run `npm install` in the server folder

### Reports show wrong prices for old data
- The `add-price-history.sql` migration has not been run
- Run it in SSMS and restart the server

### Dashboard loads slowly
- This has been fixed in this update — if still slow, check network connection to SQL Server
- Ensure SQL Server indexes are up to date (`EXEC sp_updatestats`)

### "Transfer failed and was fully rolled back" error
- Sender does not have enough stock for the requested item
- Check the stock quantities before transferring

---

## Version History

| Date | Description |
|------|-------------|
| 2026-04-05 | Historical price fix, transfer transaction safety, performance batch API, server crash fix |
| *(previous)* | Initial production deployment |
