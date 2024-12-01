// user model

const mysql = require('mysql2');

// Database connection setup (replace with your actual credentials)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  });
  
db.connect((err) => {
    if (err) {
      console.error('Database connection failed:', err.stack);
      return;
    }
    console.log('Connected to database.');
});
// Add a new user
function addUser(username, email, password, callback) {
    const sql = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
    db.execute(sql, [username, email, password], (err, results) => {
        callback(err, results);
    });
}

// Find a user by email
function findUserByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
        callback(err, results[0]); // Return the first user (if found)
    });
}

module.exports = {
    db,
    addUser,
    findUserByEmail,
};
