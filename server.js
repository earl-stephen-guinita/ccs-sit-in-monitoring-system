const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const path     = require('path');

const app = express();
const db  = new Database('database.db');

// create students table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number   TEXT UNIQUE NOT NULL,
    last_name   TEXT NOT NULL,
    first_name  TEXT NOT NULL,
    middle_name TEXT,
    course      TEXT NOT NULL,
    year_level  TEXT NOT NULL,
    email       TEXT NOT NULL,
    address     TEXT NOT NULL,
    password    TEXT NOT NULL
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── REGISTER ──
app.post('/api/register', async (req, res) => {
  const { idNumber, firstName, lastName, middleName,
          course, level, email, address, password } = req.body;

  const existing = db.prepare(
    'SELECT id FROM students WHERE id_number = ?'
  ).get(idNumber);

  if (existing) {
    return res.json({ success: false, message: 'ID number already registered.' });
  }

  const hashed = await bcrypt.hash(password, 10);
  db.prepare(`
    INSERT INTO students
      (id_number, last_name, first_name, middle_name, course, year_level, email, address, password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(idNumber, lastName, firstName, middleName, course, level, email, address, hashed);

  res.json({ success: true });
});

// ── LOGIN ──
app.post('/api/login', async (req, res) => {
  const { idNumber, password } = req.body;

  const user = db.prepare(
    'SELECT * FROM students WHERE id_number = ?'
  ).get(idNumber);

  if (!user) {
    return res.json({ success: false, message: 'Invalid ID number or password.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.json({ success: false, message: 'Invalid ID number or password.' });
  }

  res.json({ success: true, firstName: user.first_name, lastName: user.last_name });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});