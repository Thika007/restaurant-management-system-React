/**
 * Migration Script: Add Expire Time Duration columns to Items table
 * 
 * This script adds two new columns to the Items table:
 * - expireTimeDuration (INT): Number of days/months/years until item expires
 * - expireTimeUnit (NVARCHAR(10)): Unit of time - 'days', 'months', or 'years'
 * 
 * Run this script once: node scripts/add-expire-duration-columns.js
 */

const { getConnection, sql } = require('../config/db');

async function migrate() {
  try {
    console.log('Connecting to database...');
    const pool = await getConnection();
    console.log('Connected successfully.');

    // Check if columns already exist
    const checkResult = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Items' 
        AND COLUMN_NAME IN ('expireTimeDuration', 'expireTimeUnit')
    `);

    const existingColumns = checkResult.recordset.map(r => r.COLUMN_NAME);

    if (!existingColumns.includes('expireTimeDuration')) {
      console.log('Adding expireTimeDuration column...');
      await pool.request().query(`
        ALTER TABLE Items ADD expireTimeDuration INT NULL
      `);
      console.log('✅ expireTimeDuration column added.');
    } else {
      console.log('ℹ️ expireTimeDuration column already exists, skipping.');
    }

    if (!existingColumns.includes('expireTimeUnit')) {
      console.log('Adding expireTimeUnit column...');
      await pool.request().query(`
        ALTER TABLE Items ADD expireTimeUnit NVARCHAR(10) NULL
      `);
      console.log('✅ expireTimeUnit column added.');
    } else {
      console.log('ℹ️ expireTimeUnit column already exists, skipping.');
    }

    // Verify columns were added
    const verifyResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Items' 
        AND COLUMN_NAME IN ('expireTimeDuration', 'expireTimeUnit')
    `);
    
    console.log('\n📋 Verification:');
    verifyResult.recordset.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (nullable: ${col.IS_NULLABLE})`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
