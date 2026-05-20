require('dotenv').config();

const express  = require('express');
const { createClient } = require('@libsql/client');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('FATAL: JWT_SECRET is not set in .env');
  process.exit(1);
}

// ── Turso client ──
const db = createClient({
  url:       process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// ── helper: run a single SQL statement ──
async function run(sql, args = []) {
  return db.execute({ sql, args });
}

// ── helper: get all rows ──
async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

// ── helper: get one row ──
async function get(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}

// ── create tables ──
async function initDB() {
  await run(`
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
      sessions    INTEGER DEFAULT 30,
      photo       TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admins (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      attachment TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sit_in_logs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      id_number         TEXT NOT NULL,
      last_name         TEXT NOT NULL,
      first_name        TEXT NOT NULL,
      purpose           TEXT NOT NULL,
      lab               TEXT NOT NULL,
      login_time        TEXT DEFAULT (datetime('now', 'localtime')),
      logout_time       TEXT,
      date              TEXT DEFAULT (date('now', 'localtime')),
      feedback          TEXT,
      sessions_at_sitin INTEGER,
      pc_number         INTEGER
    )
  `);

  await run(`
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
      pc_number  INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lab_pcs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      lab       TEXT NOT NULL,
      pc_number INTEGER NOT NULL,
      status    TEXT DEFAULT 'available',
      UNIQUE(lab, pc_number)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      id_number  TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      is_read    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lab_software (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lab        TEXT NOT NULL,
      software   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(lab, software)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS student_tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      id_number     TEXT NOT NULL,
      sit_in_log_id INTEGER,
      title         TEXT NOT NULL,
      description   TEXT,
      assigned_at   TEXT DEFAULT (datetime('now','localtime')),
      completed     INTEGER DEFAULT 0,
      completed_at  TEXT,
      points        INTEGER DEFAULT 10
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS performance_points (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      id_number  TEXT NOT NULL,
      points     INTEGER NOT NULL DEFAULT 0,
      reason     TEXT,
      awarded_at TEXT DEFAULT (datetime('now','localtime')),
      awarded_by TEXT DEFAULT 'admin'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // seed default settings
  await run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('reservations_enabled', '1')`);

  // seed PCs for each lab
  const labs = ['524', '526', '528', '530', '542', '544'];
  for (const lab of labs) {
    for (let i = 1; i <= 50; i++) {
      await run(`INSERT OR IGNORE INTO lab_pcs (lab, pc_number, status) VALUES (?, ?, 'available')`, [lab, i]);
    }
  }

  // seed default software
  const DEFAULT_SOFTWARE = {
    '524': ['Visual Studio', 'Visual Studio Code', 'Cisco Packet Tracer'],
    '526': ['Visual Studio', 'Visual Studio Code'],
    '528': ['Visual Studio', 'Visual Studio Code'],
    '530': ['Visual Studio', 'Visual Studio Code', 'SQL Server Management Studio'],
    '542': ['Visual Studio', 'Visual Studio Code'],
    '544': ['Visual Studio', 'Visual Studio Code', 'VMware', 'Oracle VM VirtualBox'],
  };
  for (const [lab, apps] of Object.entries(DEFAULT_SOFTWARE)) {
    for (const app of apps) {
      await run(`INSERT OR IGNORE INTO lab_software (lab, software) VALUES (?, ?)`, [lab, app]);
    }
  }

  // create default admin if none exists
  const existing = await get('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (!existing) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'change_me';
    const hashed = await bcrypt.hash(defaultPassword, 10);
    await run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashed]);
    console.log(`Default admin created — username: admin, password: ${defaultPassword}`);
  }

  console.log('Database initialised.');
}

// ── helper: create a notification for one student ──
async function createNotification(idNumber, type, title, message) {
  await run(
    `INSERT INTO notifications (id_number, type, title, message) VALUES (?, ?, ?, ?)`,
    [idNumber, type, title, message]
  );
}

// ── helper: notify ALL students ──
async function notifyAllStudents(type, title, message) {
  const students = await all('SELECT id_number FROM students');
  for (const s of students) {
    await run(
      `INSERT INTO notifications (id_number, type, title, message) VALUES (?, ?, ?, ?)`,
      [s.id_number, type, title, message]
    );
  }
}

// ── labs list ──
const labs = ['524', '526', '528', '530', '542', '544'];

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

// ── PROFANITY FILTER ──
const BANNED_WORDS = [
  'fuck','shit','bitch','asshole','bastard','crap','piss','dick','cock',
  'pussy','cunt','whore','slut','faggot','nigger','nigga','retard','motherfucker',
  'bullshit','jackass','dumbass','ass','puta','putang','putangina','gago','bobo',
  'tanga','ulol','hindot','pakyu','pakingshet','leche','kupal','tarantado',
  'hayop','bwisit','lintik','supot','bilat','betlog','burat','suso','kantot',
  'tangina','shet','wtf','kys',
];

function containsProfanity(text) {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (BANNED_WORDS.includes(word)) return true;
    for (const banned of BANNED_WORDS) {
      if (banned.length >= 5 && word.includes(banned)) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════

// ── REGISTER ──
app.post('/api/register', async (req, res) => {
  try {
    const { idNumber, firstName, lastName, middleName, course, level, email, address, password } = req.body;
    const existing = await get('SELECT id FROM students WHERE id_number = ?', [idNumber]);
    if (existing) return res.json({ success: false, message: 'ID number already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
    const sessions = itCourses.includes(course) ? 30 : 15;
    await run(
      `INSERT INTO students (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idNumber, lastName, firstName, middleName, course, level, email, address, hashed, sessions]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.json({ success: false, message: 'Registration failed.' });
  }
});

// ── LOGIN ──
app.post('/api/login', async (req, res) => {
  try {
    const { idNumber, password } = req.body;
    const admin = await get('SELECT * FROM admins WHERE username = ?', [idNumber]);
    if (admin) {
      const match = await bcrypt.compare(password, admin.password);
      if (!match) return res.json({ success: false, message: 'Invalid credentials.' });
      const token = jwt.sign({ username: admin.username, isAdmin: true }, SECRET, { expiresIn: '8h' });
      return res.json({ success: true, token, isAdmin: true });
    }
    const user = await get('SELECT * FROM students WHERE id_number = ?', [idNumber]);
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
  } catch (e) {
    console.error(e);
    res.json({ success: false, message: 'Login failed.' });
  }
});

// ── GET PROFILE ──
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT * FROM students WHERE id_number = ?', [req.user.idNumber]);
    if (!user) return res.json({ success: false, message: 'User not found.' });
    res.json({
      success: true,
      user: {
        idNumber: user.id_number, firstName: user.first_name, lastName: user.last_name,
        middleName: user.middle_name, course: user.course, level: user.year_level,
        email: user.email, address: user.address, sessions: user.sessions, photo: user.photo || null,
      }
    });
  } catch (e) {
    res.json({ success: false, message: 'Failed to load profile.' });
  }
});

// ── STUDENT LOGOUT ──
app.post('/api/logout', authMiddleware, (req, res) => res.json({ success: true }));

// ── UPDATE PROFILE ──
app.post('/api/profile/update', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, middleName, course, level, email, address, password, photo } = req.body;
    const idNumber = req.user.idNumber;
    const existing = await get('SELECT * FROM students WHERE id_number = ?', [idNumber]);
    if (!existing) return res.json({ success: false, message: 'User not found.' });
    const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
    let sessions = existing.sessions;
    if (course !== existing.course) sessions = itCourses.includes(course) ? 30 : 15;
    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 10);
      await run(
        `UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, password=?, photo=?, sessions=? WHERE id_number=?`,
        [lastName, firstName, middleName, course, level, email, address, hashed, photo || null, sessions, idNumber]
      );
    } else {
      await run(
        `UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, photo=?, sessions=? WHERE id_number=?`,
        [lastName, firstName, middleName, course, level, email, address, photo || null, sessions, idNumber]
      );
    }
    res.json({ success: true, sessions });
  } catch (e) {
    res.json({ success: false, message: 'Update failed.' });
  }
});

// ═══════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════

// ── ADMIN: SEARCH STUDENT ──
app.get('/api/admin/search-student', adminMiddleware, async (req, res) => {
  try {
    const student = await get('SELECT * FROM students WHERE id_number = ?', [req.query.idNumber]);
    if (!student) return res.json({ success: false, message: 'Student not found.' });
    const today = new Date().toISOString().split('T')[0];
    const reservation = await get(
      `SELECT * FROM reservations WHERE id_number = ? AND status = 'approved' AND date = ? ORDER BY created_at DESC LIMIT 1`,
      [student.id_number, today]
    );
    res.json({
      success: true,
      student: { idNumber: student.id_number, firstName: student.first_name, lastName: student.last_name, sessions: student.sessions },
      reservation: reservation || null
    });
  } catch (e) {
    res.json({ success: false, message: 'Search failed.' });
  }
});

// ── ADMIN: CONFIRM SIT-IN ──
app.post('/api/admin/sit-in', adminMiddleware, async (req, res) => {
  try {
    const { idNumber, lastName, firstName, purpose, lab, pcNumber } = req.body;
    const student = await get('SELECT * FROM students WHERE id_number = ?', [idNumber]);
    if (!student) return res.json({ success: false, message: 'Student not found.' });
    if (student.sessions <= 0) return res.json({ success: false, message: 'Student has no remaining sessions.' });
    const existingActive = await get('SELECT id FROM sit_in_logs WHERE id_number = ? AND logout_time IS NULL', [idNumber]);
    if (existingActive) return res.json({ success: false, message: 'Student already has an active sit-in session.' });
    await run(
      `INSERT INTO sit_in_logs (id_number, last_name, first_name, purpose, lab, pc_number, sessions_at_sitin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idNumber, lastName, firstName, purpose, lab, pcNumber || null, student.sessions]
    );
    res.json({ success: true, remainingSessions: student.sessions });
  } catch (e) {
    res.json({ success: false, message: 'Sit-in failed.' });
  }
});

// ── ADMIN: CHANGE PASSWORD ──
app.post('/api/admin/change-password', adminMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await get('SELECT * FROM admins WHERE username = ?', [req.admin.username]);
    if (!admin) return res.json({ success: false, message: 'Admin not found.' });
    const match = await bcrypt.compare(currentPassword, admin.password);
    if (!match) return res.json({ success: false, message: 'Current password is incorrect.' });
    if (!newPassword || newPassword.trim().length < 6) return res.json({ success: false, message: 'New password must be at least 6 characters.' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await run('UPDATE admins SET password = ? WHERE username = ?', [hashed, req.admin.username]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Password change failed.' });
  }
});

// ── GET ANNOUNCEMENTS (student) ──
app.get('/api/announcements', authMiddleware, async (req, res) => {
  try {
    const announcements = await all('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json({ success: true, announcements });
  } catch (e) {
    res.json({ success: false, announcements: [] });
  }
});

// ── ADMIN: GET ANNOUNCEMENTS ──
app.get('/api/announcements-admin', adminMiddleware, async (req, res) => {
  try {
    const announcements = await all('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json({ success: true, announcements });
  } catch (e) {
    res.json({ success: false, announcements: [] });
  }
});

// ── ADMIN: ADD ANNOUNCEMENT ──
app.post('/api/admin/announcements', adminMiddleware, async (req, res) => {
  try {
    const { title, content, attachment } = req.body;
    if (!title || !content) return res.json({ success: false, message: 'Title and content are required.' });
    const attachJson = attachment ? JSON.stringify(attachment) : null;
    await run('INSERT INTO announcements (title, content, attachment) VALUES (?, ?, ?)', [title, content, attachJson]);
    await notifyAllStudents(
      'announcement',
      `📢 New Announcement: ${title}`,
      content.length > 120 ? content.slice(0, 120) + '…' : content
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to post announcement.' });
  }
});

// ── ADMIN: EDIT ANNOUNCEMENT ──
app.put('/api/admin/announcements/:id', adminMiddleware, async (req, res) => {
  try {
    const { title, content, attachment } = req.body;
    const attachJson = attachment ? JSON.stringify(attachment) : null;
    await run(
      `UPDATE announcements SET title=?, content=?, attachment=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [title, content, attachJson, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to edit announcement.' });
  }
});

// ── ADMIN: DELETE ANNOUNCEMENT ──
app.delete('/api/admin/announcements/:id', adminMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM announcements WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to delete announcement.' });
  }
});

// ── STUDENT: GET OWN HISTORY ──
app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const logs = await all(
      'SELECT * FROM sit_in_logs WHERE id_number = ? ORDER BY date DESC, login_time DESC',
      [req.user.idNumber]
    );
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [] });
  }
});

// ── STUDENT: SUBMIT FEEDBACK ──
app.post('/api/history/feedback/:id', authMiddleware, async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || !feedback.trim()) return res.json({ success: false, message: 'Feedback cannot be empty.' });
    if (containsProfanity(feedback)) return res.json({ success: false, message: 'Your feedback contains inappropriate language.' });
    await run(
      'UPDATE sit_in_logs SET feedback = ? WHERE id = ? AND id_number = ?',
      [feedback.trim(), req.params.id, req.user.idNumber]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to submit feedback.' });
  }
});

// ── ADMIN: GET ALL HISTORY ──
app.get('/api/admin/history', adminMiddleware, async (req, res) => {
  try {
    const logs = await all('SELECT * FROM sit_in_logs ORDER BY date DESC, login_time DESC');
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [] });
  }
});

// ── ADMIN: GET ALL FEEDBACK ──
app.get('/api/admin/feedback', adminMiddleware, async (req, res) => {
  try {
    const logs = await all(
      `SELECT id_number, last_name, first_name, lab, date, feedback FROM sit_in_logs
       WHERE feedback IS NOT NULL AND feedback != '' ORDER BY date DESC, login_time DESC`
    );
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [] });
  }
});

// ── ADMIN: GET SIT-IN LOGS ──
app.get('/api/admin/sitin', adminMiddleware, async (req, res) => {
  try {
    const logs = await all('SELECT * FROM sit_in_logs ORDER BY date DESC, login_time DESC');
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [] });
  }
});

// ── ADMIN: LOGOUT STUDENT FROM SIT-IN ──
app.post('/api/admin/sitin-logout/:id', adminMiddleware, async (req, res) => {
  try {
    const logEntry = await get('SELECT * FROM sit_in_logs WHERE id = ?', [req.params.id]);
    if (!logEntry) return res.json({ success: false, message: 'Log entry not found.' });
    if (logEntry.logout_time) return res.json({ success: false, message: 'Student already logged out.' });
    const student = await get('SELECT * FROM students WHERE id_number = ?', [logEntry.id_number]);
    if (student) {
      const newSessions = Math.max(0, student.sessions - 1);
      await run('UPDATE students SET sessions = ? WHERE id_number = ?', [newSessions, logEntry.id_number]);
      await run('UPDATE sit_in_logs SET sessions_at_sitin = ? WHERE id = ?', [newSessions, req.params.id]);
    }
    await run(`UPDATE sit_in_logs SET logout_time = datetime('now','localtime') WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Logout failed.' });
  }
});

// ── ADMIN: GET ALL STUDENTS ──
app.get('/api/admin/students', adminMiddleware, async (req, res) => {
  try {
    const students = await all(
      `SELECT id_number, last_name, first_name, middle_name, course, year_level, email, address, sessions
       FROM students ORDER BY last_name ASC, first_name ASC`
    );
    res.json({ success: true, students });
  } catch (e) {
    res.json({ success: false, students: [] });
  }
});

// ── ADMIN: ADD STUDENT ──
app.post('/api/admin/students', adminMiddleware, async (req, res) => {
  try {
    const { idNumber, firstName, lastName, middleName, course, level, email, address, password } = req.body;
    if (!idNumber || !firstName || !lastName || !course || !level || !email || !address || !password)
      return res.json({ success: false, message: 'All required fields must be filled.' });
    if (await get('SELECT id FROM students WHERE id_number = ?', [idNumber]))
      return res.json({ success: false, message: 'ID number already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
    await run(
      `INSERT INTO students (id_number, last_name, first_name, middle_name, course, year_level, email, address, password, sessions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idNumber, lastName, firstName, middleName || '', course, level, email, address, hashed, itCourses.includes(course) ? 30 : 15]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to add student.' });
  }
});

// ── ADMIN: RESET ALL SESSIONS ──
app.post('/api/admin/students/reset-sessions', adminMiddleware, async (req, res) => {
  try {
    const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
    const students = await all('SELECT id_number, course FROM students');
    for (const s of students) {
      await run('UPDATE students SET sessions = ? WHERE id_number = ?', [itCourses.includes(s.course) ? 30 : 15, s.id_number]);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to reset sessions.' });
  }
});

// ── ADMIN: EDIT STUDENT ──
app.put('/api/admin/students/:idNumber', adminMiddleware, async (req, res) => {
  try {
    const { idNumber } = req.params;
    const { firstName, lastName, middleName, course, level, email, address, password } = req.body;
    const existing = await get('SELECT * FROM students WHERE id_number = ?', [idNumber]);
    if (!existing) return res.json({ success: false, message: 'Student not found.' });
    const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
    const sessions = course !== existing.course ? (itCourses.includes(course) ? 30 : 15) : existing.sessions;
    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 10);
      await run(
        `UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, password=?, sessions=? WHERE id_number=?`,
        [lastName, firstName, middleName || '', course, level, email, address, hashed, sessions, idNumber]
      );
    } else {
      await run(
        `UPDATE students SET last_name=?, first_name=?, middle_name=?, course=?, year_level=?, email=?, address=?, sessions=? WHERE id_number=?`,
        [lastName, firstName, middleName || '', course, level, email, address, sessions, idNumber]
      );
    }
    res.json({ success: true, sessions });
  } catch (e) {
    res.json({ success: false, message: 'Failed to edit student.' });
  }
});

// ── ADMIN: DELETE STUDENT ──
app.delete('/api/admin/students/:idNumber', adminMiddleware, async (req, res) => {
  try {
    if (!await get('SELECT id FROM students WHERE id_number = ?', [req.params.idNumber]))
      return res.json({ success: false, message: 'Student not found.' });
    await run('DELETE FROM students WHERE id_number = ?', [req.params.idNumber]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to delete student.' });
  }
});

// ═══════════════════════════════════════════════════
// SETTINGS ROUTES
// ═══════════════════════════════════════════════════

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const row = await get(`SELECT value FROM settings WHERE key = 'reservations_enabled'`);
    res.json({ success: true, reservationsEnabled: row ? row.value === '1' : true });
  } catch (e) {
    res.json({ success: true, reservationsEnabled: true });
  }
});

app.get('/api/admin/settings', adminMiddleware, async (req, res) => {
  try {
    const row = await get(`SELECT value FROM settings WHERE key = 'reservations_enabled'`);
    res.json({ success: true, reservationsEnabled: row ? row.value === '1' : true });
  } catch (e) {
    res.json({ success: true, reservationsEnabled: true });
  }
});

app.put('/api/admin/settings', adminMiddleware, async (req, res) => {
  try {
    const { reservationsEnabled } = req.body;
    await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('reservations_enabled', ?)`, [reservationsEnabled ? '1' : '0']);
    if (!reservationsEnabled) {
      await notifyAllStudents('announcement', '🚫 Reservations Temporarily Disabled', 'Lab reservations have been temporarily disabled by the administrator.');
    } else {
      await notifyAllStudents('announcement', '✅ Reservations are Now Open', 'Lab reservations have been re-enabled. You may now reserve a PC.');
    }
    res.json({ success: true, reservationsEnabled });
  } catch (e) {
    res.json({ success: false, message: 'Failed to update settings.' });
  }
});

// ═══════════════════════════════════════════════════
// RESERVATION ROUTES
// ═══════════════════════════════════════════════════

app.get('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const reservations = await all(
      `SELECT * FROM reservations WHERE id_number = ? ORDER BY date DESC, time_in DESC`,
      [req.user.idNumber]
    );
    res.json({ success: true, reservations });
  } catch (e) {
    res.json({ success: false, reservations: [] });
  }
});

app.post('/api/reservations', authMiddleware, async (req, res) => {
  try {
    const settingRow = await get(`SELECT value FROM settings WHERE key = 'reservations_enabled'`);
    if (!settingRow || settingRow.value !== '1')
      return res.json({ success: false, message: 'Reservations are currently disabled.' });
    const { purpose, lab, timeIn, date, pcNumber } = req.body;
    const idNumber = req.user.idNumber;
    if (!purpose || !lab || !timeIn || !date || !pcNumber)
      return res.json({ success: false, message: 'All fields are required.' });
    const student = await get('SELECT * FROM students WHERE id_number = ?', [idNumber]);
    if (!student) return res.json({ success: false, message: 'Student not found.' });
    if (student.sessions <= 0) return res.json({ success: false, message: 'You have no remaining sessions.' });
    const existingPending = await get(`SELECT id FROM reservations WHERE id_number = ? AND status = 'pending'`, [idNumber]);
    if (existingPending) return res.json({ success: false, message: 'You already have a pending reservation.' });
    const conflict = await get(
      `SELECT id FROM reservations WHERE lab = ? AND date = ? AND time_in = ? AND pc_number = ? AND status IN ('pending', 'approved')`,
      [lab, date, timeIn, pcNumber]
    );
    if (conflict) return res.json({ success: false, message: 'That PC is already reserved for this slot.' });
    const pc = await get('SELECT * FROM lab_pcs WHERE lab = ? AND pc_number = ?', [lab, pcNumber]);
    if (!pc || pc.status === 'maintenance')
      return res.json({ success: false, message: 'That PC is under maintenance.' });
    await run(
      `INSERT INTO reservations (id_number, last_name, first_name, purpose, lab, time_in, date, pc_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idNumber, student.last_name, student.first_name, purpose, lab, timeIn, date, pcNumber]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Reservation failed.' });
  }
});

app.delete('/api/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const reservation = await get('SELECT * FROM reservations WHERE id = ? AND id_number = ?', [req.params.id, req.user.idNumber]);
    if (!reservation) return res.json({ success: false, message: 'Reservation not found.' });
    if (reservation.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be cancelled.' });
    await run('UPDATE reservations SET status = ? WHERE id = ?', ['cancelled', req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to cancel reservation.' });
  }
});

app.get('/api/admin/reservations', adminMiddleware, async (req, res) => {
  try {
    const reservations = await all(
      `SELECT r.*, s.sessions FROM reservations r LEFT JOIN students s ON r.id_number = s.id_number ORDER BY r.date DESC, r.time_in DESC`
    );
    res.json({ success: true, reservations });
  } catch (e) {
    res.json({ success: false, reservations: [] });
  }
});

app.put('/api/admin/reservations/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const r = await get('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    if (!r) return res.json({ success: false, message: 'Reservation not found.' });
    if (r.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be approved.' });
    const student = await get('SELECT * FROM students WHERE id_number = ?', [r.id_number]);
    if (!student || student.sessions <= 0) return res.json({ success: false, message: 'Student has no remaining sessions.' });
    await run('UPDATE reservations SET status = ? WHERE id = ?', ['approved', req.params.id]);
    await createNotification(r.id_number, 'reservation_approved', '✅ Reservation Approved',
      `Your reservation for Lab ${r.lab} (${r.purpose}) on ${r.date} at ${r.time_in} has been approved.`);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to approve.' });
  }
});

app.put('/api/admin/reservations/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const r = await get('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    if (!r) return res.json({ success: false, message: 'Reservation not found.' });
    if (r.status !== 'pending') return res.json({ success: false, message: 'Only pending reservations can be rejected.' });
    await run('UPDATE reservations SET status = ? WHERE id = ?', ['rejected', req.params.id]);
    await createNotification(r.id_number, 'reservation_rejected', '❌ Reservation Rejected',
      `Your reservation for Lab ${r.lab} (${r.purpose}) on ${r.date} was rejected.`);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to reject.' });
  }
});

// ═══════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await all(
      `SELECT * FROM notifications WHERE id_number = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.idNumber]
    );
    const unreadRow = await get(
      `SELECT COUNT(*) as count FROM notifications WHERE id_number = ? AND is_read = 0`,
      [req.user.idNumber]
    );
    res.json({ success: true, notifications, unreadCount: unreadRow ? unreadRow.count : 0 });
  } catch (e) {
    res.json({ success: false, notifications: [], unreadCount: 0 });
  }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND id_number = ?', [req.params.id, req.user.idNumber]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE id_number = ?', [req.user.idNumber]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM notifications WHERE id = ? AND id_number = ?', [req.params.id, req.user.idNumber]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.delete('/api/notifications', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM notifications WHERE id_number = ?', [req.user.idNumber]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ═══════════════════════════════════════════════════
// LAB PCS ROUTES
// ═══════════════════════════════════════════════════

app.get('/api/lab-pcs', authMiddleware, async (req, res) => {
  try {
    const { lab, date, timeIn } = req.query;
    if (!lab || !date || !timeIn) return res.json({ success: false, message: 'Missing parameters.' });
 
    const pcs = await all('SELECT * FROM lab_pcs WHERE lab = ? ORDER BY pc_number ASC', [lab]);
 
    const reservedRows = await all(
      `SELECT pc_number FROM reservations
       WHERE lab = ? AND date = ? AND time_in = ? AND status IN ('pending', 'approved')`,
      [lab, date, timeIn]
    );
    const reservedPCs = reservedRows.map(r => r.pc_number);
 
    const result = pcs.map(pc => ({
      ...pc,
      effectiveStatus:
        pc.status === 'maintenance' ? 'maintenance'
        : reservedPCs.includes(pc.pc_number) ? 'reserved'
        : 'available'
    }));
 
    res.json({ success: true, pcs: result });
  } catch (e) {
    res.json({ success: false, pcs: [] });
  }
});
 
/**
 * GET /api/admin/lab-pcs
 * Admin: get ALL PCs for ALL labs grouped, with counts per lab.
 */
app.get('/api/admin/lab-pcs', adminMiddleware, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM lab_pcs ORDER BY lab ASC, pc_number ASC');
 
    // Group by lab
    const grouped = {};
    for (const lab of ['524', '526', '528', '530', '542', '544']) {
      grouped[lab] = { pcs: [], total: 0, available: 0, maintenance: 0 };
    }
 
    for (const row of rows) {
      if (!grouped[row.lab]) {
        grouped[row.lab] = { pcs: [], total: 0, available: 0, maintenance: 0 };
      }
      grouped[row.lab].pcs.push(row);
      grouped[row.lab].total++;
      if (row.status === 'maintenance') grouped[row.lab].maintenance++;
      else grouped[row.lab].available++;
    }
 
    res.json({ success: true, grouped });
  } catch (e) {
    res.json({ success: false, grouped: {} });
  }
});
 
/**
 * GET /api/admin/lab-pcs/:lab
 * Admin: get PCs for a single lab (kept for backwards compat).
 */
app.get('/api/admin/lab-pcs/:lab', adminMiddleware, async (req, res) => {
  try {
    const pcs = await all(
      'SELECT * FROM lab_pcs WHERE lab = ? ORDER BY pc_number ASC',
      [req.params.lab]
    );
    res.json({ success: true, pcs });
  } catch (e) {
    res.json({ success: false, pcs: [] });
  }
});
 
/**
 * PUT /api/admin/lab-pcs/:lab/:pcNumber
 * Admin: toggle a PC between 'available' and 'maintenance'.
 */
app.put('/api/admin/lab-pcs/:lab/:pcNumber', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['available', 'maintenance'].includes(status)) {
      return res.json({ success: false, message: 'Invalid status. Use "available" or "maintenance".' });
    }
 
    const { lab, pcNumber } = req.params;
 
    // If going into maintenance, cancel any pending reservations for this PC
    if (status === 'maintenance') {
      const affectedRes = await all(
        `SELECT * FROM reservations
         WHERE lab = ? AND pc_number = ? AND status = 'pending'`,
        [lab, pcNumber]
      );
 
      for (const r of affectedRes) {
        await run('UPDATE reservations SET status = ? WHERE id = ?', ['rejected', r.id]);
        await createNotification(
          r.id_number,
          'reservation_rejected',
          `🛠 Reservation Cancelled — PC Under Maintenance`,
          `Your reservation for Lab ${lab}, PC ${pcNumber} on ${r.date} was cancelled because that PC is now under maintenance.`
        );
      }
    }
 
    await run(
      'UPDATE lab_pcs SET status = ? WHERE lab = ? AND pc_number = ?',
      [status, lab, pcNumber]
    );
 
    res.json({ success: true, lab, pcNumber: parseInt(pcNumber), status });
  } catch (e) {
    console.error(e);
    res.json({ success: false, message: 'Failed to update PC status.' });
  }
});
 
/**
 * PUT /api/admin/lab-pcs/:lab/bulk
 * Admin: set status for ALL PCs in a lab at once.
 */
app.put('/api/admin/lab-pcs/:lab/bulk', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['available', 'maintenance'].includes(status)) {
      return res.json({ success: false, message: 'Invalid status.' });
    }
 
    const { lab } = req.params;
 
    if (status === 'maintenance') {
      // Cancel all pending reservations for this lab
      const affectedRes = await all(
        `SELECT * FROM reservations WHERE lab = ? AND status = 'pending'`,
        [lab]
      );
      for (const r of affectedRes) {
        await run('UPDATE reservations SET status = ? WHERE id = ?', ['rejected', r.id]);
        await createNotification(
          r.id_number,
          'reservation_rejected',
          `🛠 Reservation Cancelled — Lab ${lab} Under Maintenance`,
          `Your reservation for Lab ${lab} on ${r.date} was cancelled because the entire lab is now under maintenance.`
        );
      }
    }
 
    await run('UPDATE lab_pcs SET status = ? WHERE lab = ?', [status, lab]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Bulk update failed.' });
  }
});

// ═══════════════════════════════════════════════════
// LAB SOFTWARE ROUTES
// ═══════════════════════════════════════════════════

async function getLabSoftwareGrouped() {
  const rows = await all('SELECT * FROM lab_software ORDER BY lab ASC, software ASC');
  const grouped = {};
  for (const lab of labs) grouped[lab] = [];
  for (const row of rows) {
    if (!grouped[row.lab]) grouped[row.lab] = [];
    grouped[row.lab].push({ id: row.id, software: row.software });
  }
  return grouped;
}

app.get('/api/lab-software', authMiddleware, async (req, res) => {
  try {
    res.json({ success: true, software: await getLabSoftwareGrouped() });
  } catch (e) {
    res.json({ success: false, software: {} });
  }
});

app.get('/api/admin/lab-software', adminMiddleware, async (req, res) => {
  try {
    res.json({ success: true, software: await getLabSoftwareGrouped() });
  } catch (e) {
    res.json({ success: false, software: {} });
  }
});

app.post('/api/admin/lab-software', adminMiddleware, async (req, res) => {
  try {
    const { lab, software } = req.body;
    if (!lab || !software || !software.trim()) return res.json({ success: false, message: 'Lab and software name are required.' });
    if (!labs.includes(lab)) return res.json({ success: false, message: 'Invalid lab.' });
    await run('INSERT OR IGNORE INTO lab_software (lab, software) VALUES (?, ?)', [lab, software.trim()]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'That software already exists for this lab.' });
  }
});

app.delete('/api/admin/lab-software/:id', adminMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM lab_software WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post('/api/admin/lab-software/import', adminMiddleware, async (req, res) => {
  try {
    const { rows, mode } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ success: false, message: 'No rows provided.' });
    if (mode === 'replace') await run('DELETE FROM lab_software');
    for (const row of rows) {
      if (row.lab && row.software && labs.includes(String(row.lab).trim())) {
        await run(`INSERT OR IGNORE INTO lab_software (lab, software) VALUES (?, ?)`, [String(row.lab).trim(), String(row.software).trim()]);
      }
    }
    res.json({ success: true, software: await getLabSoftwareGrouped() });
  } catch (e) {
    res.json({ success: false, message: 'Import failed.' });
  }
});

app.get('/api/admin/lab-software/export-csv', adminMiddleware, async (req, res) => {
  try {
    const grouped = await getLabSoftwareGrouped();
    let csv = 'Laboratory,Available Software\n';
    for (const [lab, entries] of Object.entries(grouped)) {
      const appsStr = entries.map(e => e.software).join('; ');
      csv += `"Lab ${lab}","${appsStr}"\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="lab-software.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send('Export failed.');
  }
});

// ═══════════════════════════════════════════════════
// RECORDS ROUTE
// ═══════════════════════════════════════════════════

app.get('/api/admin/records', adminMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    let query = 'SELECT * FROM sit_in_logs';
    const params = [];
    if (dateFrom && dateTo) { query += ' WHERE date >= ? AND date <= ?'; params.push(dateFrom, dateTo); }
    else if (dateFrom) { query += ' WHERE date >= ?'; params.push(dateFrom); }
    else if (dateTo)   { query += ' WHERE date <= ?'; params.push(dateTo); }
    query += ' ORDER BY date DESC, login_time DESC';
    const logs = await all(query, params);
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [] });
  }
});

// ═══════════════════════════════════════════════════
// LEADERBOARD ROUTES
// ═══════════════════════════════════════════════════

app.get('/api/leaderboard', async (req, res) => {
  try {
    const students = await all(`SELECT id_number, last_name, first_name, course, year_level FROM students`);
    const results = await Promise.all(students.map(async s => {
      const logs = await all(
        `SELECT login_time, logout_time FROM sit_in_logs WHERE id_number = ? AND logout_time IS NOT NULL`,
        [s.id_number]
      );
      let totalMs = 0;
      for (const log of logs) {
        const login  = new Date(log.login_time.replace(' ', 'T'));
        const logout = new Date(log.logout_time.replace(' ', 'T'));
        if (!isNaN(login) && !isNaN(logout)) totalMs += logout - login;
      }
      const totalHours = totalMs / 3600000;
      const perfRow  = await get(`SELECT COALESCE(SUM(points), 0) as total FROM performance_points WHERE id_number = ?`, [s.id_number]);
      const perfPoints = perfRow ? Number(perfRow.total) : 0;
      const taskRow  = await get(
        `SELECT COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done, COALESCE(SUM(CASE WHEN completed = 1 THEN points ELSE 0 END), 0) as task_pts FROM student_tasks WHERE id_number = ?`,
        [s.id_number]
      );
      const taskPoints   = taskRow ? Number(taskRow.task_pts) : 0;
      const tasksTotal   = taskRow ? Number(taskRow.total)    : 0;
      const tasksDone    = taskRow ? Number(taskRow.done)     : 0;
      const sessionCount = logs.length;
      const hoursScore   = Math.min(totalHours, 100);
      const finalScore   = (perfPoints * 0.5) + (hoursScore * 0.3) + (taskPoints * 0.2);
      return {
        idNumber: s.id_number, firstName: s.first_name, lastName: s.last_name,
        course: s.course, yearLevel: s.year_level,
        perfPoints, totalHours: Math.round(totalHours * 10) / 10,
        taskPoints, tasksTotal, tasksDone, sessionCount,
        finalScore: Math.round(finalScore * 10) / 10,
      };
    }));
    results.sort((a, b) => b.finalScore - a.finalScore);
    const top = results.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 }));
    res.json({ success: true, leaderboard: top });
  } catch (e) {
    res.json({ success: false, leaderboard: [] });
  }
});

// ── ADMIN: Get all tasks ──
app.get('/api/admin/tasks', adminMiddleware, async (req, res) => {
  try {
    const tasks = await all(
      `SELECT t.*, s.first_name, s.last_name FROM student_tasks t LEFT JOIN students s ON t.id_number = s.id_number ORDER BY t.assigned_at DESC`
    );
    res.json({ success: true, tasks });
  } catch (e) {
    res.json({ success: false, tasks: [] });
  }
});

// ── ADMIN: Assign task ──
app.post('/api/admin/tasks', adminMiddleware, async (req, res) => {
  try {
    const { idNumber, sitInLogId, title, description, points } = req.body;
    if (!idNumber || !title) return res.json({ success: false, message: 'ID number and title are required.' });
    const student = await get('SELECT id FROM students WHERE id_number = ?', [idNumber]);
    if (!student) return res.json({ success: false, message: 'Student not found.' });
    await run(
      `INSERT INTO student_tasks (id_number, sit_in_log_id, title, description, points) VALUES (?, ?, ?, ?, ?)`,
      [idNumber, sitInLogId || null, title, description || '', points || 10]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to assign task.' });
  }
});

// ── ADMIN: Mark task complete ──
app.put('/api/admin/tasks/:id/complete', adminMiddleware, async (req, res) => {
  try {
    const task = await get('SELECT * FROM student_tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.json({ success: false, message: 'Task not found.' });
    await run(`UPDATE student_tasks SET completed = 1, completed_at = datetime('now','localtime') WHERE id = ?`, [req.params.id]);
    await createNotification(task.id_number, 'task_completed', '✅ Task Marked Complete',
      `Your task "${task.title}" has been marked as completed. +${task.points} task points awarded!`);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to complete task.' });
  }
});

// ── ADMIN: Delete task ──
app.delete('/api/admin/tasks/:id', adminMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM student_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ── ADMIN: Award performance points ──
app.post('/api/admin/performance-points', adminMiddleware, async (req, res) => {
  try {
    const { idNumber, points, reason } = req.body;
    if (!idNumber || !points) return res.json({ success: false, message: 'ID number and points are required.' });
    const student = await get('SELECT id FROM students WHERE id_number = ?', [idNumber]);
    if (!student) return res.json({ success: false, message: 'Student not found.' });
    await run(`INSERT INTO performance_points (id_number, points, reason) VALUES (?, ?, ?)`,
      [idNumber, parseInt(points), reason || 'Admin award']);
    await createNotification(idNumber, 'points_awarded', `🌟 +${points} Performance Points`,
      reason || 'Points awarded by admin. Keep up the great work!');
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to award points.' });
  }
});

// ── ADMIN: Get all performance points ──
app.get('/api/admin/performance-points/all', adminMiddleware, async (req, res) => {
  try {
    const rows = await all(
      `SELECT p.*, s.first_name, s.last_name FROM performance_points p LEFT JOIN students s ON p.id_number = s.id_number ORDER BY p.awarded_at DESC LIMIT 100`
    );
    res.json({ success: true, rows });
  } catch (e) {
    res.json({ success: false, rows: [] });
  }
});

// ── ADMIN: Get performance points for a student ──
app.get('/api/admin/performance-points/:idNumber', adminMiddleware, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM performance_points WHERE id_number = ? ORDER BY awarded_at DESC`, [req.params.idNumber]);
    const total = rows.reduce((sum, r) => sum + r.points, 0);
    res.json({ success: true, rows, total });
  } catch (e) {
    res.json({ success: false, rows: [], total: 0 });
  }
});

// ── STUDENT: Get own tasks ──
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const tasks = await all(`SELECT * FROM student_tasks WHERE id_number = ? ORDER BY assigned_at DESC`, [req.user.idNumber]);
    res.json({ success: true, tasks });
  } catch (e) {
    res.json({ success: false, tasks: [] });
  }
});

// ── STUDENT: Get own performance points ──
app.get('/api/performance-points', authMiddleware, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM performance_points WHERE id_number = ? ORDER BY awarded_at DESC`, [req.user.idNumber]);
    const total = rows.reduce((sum, r) => sum + Number(r.points), 0);
    res.json({ success: true, rows, total });
  } catch (e) {
    res.json({ success: false, rows: [], total: 0 });
  }
});

// ── Start server ──
initDB()
  .then(() => {
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
  })
  .catch(err => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });