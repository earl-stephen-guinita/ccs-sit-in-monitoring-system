require('dotenv').config();

const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const db     = new Database('database.db');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('FATAL: JWT_SECRET is not set in .env');
  process.exit(1);
}

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
    sessions    INTEGER DEFAULT 30
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

db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sit_in_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number  TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    first_name TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    lab        TEXT NOT NULL,
    login_time TEXT DEFAULT (datetime('now', 'localtime')),
    logout_time TEXT,
    date       TEXT DEFAULT (date('now', 'localtime')),
    feedback   TEXT
  )
`);

try { db.exec(`ALTER TABLE sit_in_logs ADD COLUMN sessions_at_sitin INTEGER`); }
catch (e) {}

// create default admin if none exists
(async () => {
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');

  if (!existing) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'change_me';

    const hashed = await bcrypt.hash(defaultPassword, 10);

    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)')
      .run('admin', hashed);

    console.log(`Default admin created — username: admin, password: ${defaultPassword}`);
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

  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const sessions = itCourses.includes(course) ? 30 : 15;

  db.prepare(`
    INSERT INTO students
      (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(idNumber, lastName, firstName, middleName, course, level, email, address, hashed, sessions);

  res.json({ success: true });
});

// ── LOGIN ──
app.post('/api/login', async (req, res) => {
  const { idNumber, password } = req.body;

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(idNumber);
  if (admin) {
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.json({ success: false, message: 'Invalid credentials.' });
    const token = jwt.sign({ username: admin.username, isAdmin: true }, SECRET, { expiresIn: '8h' });
    return res.json({ success: true, token, isAdmin: true });
  }  

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

// ── STUDENT LOGOUT ──
app.post('/api/logout', authMiddleware, (req, res) => {
  res.json({ success: true });
});

// ── UPDATE PROFILE (protected) ──
app.post('/api/profile/update', authMiddleware, async (req, res) => {
  const { firstName, lastName, middleName, course, level, email, address, password, photo } = req.body;
  const idNumber = req.user.idNumber;
  const existing = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!existing) return res.json({ success: false, message: 'User not found.' });

  // recalculate sessions if course changed
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  let sessions = existing.sessions;
  if (course !== existing.course) {
    sessions = itCourses.includes(course) ? 30 : 15;
  } 

  if (password && password.trim() !== '') {
    const hashed = await bcrypt.hash(password, 10);
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?,
      course=?, year_level=?, email=?, address=?, password=?, photo=?, sessions=? WHERE id_number=?`)
      .run(lastName, firstName, middleName, course, level, email, address, hashed, photo || null, sessions, idNumber);
  } else {
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?,
      course=?, year_level=?, email=?, address=?, photo=?, sessions=? WHERE id_number=?`)
      .run(lastName, firstName, middleName, course, level, email, address, photo || null, sessions, idNumber);
  }
  res.json({ success: true, sessions });
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
  const { idNumber, lastName, firstName, purpose, lab } = req.body; // removed 'sessions' from destructure

  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });

  if (student.sessions <= 0) {
    return res.json({ success: false, message: 'Student has no remaining sessions.' });
  }

  db.prepare(`INSERT INTO sit_in_logs (id_number, last_name, first_name, purpose, lab, sessions_at_sitin)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(idNumber, lastName, firstName, purpose, lab, student.sessions); // use student.sessions directly

  res.json({ success: true, remainingSessions: student.sessions });
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

// ── GET ANNOUNCEMENTS ──
app.get('/api/announcements', authMiddleware, (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json({ success: true, announcements });
});

// ── ADMIN: ADD ANNOUNCEMENT ──
app.post('/api/admin/announcements', adminMiddleware, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.json({ success: false, message: 'Title and content are required.' });
  db.prepare('INSERT INTO announcements (title, content) VALUES (?, ?)').run(title, content);
  res.json({ success: true });
});

// ── ADMIN: EDIT ANNOUNCEMENT ──
app.put('/api/admin/announcements/:id', adminMiddleware, (req, res) => {
  const { title, content } = req.body;
  const { id } = req.params;
  db.prepare(`UPDATE announcements SET title=?, content=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(title, content, id);
  res.json({ success: true });
});

// ── ADMIN: DELETE ANNOUNCEMENT ──
app.delete('/api/admin/announcements/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── ADMIN: GET ANNOUNCEMENTS ──
app.get('/api/announcements-admin', adminMiddleware, (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json({ success: true, announcements });
});

// ── STUDENT: GET OWN HISTORY ──
app.get('/api/history', authMiddleware, (req, res) => {
  const logs = db.prepare('SELECT * FROM sit_in_logs WHERE id_number = ? ORDER BY date DESC, login_time DESC').all(req.user.idNumber);
  res.json({ success: true, logs });
});

// ── STUDENT: SUBMIT FEEDBACK ──
app.post('/api/history/feedback/:id', authMiddleware, (req, res) => {
  const { feedback } = req.body;
  const { id } = req.params;
  db.prepare('UPDATE sit_in_logs SET feedback = ? WHERE id = ? AND id_number = ?')
    .run(feedback, id, req.user.idNumber);
  res.json({ success: true });
});

// ── ADMIN: GET ALL HISTORY ──
app.get('/api/admin/history', adminMiddleware, (req, res) => {
  const logs = db.prepare('SELECT * FROM sit_in_logs ORDER BY date DESC, login_time DESC').all();
  res.json({ success: true, logs });
});

// ── ADMIN: GET SIT-IN LOGS WITH SESSION ──
app.get('/api/admin/sitin', adminMiddleware, (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM sit_in_logs
    ORDER BY date DESC, login_time DESC
  `).all();
  res.json({ success: true, logs });
});

// ── ADMIN: LOGOUT STUDENT FROM SIT-IN ──
app.post('/api/admin/sitin-logout/:id', adminMiddleware, (req, res) => {
  const logEntry = db.prepare('SELECT * FROM sit_in_logs WHERE id = ?').get(req.params.id);
  if (!logEntry) return res.json({ success: false, message: 'Log entry not found.' });
  if (logEntry.logout_time) return res.json({ success: false, message: 'Student already logged out.' });

  // deduct session
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(logEntry.id_number);
  if (student) {
    const newSessions = Math.max(0, student.sessions - 1);
    db.prepare('UPDATE students SET sessions = ? WHERE id_number = ?')
      .run(newSessions, logEntry.id_number);
  }

  // set logout time
  db.prepare(`UPDATE sit_in_logs SET logout_time = datetime('now','localtime') WHERE id = ?`)
    .run(req.params.id);

  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));