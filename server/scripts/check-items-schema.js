const { getConnection } = require('../config/db');

async function main() {
  try {
    const pool = await getConnection();
    const r = await pool.request().query(
      "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Items' ORDER BY ORDINAL_POSITION"
    );
    console.log(JSON.stringify(r.recordset, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
