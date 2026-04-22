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

try { db.exec(`ALTER TABLE students ADD COLUMN sessions INTEGER DEFAULT 30`); } catch (e) {}
try { db.exec(`ALTER TABLE students ADD COLUMN photo TEXT`); } catch (e) {}

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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number   TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    first_name  TEXT NOT NULL,
    purpose     TEXT NOT NULL,
    lab         TEXT NOT NULL,
    login_time  TEXT DEFAULT (datetime('now', 'localtime')),
    logout_time TEXT,
    date        TEXT DEFAULT (date('now', 'localtime')),
    feedback    TEXT
  )
`);

try { db.exec(`ALTER TABLE sit_in_logs ADD COLUMN sessions_at_sitin INTEGER`); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number  TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    first_name TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    lab        TEXT NOT NULL,
    time_in    TEXT NOT NULL,
    date       TEXT NOT NULL,
    status     TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

// create default admin if none exists
(async () => {
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!existing) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'change_me';
    const hashed = await bcrypt.hash(defaultPassword, 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashed);
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
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch (e) { return res.json({ success: false, message: 'Session expired. Please log in again.' }); }
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
  } catch (e) { return res.json({ success: false, message: 'Session expired. Please log in again.' }); }
}

// ── REGISTER ──
app.post('/api/register', async (req, res) => {
  const { idNumber, firstName, lastName, middleName, course, level, email, address, password } = req.body;
  const existing = db.prepare('SELECT id FROM students WHERE id_number = ?').get(idNumber);
  if (existing) return res.json({ success: false, message: 'ID number already registered.' });
  const hashed = await bcrypt.hash(password, 10);
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const sessions = itCourses.includes(course) ? 30 : 15;
  db.prepare(`INSERT INTO students (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(idNumber, lastName, firstName, middleName, course, level, email, address, hashed, sessions);
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
      idNumber: user.id_number, firstName: user.first_name, lastName: user.last_name,
      middleName: user.middle_name, course: user.course, level: user.year_level,
      email: user.email, address: user.address, sessions: user.sessions, photo: user.photo || null,
    }
  });
});

// ── GET PROFILE ──
app.get('/api/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.user.idNumber);
  if (!user) return res.json({ success: false, message: 'User not found.' });
  res.json({
    success: true,
    user: {
      idNumber: user.id_number, firstName: user.first_name, lastName: user.last_name,
      middleName: user.middle_name, course: user.course, level: user.year_level,
      email: user.email, address: user.address, sessions: user.sessions, photo: user.photo || null,
    }
  });
});

// ── STUDENT LOGOUT ──
app.post('/api/logout', authMiddleware, (req, res) => res.json({ success: true }));

// ── UPDATE PROFILE ──
app.post('/api/profile/update', authMiddleware, async (req, res) => {
  const { firstName, lastName, middleName, course, level, email, address, password, photo } = req.body;
  const idNumber = req.user.idNumber;
  const existing = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!existing) return res.json({ success: false, message: 'User not found.' });
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  let sessions = existing.sessions;
  if (course !== existing.course) sessions = itCourses.includes(course) ? 30 : 15;
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
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.query.idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });
  res.json({ success: true, student: { idNumber: student.id_number, firstName: student.first_name, lastName: student.last_name, sessions: student.sessions } });
});

// ── ADMIN: CONFIRM SIT-IN ──
app.post('/api/admin/sit-in', adminMiddleware, (req, res) => {
  const { idNumber, lastName, firstName, purpose, lab } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });
  if (student.sessions <= 0) return res.json({ success: false, message: 'Student has no remaining sessions.' });
  const existingActive = db.prepare('SELECT id FROM sit_in_logs WHERE id_number = ? AND logout_time IS NULL').get(idNumber);
  if (existingActive) return res.json({ success: false, message: 'Student already has an active sit-in session.' });
  db.prepare(`INSERT INTO sit_in_logs (id_number, last_name, first_name, purpose, lab, sessions_at_sitin) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(idNumber, lastName, firstName, purpose, lab, student.sessions);
  res.json({ success: true, remainingSessions: student.sessions });
});

// ── ADMIN: CHANGE PASSWORD ──
app.post('/api/admin/change-password', adminMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.admin.username);
  if (!admin) return res.json({ success: false, message: 'Admin not found.' });
  const match = await bcrypt.compare(currentPassword, admin.password);
  if (!match) return res.json({ success: false, message: 'Current password is incorrect.' });
  if (!newPassword || newPassword.trim().length < 6) return res.json({ success: false, message: 'New password must be at least 6 characters.' });
  const hashed = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE admins SET password = ? WHERE username = ?').run(hashed, req.admin.username);
  res.json({ success: true });
});

// ── GET ANNOUNCEMENTS ──
app.get('/api/announcements', authMiddleware, (req, res) => {
  res.json({ success: true, announcements: db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all() });
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
  db.prepare(`UPDATE announcements SET title=?, content=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(req.body.title, req.body.content, req.params.id);
  res.json({ success: true });
});

// ── ADMIN: DELETE ANNOUNCEMENT ──
app.delete('/api/admin/announcements/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── ADMIN: GET ANNOUNCEMENTS ──
app.get('/api/announcements-admin', adminMiddleware, (req, res) => {
  res.json({ success: true, announcements: db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all() });
});

// ── STUDENT: GET OWN HISTORY ──
app.get('/api/history', authMiddleware, (req, res) => {
  res.json({ success: true, logs: db.prepare('SELECT * FROM sit_in_logs WHERE id_number = ? ORDER BY date DESC, login_time DESC').all(req.user.idNumber) });
});

// ── STUDENT: SUBMIT FEEDBACK ──
app.post('/api/history/feedback/:id', authMiddleware, (req, res) => {
  db.prepare('UPDATE sit_in_logs SET feedback = ? WHERE id = ? AND id_number = ?').run(req.body.feedback, req.params.id, req.user.idNumber);
  res.json({ success: true });
});

// ── ADMIN: GET ALL HISTORY ──
app.get('/api/admin/history', adminMiddleware, (req, res) => {
  res.json({ success: true, logs: db.prepare('SELECT * FROM sit_in_logs ORDER BY date DESC, login_time DESC').all() });
});

// ── ADMIN: GET SIT-IN LOGS ──
app.get('/api/admin/sitin', adminMiddleware, (req, res) => {
  res.json({ success: true, logs: db.prepare('SELECT * FROM sit_in_logs ORDER BY date DESC, login_time DESC').all() });
});

// ── ADMIN: LOGOUT STUDENT FROM SIT-IN ──
app.post('/api/admin/sitin-logout/:id', adminMiddleware, (req, res) => {
  const logEntry = db.prepare('SELECT * FROM sit_in_logs WHERE id = ?').get(req.params.id);
  if (!logEntry) return res.json({ success: false, message: 'Log entry not found.' });
  if (logEntry.logout_time) return res.json({ success: false, message: 'Student already logged out.' });
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(logEntry.id_number);
  if (student) {
    const newSessions = Math.max(0, student.sessions - 1);
    db.prepare('UPDATE students SET sessions = ? WHERE id_number = ?').run(newSessions, logEntry.id_number);
    db.prepare('UPDATE sit_in_logs SET sessions_at_sitin = ? WHERE id = ?').run(newSessions, req.params.id);
  }
  db.prepare(`UPDATE sit_in_logs SET logout_time = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ── ADMIN: GET ALL STUDENTS ──
app.get('/api/admin/students', adminMiddleware, (req, res) => {
  res.json({ success: true, students: db.prepare(`SELECT id_number, last_name, first_name, middle_name, course, year_level, email, address, sessions FROM students ORDER BY last_name ASC, first_name ASC`).all() });
});

// ── ADMIN: ADD STUDENT ──
app.post('/api/admin/students', adminMiddleware, async (req, res) => {
  const { idNumber, firstName, lastName, middleName, course, level, email, address, password } = req.body;
  if (!idNumber || !firstName || !lastName || !course || !level || !email || !address || !password)
    return res.json({ success: false, message: 'All required fields must be filled.' });
  if (db.prepare('SELECT id FROM students WHERE id_number = ?').get(idNumber))
    return res.json({ success: false, message: 'ID number already registered.' });
  const hashed = await bcrypt.hash(password, 10);
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  db.prepare(`INSERT INTO students (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(idNumber, lastName, firstName, middleName || '', course, level, email, address, hashed, itCourses.includes(course) ? 30 : 15);
  res.json({ success: true });
});

// ── ADMIN: EDIT STUDENT ──
app.put('/api/admin/students/:idNumber', adminMiddleware, async (req, res) => {
  const { idNumber } = req.params;
  const { firstName, lastName, middleName, course, level, email, address, password } = req.body;
  const existing = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!existing) return res.json({ success: false, message: 'Student not found.' });
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const sessions = course !== existing.course ? (itCourses.includes(course) ? 30 : 15) : existing.sessions;
  if (password && password.trim() !== '') {
    const hashed = await bcrypt.hash(password, 10);
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, password=?, sessions=? WHERE id_number=?`)
      .run(lastName, firstName, middleName || '', course, level, email, address, hashed, sessions, idNumber);
  } else {
    db.prepare(`UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, sessions=? WHERE id_number=?`)
      .run(lastName, firstName, middleName || '', course, level, email, address, sessions, idNumber);
  }
  res.json({ success: true, sessions });
});

// ── ADMIN: DELETE STUDENT ──
app.delete('/api/admin/students/:idNumber', adminMiddleware, (req, res) => {
  if (!db.prepare('SELECT id FROM students WHERE id_number = ?').get(req.params.idNumber))
    return res.json({ success: false, message: 'Student not found.' });
  db.prepare('DELETE FROM students WHERE id_number = ?').run(req.params.idNumber);
  res.json({ success: true });
});

// ── ADMIN: RESET ALL SESSIONS ──
app.post('/api/admin/students/reset-sessions', adminMiddleware, (req, res) => {
  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const stmt = db.prepare('UPDATE students SET sessions = ? WHERE id_number = ?');
  db.transaction(() => {
    for (const s of db.prepare('SELECT id_number, course FROM students').all())
      stmt.run(itCourses.includes(s.course) ? 30 : 15, s.id_number);
  })();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// RESERVATION ROUTES
// ═══════════════════════════════════════════════════

// ── STUDENT: GET OWN RESERVATIONS ──
app.get('/api/reservations', authMiddleware, (req, res) => {
  const reservations = db.prepare(`SELECT * FROM reservations WHERE id_number = ? ORDER BY date DESC, time_in DESC`).all(req.user.idNumber);
  res.json({ success: true, reservations });
});

// ── STUDENT: CREATE RESERVATION ──
app.post('/api/reservations', authMiddleware, (req, res) => {
  const { purpose, lab, timeIn, date } = req.body;
  const idNumber = req.user.idNumber;

  if (!purpose || !lab || !timeIn || !date)
    return res.json({ success: false, message: 'All fields are required.' });

  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.json({ success: false, message: 'Student not found.' });
  if (student.sessions <= 0) return res.json({ success: false, message: 'You have no remaining sessions.' });

  // only 1 pending reservation allowed at a time
  const existingPending = db.prepare(`SELECT id FROM reservations WHERE id_number = ? AND status = 'pending'`).get(idNumber);
  if (existingPending) return res.json({ success: false, message: 'You already have a pending reservation. Please wait for it to be processed.' });

  // prevent same slot conflict
  const conflict = db.prepare(`SELECT id FROM reservations WHERE lab = ? AND date = ? AND time_in = ? AND status IN ('pending', 'approved')`).get(lab, date, timeIn);
  if (conflict) return res.json({ success: false, message: 'That lab slot is already taken. Please choose a different time or lab.' });

  db.prepare(`INSERT INTO reservations (id_number, last_name, first_name, purpose, lab, time_in, date) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(idNumber, student.last_name, student.first_name, purpose, lab, timeIn, date);

  res.json({ success: true });
});

// ── STUDENT: CANCEL OWN PENDING RESERVATION ──
app.delete('/api/reservations/:id', authMiddleware, (req, res) => {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND id_number = ?').get(req.params.id, req.user.idNumber);
  if (!reservation) return res.json({ success: false, message: 'Reservation not found.' });
  if (reservation.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be cancelled.' });
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  res.json({ success: true });
});

// ── ADMIN: GET ALL RESERVATIONS ──
app.get('/api/admin/reservations', adminMiddleware, (req, res) => {
  const reservations = db.prepare(`
    SELECT r.*, s.sessions
    FROM reservations r
    LEFT JOIN students s ON r.id_number = s.id_number
    ORDER BY r.date DESC, r.time_in DESC
  `).all();
  res.json({ success: true, reservations });
});

// ── ADMIN: APPROVE RESERVATION ──
app.put('/api/admin/reservations/:id/approve', adminMiddleware, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!r) return res.json({ success: false, message: 'Reservation not found.' });
  if (r.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be approved.' });
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(r.id_number);
  if (!student || student.sessions <= 0) return res.json({ success: false, message: 'Student has no remaining sessions.' });
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run('approved', req.params.id);
  res.json({ success: true });
});

// ── ADMIN: REJECT RESERVATION ──
app.put('/api/admin/reservations/:id/reject', adminMiddleware, (req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!r) return res.json({ success: false, message: 'Reservation not found.' });
  if (r.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be rejected.' });
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run('rejected', req.params.id);
  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));