// user model

const mysql = require('mysql2');

// Database connection setup (replace with your actual credentials)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'pw',
    database: 'expense_tracker'
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
