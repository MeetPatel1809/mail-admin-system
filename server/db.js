const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "93.127.167.226",
  user: "mailuser",
  password: "StrongPassworld123!",
  database: "mailserver",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// simple test connection
async function testConnection() {
  try {
    const connection = await db.getConnection();
    console.log("Connected to MariaDB");
    connection.release();
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}

testConnection();

module.exports = db;