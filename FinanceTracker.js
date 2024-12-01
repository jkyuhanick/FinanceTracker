// Main
require('dotenv').config({ path: './db.env' });
var express = require("express");
const session = require('express-session');
var http = require("http");
var path = require("path");
var exphbs = require('express-handlebars');
const bcrypt = require('bcrypt');
const PdfPrinter = require('pdfmake');



// Construct express object
var app = express();

// Set up handlebars
var handlebars = exphbs.create({ defaultLayout: 'main' });
// Initialize the Handlebars engine
app.engine(
    'handlebars',
    exphbs.engine({
        helpers: {
            eq: (a, b) => a === b, 
        },
    })
);
app.set('view engine', 'handlebars');
app.use(express.static('views'));

// Session middleware setup
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Body parser for form data
app.use(express.urlencoded({ extended: true }));

// Get model functions
var support = require("./model/model.js");
const { db, addUser, findUserByEmail } = require('./model/userModel.js');

// Middleware to check if the user is logged in
function ensureLoggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// node-cron to enable recurring expenses
const cron = require('node-cron');

// Cron job to run once per day at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Cron job started to process recurring expenses');

    const fetchRecurringExpensesQuery = `
        SELECT * FROM recurring_expenses
        WHERE next_due_date <= CURDATE()
    `;

    db.query(fetchRecurringExpensesQuery, (err, recurringExpenses) => {
        if (err) {
            console.error('Error fetching recurring expenses:', err);
            return;
        }

        if (recurringExpenses.length === 0) {
            console.log('No recurring expenses due today.');
            return;
        }

        console.log(`Processing ${recurringExpenses.length} recurring expenses...`);

        recurringExpenses.forEach(expense => {
            const transactionQuery = `
                INSERT INTO transactions (user_id, category_id, amount, transaction_date, description, type)
                VALUES (?, ?, ?, ?, ?, 'expense')
            `;

            const transactionDate = new Date().toISOString().split('T')[0]; // today's date
            const { user_id, category_id, amount, description, frequency, id } = expense;

            // Calculate next due date
            const nextDueDate = new Date(expense.next_due_date);
            if (frequency === 'daily') {
                nextDueDate.setDate(nextDueDate.getDate() + 1);
            } else if (frequency === 'weekly') {
                nextDueDate.setDate(nextDueDate.getDate() + 7);
            } else if (frequency === 'monthly') {
                nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            } else if (frequency === 'yearly') {
                nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
            }

            // Insert the transaction
            db.query(transactionQuery, [user_id, category_id, amount, transactionDate, description], (err) => {
                if (err) {
                    console.error(`Error creating transaction for recurring expense ID ${id}:`, err);
                    return;
                }

                console.log(`Transaction added for recurring expense ID ${id}.`);

                // Update the next due date
                const updateNextDueDateQuery = `
                    UPDATE recurring_expenses
                    SET next_due_date = ?
                    WHERE id = ?
                `;

                db.query(updateNextDueDateQuery, [nextDueDate.toISOString().split('T')[0], id], (err) => {
                    if (err) {
                        console.error(`Error updating next due date for recurring expense ID ${id}:`, err);
                    } else {
                        console.log(`Next due date updated for recurring expense ID ${id}.`);
                    }
                });
            });
        });
    });
});



// Middleware to check login status
app.use((req, res, next) => {
    res.locals.isLoggedIn = !!req.session.userId; // Boolean: true if userId exists in session
    next();
});


// When "/" is submitted as URL, taken to home page
app.get("/", function (request, response) {
    response.render("home");
});

// "/home" taken to homepage
// Protect routes
app.get('/home', ensureLoggedIn, (req, res) => {
    res.render('home');
});

// Route: Register user
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Simple validation for missing fields
    if (!username || !email || !password) {
        return res.render('register', { error: 'All fields are required' });
    }

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
        const values = [username, email, hashedPassword];

        db.query(sql, values, (err, result) => {
            if (err) {
                // Handle specific database errors
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.render('register', { error: 'Username or email already exists' });
                }
                console.error(err);
                return res.render('register', { error: 'An unexpected error occurred. Please try again.' });
            }

            // On success, redirect to login
            res.redirect('/login');
        });
    } catch (err) {
        // Catch other errors (e.g., bcrypt errors)
        console.error(err);
        res.render('register', { error: 'An unexpected error occurred. Please try again.' });
    }
});

// Route: Display Login Page
app.get('/login', (req, res) => {
    res.render('login'); // Render the login.handlebars view
});

// Route: Display Registration Page
app.get('/register', (req, res) => {
    res.render('register'); // Render the register.handlebars view
});

// Route: Login user
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.render('login', { error: 'Email and password are required' });
    }

    findUserByEmail(email, (err, user) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: 'An unexpected error occurred. Please try again.' });
        }
        if (!user) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        // Compare password 
        bcrypt.compare(password, user.password_hash, (err, isMatch) => {
            if (err) {
                console.error(err);
                return res.render('login', { error: 'An unexpected error occurred. Please try again.' });
            }
            if (isMatch) {
                req.session.userId = user.id; // Set session user ID
                return res.redirect('/home'); // Redirect on successful login
            } else {
                return res.render('login', { error: 'Invalid email or password' });
            }
        });
    });
});


// Route: Logout user
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            return res.redirect('/home'); // Redirect to home if logout fails
        }
        res.redirect('/login'); // Redirect to the login after logging out
    });
});


// Transaction Summary Route
app.get('/summary', ensureLoggedIn, (req, res) => {
    const userId = req.session.userId; 
    const selectedCategory = req.query.category || null; // Selected category filter
    const startDate = req.query.startDate || null; // Start date filter
    const endDate = req.query.endDate || null; // End date filter

    // Query to get all categories for the dropdown
    const categoriesQuery = `
        SELECT DISTINCT c.name 
        FROM categories c
        JOIN transactions t ON t.category_id = c.id
        WHERE t.user_id = ?
    `;

    // Base query to get transactions, with optional filters for category and date range
    const transactionsBaseQuery = `
        SELECT t.id, c.name AS category, t.amount, t.transaction_date, t.description, t.type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
        ${selectedCategory ? 'AND c.name = ?' : ''}
        ${startDate ? 'AND t.transaction_date >= ?' : ''}
        ${endDate ? 'AND t.transaction_date <= ?' : ''}
        ORDER BY t.transaction_date DESC
    `;

    // Query to calculate totals for the filtered transactions
    const totalsBaseQuery = `
        SELECT 
            SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS totalIncome,
            SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS totalExpenses
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
        ${selectedCategory ? 'AND c.name = ?' : ''}
        ${startDate ? 'AND t.transaction_date >= ?' : ''}
        ${endDate ? 'AND t.transaction_date <= ?' : ''}
    `;

    db.query(categoriesQuery, [userId], (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).send('Server error');
        }

        const params = [userId];
        if (selectedCategory) params.push(selectedCategory);
        if (startDate) params.push(startDate);
        if (endDate) params.push(endDate);

        db.query(transactionsBaseQuery, params, (err, transactions) => {
            if (err) {
                console.error('Error fetching transactions:', err);
                return res.status(500).send('Server error');
            }

            db.query(totalsBaseQuery, params, (err, totals) => {
                if (err) {
                    console.error('Error calculating totals:', err);
                    return res.status(500).send('Server error');
                }

                const totalIncome = totals[0]?.totalIncome || 0;
                const totalExpenses = totals[0]?.totalExpenses || 0;
                const netTotal = totalIncome - totalExpenses;

                // Query to calculate overall balance and total spent
                const allTransactionsQuery = `
                    SELECT t.amount, t.type
                    FROM transactions t
                    WHERE t.user_id = ?
                `;
                db.query(allTransactionsQuery, [userId], (err, allTransactions) => {
                    if (err) {
                        console.error('Error fetching all transactions:', err);
                        return res.status(500).send('Server error');
                    }

                    let overallBalance = 0;
                    const overallTotalSpent = allTransactions.reduce((sum, transaction) => {
                        const amount = parseFloat(transaction.amount);
                        if (transaction.type === 'income') {
                            overallBalance += amount;
                        } else if (transaction.type === 'expense') {
                            overallBalance -= amount;
                            return sum + amount;
                        }
                        return sum;
                    }, 0);

                    req.session.balance = overallBalance; // Store balance in session

                    // Query to get the budget limit for the logged-in user
                    const budgetQuery = 'SELECT budget_limit FROM budgets WHERE user_id = ?';
                    db.query(budgetQuery, [userId], (err, budgetResults) => {
                        if (err) {
                            console.error('Error fetching budget:', err);
                            return res.status(500).send('Server error');
                        }

                        const budgetLimit = budgetResults[0]?.budget_limit || 0;
                        const remainingBudget = budgetLimit - overallTotalSpent;

                        // Render the summary page
                        res.render('summary', {
                            categories: categories.map(c => c.name),
                            selectedCategory,
                            startDate,
                            endDate,
                            transactions,
                            balance: overallBalance.toFixed(2), // Overall balance
                            budgetLimit: budgetLimit,
                            totalSpent: overallTotalSpent.toFixed(2), // Overall total spent
                            remainingBudget: remainingBudget.toFixed(2),
                            categoryIncome: totalIncome,
                            categoryExpenses: totalExpenses,
                            categoryNet: netTotal
                        });
                    });
                });
            });
        });
    });
});




// Route to display the budget form
app.get('/set-budget', ensureLoggedIn, (req, res) => {
    const userId = req.session.userId;
    const sql = 'SELECT budget_limit FROM budgets WHERE user_id = ?';

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching budget:', err);
            return res.status(500).send('Server error');
        }

        // If no budget set for the user, default to 0
        const budgetLimit = results[0] ? results[0].budget_limit : 0;
        res.render('set-budget', { budgetLimit });
    });
});

// Route to handle budget form submission
app.post('/set-budget', ensureLoggedIn, (req, res) => {
    const { budgetLimit } = req.body;
    const userId = req.session.userId;

    // Validation check for budget limit
    if (!budgetLimit || isNaN(budgetLimit) || budgetLimit < 0) {
        return res.render('set-budget', { 
            error: 'Invalid budget limit. Please enter a number greater than or equal to 0.',
            budgetLimit // Pass the entered value back to the form
        });
    }

    // Check if the user already has a budget entry
    const checkSql = 'SELECT * FROM budgets WHERE user_id = ?';
    db.query(checkSql, [userId], (err, results) => {
        if (err) {
            console.error('Error checking existing budget:', err);
            return res.status(500).send('Server error');
        }

        if (results.length > 0) {
            // Update the existing budget entry
            const updateSql = 'UPDATE budgets SET budget_limit = ? WHERE user_id = ?';
            db.query(updateSql, [parseFloat(budgetLimit), userId], (err) => {
                if (err) {
                    console.error('Error updating budget:', err);
                    return res.status(500).send('Server error');
                }
                return res.redirect('/summary'); // Redirect to the summary page after updating
            });
        } else {
            // Insert a new budget entry
            const insertSql = 'INSERT INTO budgets (user_id, budget_limit) VALUES (?, ?)';
            db.query(insertSql, [userId, parseFloat(budgetLimit)], (err) => {
                if (err) {
                    console.error('Error inserting budget:', err);
                    return res.status(500).send('Server error');
                }
                return res.redirect('/summary'); // Redirect to the summary page after inserting
            });
        }
    });
});

// Route to display the add recurring expense form
app.get('/add-recurring-expense', ensureLoggedIn, (req, res) => {
    const userId = req.session.userId;

    // Query to get all categories for the user to choose from
    const categoriesQuery = 'SELECT id, name FROM categories';
    db.query(categoriesQuery, [userId], (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).send('Server error');
        }

        // Render the form with the categories
        res.render('add-recurring-expense', {
            categories: categories,
            error: null // No error on initial load
        });
    });
});



app.post('/add-recurring-expense', ensureLoggedIn, (req, res) => {
    const userId = req.session.userId;
    const { amount, category, frequency, start_date, description } = req.body;

    const query = `
        INSERT INTO recurring_expenses (user_id, category_id, amount, frequency, start_date, next_due_date, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    // Calculate the first next_due_date
    const nextDueDate = new Date(start_date);
    if (frequency === 'daily') {
        nextDueDate.setDate(nextDueDate.getDate() + 1);
    } else if (frequency === 'weekly') {
        nextDueDate.setDate(nextDueDate.getDate() + 7);
    } else if (frequency === 'monthly') {
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    } else if (frequency === 'yearly') {
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
    }

    db.query(query, [userId, category, amount, frequency, start_date, nextDueDate.toISOString().split('T')[0], description], (err, result) => {
        if (err) {
            console.error('Error adding recurring expense:', err);
            return res.status(500).send('Server error');
        }

        res.redirect('/summary');
    });
});



// PDF Export Route
app.get('/export-pdf', ensureLoggedIn, (req, res) => {
    const userId = req.session.userId;

    // Query to get all transactions for the logged-in user
    const transactionsQuery = `
        SELECT t.id, c.name AS category, t.amount, t.transaction_date, t.description, t.type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
        ORDER BY t.transaction_date DESC
    `;

    // Query to get the budget for the logged-in user
    const budgetQuery = `
        SELECT budget_limit
        FROM budgets
        WHERE user_id = ?
    `;

    db.query(transactionsQuery, [userId], (err, transactions) => {
        if (err) {
            console.error('Error fetching transactions:', err);
            return res.status(500).send('Server error');
        }

        db.query(budgetQuery, [userId], (err, budgetResults) => {
            if (err) {
                console.error('Error fetching budget:', err);
                return res.status(500).send('Server error');
            }

            // Calculate budget-related details
            const budgetLimit = budgetResults[0] ? budgetResults[0].budget_limit : 0;
            const totalSpent = transactions
                .filter(t => t.type === 'expense')
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            const remainingBudget = budgetLimit - totalSpent;

            // Get the balance from session
            const balance = req.session.balance;

            const transactionRows = transactions.map(transaction => {
                // Format the transaction date
                const formattedDate = new Date(transaction.transaction_date).toLocaleDateString('en-US');
                
                return [
                    transaction.category,
                    (transaction.type === 'income' ? '+' : '-') + transaction.amount,
                    formattedDate, 
                    transaction.description
                ];
            });

            // Initialize the document definition for PDF generation
            const docDefinition = {
                content: [
                    { text: 'Transaction Summary', style: 'header' },
                    { text: `Current Balance: $${balance.toFixed(2)}`, style: 'subheader' },
                    { text: `Budget Limit: $${budgetLimit}`, style: 'subheader' },
                    { text: `Total Spent: $${totalSpent.toFixed(2)}`, style: 'subheader' },
                    { text: `Remaining Budget: $${remainingBudget.toFixed(2)}`, style: 'subheader' },
                    { text: '\n' },

                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', 'auto', 'auto', '*'],
                            body: [
                                [
                                    { text: 'Category', style: 'tableHeader' },
                                    { text: 'Amount', style: 'tableHeader' },
                                    { text: 'Transaction Date', style: 'tableHeader' },
                                    { text: 'Description', style: 'tableHeader' }
                                ],
                                ...transactionRows
                            ]
                        },
                        style: 'table'
                    },
                    { text: '\nEnd of Report', style: 'footer' }
                ],
                styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                    subheader: { fontSize: 14, margin: [0, 5, 0, 10] },
                    tableHeader: { bold: true, fontSize: 12, color: 'black' },
                    table: { margin: [0, 5, 0, 15] },
                    footer: { fontSize: 10, italics: true, margin: [0, 20, 0, 0] }
                }
            };

            // Create the PDF document
            const PdfPrinter = require('pdfmake');
            const printer = new PdfPrinter({
                Roboto: {
                    normal: 'node_modules/pdfmake/fonts/Roboto-Regular.ttf',
                    bold: 'node_modules/pdfmake/fonts/Roboto-Bold.ttf',
                    italics: 'node_modules/pdfmake/fonts/Roboto-Italic.ttf',
                    bolditalics: 'node_modules/pdfmake/fonts/Roboto-BoldItalic.ttf'
                }
            });

            const pdfDoc = printer.createPdfKitDocument(docDefinition);

            // Pipe the PDF document to the response
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=transaction_summary.pdf');
            pdfDoc.pipe(res);
            pdfDoc.end();
        });
    });
});



// Delete Transaction Route
app.post('/delete-transaction/:id', ensureLoggedIn, (req, res) => {
    const transactionId = req.params.id;

    // Query to delete the transaction by ID
    const sql = 'DELETE FROM transactions WHERE id = ? AND user_id = ?';

    db.query(sql, [transactionId, req.session.userId], (err, result) => {
        if (err) {
            console.error('Error deleting transaction:', err);
            return res.status(500).send('Server error');
        }

        // Redirect back to the summary page after deletion
        res.redirect('/summary');
    });
});


// Taken to report form
app.get("/reportform", function(request, response) {
    const sql = 'SELECT id, name FROM categories';
    db.query(sql, (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return response.status(500).send('Database error');
        }

        // Fetch previous data from support
        const previous = support.getPrevious(null);

        // Pass categories along with previous data
        response.render("reportecho", { 
            categories: categories,
            previous: previous 
        });
    });
});


app.get('/report', ensureLoggedIn, (req, res) => {
    const sql = 'SELECT id, name FROM categories';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).send('Server error');
        }

        res.render('reportecho', {
            categories: results,
            errors: {},
            previous: {}
        });
    });
});

app.post('/report', ensureLoggedIn, (req, res) => {
    const { info, amount, description, type, date } = req.body;
    const errors = {};

    if (!info || info === '0') errors.TypeMissing = true;
    if (!amount || isNaN(amount) || !/^\d+(\.\d{2})$/.test(amount)) errors.amountIllegal = true;

    if (Object.keys(errors).length > 0) {
        const sql = 'SELECT id, name FROM categories';
        db.query(sql, (err, categories) => {
            if (err) {
                console.error('Error fetching categories:', err);
                return res.status(500).send('Database error');
            }

            res.render('reportecho', {
                categories,
                errors,
                previous: { categoryId: info, amount, description, type, date }
            });
        });
        return;
    }

    const sql = `
        INSERT INTO transactions (user_id, category_id, amount, description, type, transaction_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [req.session.userId, info, parseFloat(amount), description, type, date];

    db.query(sql, values, (err) => {
        if (err) {
            console.error('Database Error:', err);
            return res.status(500).send('Failed to record transaction');
        }

        res.redirect('/summary');
    });
});


	
// If reach here, request not handled by any previous gets, so send error page
app.use(function(request, response) {
    response.render("404");
});

app.use(function(err, request, response, next) {
    console.log(err);
    response.writeHead(500, {'Content-Type': 'text/html'});
    response.end('<html><body><h2>Server error</h2></body></html>');
});

// Listen at port 3000
http.createServer(app).listen(3000);