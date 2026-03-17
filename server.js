const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const db     = new Database('database.db');
const SECRET = 'ccs-sitin-secret-key-2026';

// ── create tables ──
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
    password    TEXT NOT NULL,
    sessions    INTEGER DEFAULT 28
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sit_in_records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number  TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    first_name TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    lab        TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

// add sessions column if upgrading from older database
try { db.exec(`ALTER TABLE students ADD COLUMN sessions INTEGER DEFAULT 30`); }
catch (e) {}

// add photo column if upgrading from older database
try { db.exec(`ALTER TABLE students ADD COLUMN photo TEXT`); }
catch (e) {}

// create default admin if none exists
(async () => {
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashed);
    console.log('Default admin created — username: admin, password: admin123');
  }
})();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── JWT middleware for students ──
function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.json({ success: false, message: 'Not authenticated.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

// ── JWT middleware for admins ──
function adminMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.json({ success: false, message: 'Not authenticated.' });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (!decoded.isAdmin) return res.json({ success: false, message: 'Access denied.' });
    req.admin = decoded;
    next();
  } catch (e) {
    return res.json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

// ── REGISTER ──
app.post('/api/register', async (req, res) => {
  const { idNumber, firstName, lastName, middleName,
          course, level, email, address, password } = req.body;

  const existing = db.prepare('SELECT id FROM students WHERE id_number = ?').get(idNumber);
  if (existing) return res.json({ success: false, message: 'ID number already registered.' });

  const hashed = await bcrypt.hash(password, 10);
  db.prepare(`
    INSERT INTO students
      (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 28)
  `).run(idNumber, lastName, firstName, middleName, course, level, email, address, hashed);

  res.json({ success: true });
});

// ── STUDENT LOGIN ──
app.post('/api/login', async (req, res) => {
  const { idNumber, password } = req.body;
  const user = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!user) return res.json({ success: false, message: 'Invalid ID number or password.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ success: false, message: 'Invalid ID number or password.' });

  const token = jwt.sign({ idNumber: user.id_number }, SECRET, { expiresIn: '8h' });
  res.json({
    success: true, token,
    user: {
      idNumber: user.id_number, firstName: user.first_name,
      lastName: user.last_name, middleName: user.middle_name,
      course: user.course, level: user.year_level,
      email: user.email, address: user.address, sessions: user.sessions,
      photo: user.photo || null,
    }
  });
});

// ── GET PROFILE (protected) ──
app.get('/api/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.user.idNumber);
  if (!user) return res.json({ success: false, message: 'User not found.' });
  res.json({
    success: true,
    user: {
      idNumber: user.id_number, firstName: user.first_name,
      lastName: user.last_name, middleName: user.middle_name,
      course: user.course, level: user.year_level,
      email: user.email, address: user.address, sessions: user.sessions,
      photo: user.photo || null,
    }
  });
});

// ── UPDATE PROFILE (protected) ──
app.post('/api/profile/update', authMiddleware, async (req, res) => {
  const { firstName, lastName, middleName, course, level, email, address, password, photo } = req.body;
  const idNumber = req.user.idNumber;
  const existing = db.prepare('SELECT id FROM students WHERE id_number = ?').get(idNumber);
  if (!existing) return res.json({ success: false, message: 'User not found.' });

  if (password && password.trim() !== '') {
    const hashed = await bcrypt.hash(password, 10);
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?,
      course=?, year_level=?, email=?, address=?, password=?, photo=? WHERE id_number=?`)
      .run(lastName, firstName, middleName, course, level, email, address, hashed, photo || null, idNumber);
  } else {
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?,
      course=?, year_level=?, email=?, address=?, photo=? WHERE id_number=?`)
      .run(lastName, firstName, middleName, course, level, email, address, photo || null, idNumber);
  }
  res.json({ success: true });
});

// ── ADMIN LOGIN ──
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return res.json({ success: false, message: 'Invalid credentials.' });

  const match = await bcrypt.compare(password, admin.password);
  if (!match) return res.json({ success: false, message: 'Invalid credentials.' });

  const token = jwt.sign({ username: admin.username, isAdmin: true }, SECRET, { expiresIn: '8h' });
  res.json({ success: true, token });
});

// ── ADMIN: SEARCH STUDENT ──
app.get('/api/admin/search-student', adminMiddleware, (req, res) => {
  const { idNumber } = req.query;
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });

  res.json({
    success: true,
    student: {
      idNumber: student.id_number,
      firstName: student.first_name,
      lastName: student.last_name,
      sessions: student.sessions,
    }
  });
});

// ── ADMIN: CONFIRM SIT-IN ──
app.post('/api/admin/sit-in', adminMiddleware, (req, res) => {
  const { idNumber, lastName, firstName, purpose, lab, sessions } = req.body;

  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });

  if (student.sessions <= 0) {
    return res.json({ success: false, message: 'Student has no remaining sessions.' });
  }

  // use admin-provided sessions value, otherwise deduct 1
  const newSessions = (sessions !== undefined && sessions !== '')
    ? parseInt(sessions)
    : student.sessions - 1;

  db.prepare('UPDATE students SET sessions = ?, last_name = ?, first_name = ? WHERE id_number = ?')
    .run(newSessions, lastName, firstName, idNumber);

  db.prepare(`INSERT INTO sit_in_records (id_number, last_name, first_name, purpose, lab)
    VALUES (?, ?, ?, ?, ?)`)
    .run(idNumber, lastName, firstName, purpose, lab);

  res.json({ success: true, remainingSessions: newSessions });
});

// ── ADMIN: CHANGE PASSWORD ──
app.post('/api/admin/change-password', adminMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.admin.username);
  if (!admin) return res.json({ success: false, message: 'Admin not found.' });

  const match = await bcrypt.compare(currentPassword, admin.password);
  if (!match) return res.json({ success: false, message: 'Current password is incorrect.' });

  if (!newPassword || newPassword.trim().length < 6) {
    return res.json({ success: false, message: 'New password must be at least 6 characters.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE admins SET password = ? WHERE username = ?').run(hashed, req.admin.username);
  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));