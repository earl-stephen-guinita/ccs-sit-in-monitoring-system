/* =====================================================
   CCS SIT-IN MONITORING SYSTEM — SCRIPT
===================================================== */

/* ── hero particles ── */
(function () {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function randomBetween(a, b) { return a + Math.random() * (b - a); }

  function initParticles() {
    particles = [];
    const count = Math.floor((W * H) / 12000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x:     randomBetween(0, W),
        y:     randomBetween(0, H),
        r:     randomBetween(0.8, 2.5),
        dx:    randomBetween(-0.25, 0.25),
        dy:    randomBetween(-0.4, -0.1),
        alpha: randomBetween(0.2, 0.7),
        color: Math.random() > 0.6 ? '#f5a623' : '#a78bfa',
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      if (p.y < -5)  p.y = H + 5;
      if (p.x < -5)  p.x = W + 5;
      if (p.x > W+5) p.x = -5;
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();
  window.addEventListener('resize', () => { resize(); initParticles(); });
})();

/* ── session storage helpers ── */
function getToken()  { return localStorage.getItem('ccs_token'); }
function getUser()   { return JSON.parse(localStorage.getItem('ccs_user') || 'null'); }
function saveSession(token, user) {
  localStorage.setItem('ccs_token', token);
  localStorage.setItem('ccs_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('ccs_token');
  localStorage.removeItem('ccs_user');
}

/* ── authenticated fetch helper ── */
function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken(),
      ...(options.headers || {}),
    },
  });
}

/* ── current user ── */
let currentUser = getUser();

/* ── page titles ── */
const PAGE_TITLES = {
  home:         'CCS | Home',
  register:     'CCS | Register',
  login:        'CCS | Login',
  profile:      'CCS | Profile',
  admin:        'CCS | Admin Panel',
};

/* ── page switcher ── */
function showPage(pageKey) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageKey);
  if (target) {
    target.classList.add('active');
    document.title = PAGE_TITLES[pageKey] || 'CCS Sit-In Monitoring';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (pageKey === 'profile') loadProfile();
    if (pageKey === 'admin') loadAdminAnnouncements();

    if (pageKey !== 'profile') {
      const editMode = document.getElementById('profileEditMode');
      if (editMode && editMode.style.display !== 'none') {
        toggleEditMode(false);
      }
    }    
  }
}

/* ── go home ── */
function goHome() {
  showPage('home');
  if (currentUser && getToken()) {
    document.getElementById('heroSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = '';
    loadDashboard();
  } else {
    document.getElementById('heroSection').style.display = '';
    document.getElementById('dashboardSection').style.display = 'none';
  }
}

/* ── password visibility toggle ── */
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.toggle-pw');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  const hide = input.type === 'password';
  input.type = hide ? 'text' : 'password';
  btn.querySelector('i').className = hide ? 'bi bi-eye-slash' : 'bi bi-eye';
});

/* ── real-time password match check ── */
document.addEventListener('input', function (e) {
  if (e.target.id !== 'password' && e.target.id !== 'repeatPassword') return;
  const pw1 = document.getElementById('password');
  const pw2 = document.getElementById('repeatPassword');
  const msg = document.getElementById('pwMatchMsg');
  if (!pw1 || !pw2 || !msg) return;
  if (!pw2.value) {
    msg.textContent = '';
    msg.className = 'form-text mt-1';
    return;
  }
  if (pw1.value === pw2.value) {
    msg.textContent = '✓ Passwords match';
    msg.className = 'form-text mt-1 match-ok';
  } else {
    msg.textContent = '✗ Passwords do not match';
    msg.className = 'form-text mt-1 match-err';
  }
});

/* ── form submit handler ── */
document.addEventListener('submit', function (e) {

  /* register */
  if (e.target.id === 'registerForm') {
    e.preventDefault();
    const pw1 = document.getElementById('password').value;
    const pw2 = document.getElementById('repeatPassword').value;
    if (pw1 !== pw2) { alert('Passwords do not match.'); return; }

    const data = {
      idNumber:   document.getElementById('idNumber').value.trim(),
      lastName:   document.getElementById('lastName').value.trim(),
      firstName:  document.getElementById('firstName').value.trim(),
      middleName: document.getElementById('middleName').value.trim(),
      course:     document.getElementById('course').value,
      level:      document.getElementById('courseLevel').value,
      email:      document.getElementById('email').value.trim(),
      address:    document.getElementById('address').value.trim(),
      password:   pw1,
    };

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          alert('Registration successful! Welcome, ' + data.firstName + ' ' + data.lastName + '.');
          e.target.reset();
          document.getElementById('pwMatchMsg').textContent = '';
          showPage('login');
        } else {
          alert(result.message || 'Registration failed.');
        }
      })
      .catch(() => alert('Could not reach the server. Please try again.'));
  }

  /* login */
  if (e.target.id === 'loginForm') {
    e.preventDefault();
    const idNumber = document.getElementById('loginIdNumber').value.trim();
    const password = document.getElementById('loginPassword').value;

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber, password }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          if (result.isAdmin) {
            localStorage.setItem('ccs_admin_token', result.token);
            showPage('admin');
          } else {
            currentUser = result.user;
            saveSession(result.token, result.user);
            updateNavForLoggedIn();
            goHome();
          }
        } else {
          alert(result.message || 'Login failed.');
        }
      })
      .catch(() => alert('Could not reach the server. Please try again.'));
  }

  /* edit profile */
  if (e.target.id === 'editProfileForm') {
    e.preventDefault();
    const updated = {
      lastName:   document.getElementById('eLastName').value.trim(),
      firstName:  document.getElementById('eFirstName').value.trim(),
      middleName: document.getElementById('eMiddleName').value.trim(),
      course:     document.getElementById('eCourse').value,
      level:      document.getElementById('eLevel').value,
      email:      document.getElementById('eEmail').value.trim(),
      address:    document.getElementById('eAddress').value.trim(),
      password:   document.getElementById('ePassword').value,
      photo:      currentUser.photo || null,
    };

    authFetch('/api/profile/update', {
      method: 'POST',
      body: JSON.stringify(updated),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          currentUser = { ...currentUser, ...updated, sessions: result.sessions ?? currentUser.sessions };
          saveSession(getToken(), currentUser);
          updateNavForLoggedIn();

          document.getElementById('editProfileForm').dataset.originalPhoto = currentUser.photo || '';

          loadProfile();
          toggleEditMode(false);
          alert('Profile updated successfully!');
        } else {
          alert(result.message || 'Update failed.');
        }
      })
      .catch(() => alert('Could not reach the server.'));
  }

  /* admin change password */
  if (e.target.id === 'adminChangePasswordForm') {
    e.preventDefault();
    const currentPassword = document.getElementById('adminCurrentPassword').value;
    const newPassword     = document.getElementById('adminNewPassword').value;
    const msgEl           = document.getElementById('adminPwMsg');
    const token           = localStorage.getItem('ccs_admin_token');

    fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          msgEl.style.color = '#198754';
          msgEl.textContent = '✓ Password updated successfully!';
          e.target.reset();
        } else {
          msgEl.style.color = '#dc3545';
          msgEl.textContent = '✗ ' + (result.message || 'Update failed.');
        }
      })
      .catch(() => {
        msgEl.style.color = '#dc3545';
        msgEl.textContent = '✗ Could not reach the server.';
      });
  }
  
  /* announcement form */
  if (e.target.id === 'announcementForm') {
    e.preventDefault();
    const id      = document.getElementById('announcementEditId').value;
    const title   = document.getElementById('announcementTitle').value.trim();
    const content = document.getElementById('announcementContent').value.trim();
    const token   = localStorage.getItem('ccs_admin_token');

    const url    = id ? '/api/admin/announcements/' + id : '/api/admin/announcements';
    const method = id ? 'PUT' : 'POST';

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ title, content }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          cancelAnnouncementEdit();
          loadAdminAnnouncements();
        } else {
          alert(result.message || 'Failed to save announcement.');
        }
      })
      .catch(() => alert('Could not reach the server.'));
  }
});

/* ── nav update after login ── */
function updateNavForLoggedIn() {
  document.getElementById('navLogin').style.display = 'none';
  document.getElementById('navRegisterItem').style.display = 'none';
  document.getElementById('navProfileItem').style.display = '';
  document.getElementById('navLogoutItem').style.display = '';
  document.getElementById('navProfileName').textContent = currentUser.firstName;
}

/* ── logout ── */
function logoutUser() {
  authFetch('/api/logout', { method: 'POST' })
    .finally(() => {
      currentUser = null;
      clearSession();
      document.getElementById('navLogin').style.display = '';
      document.getElementById('navRegisterItem').style.display = '';
      document.getElementById('navProfileItem').style.display = 'none';
      document.getElementById('navLogoutItem').style.display = 'none';
      document.getElementById('heroSection').style.display = '';
      document.getElementById('dashboardSection').style.display = 'none';
      showPage('home');
    });
}

/* ── admin logout ── */
function adminLogout() {
  localStorage.removeItem('ccs_admin_token');
  clearSitInForm();
  showPage('home');
}

window.addEventListener('DOMContentLoaded', function () {
  if (currentUser && getToken()) {
    updateNavForLoggedIn();
    document.getElementById('heroSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = '';
    loadDashboard();
  }

  const photoInput = document.getElementById('photoUpload');
  if (photoInput) {
    photoInput.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = document.getElementById('profilePhotoImg');
        img.src = ev.target.result;
        img.style.display = 'block';
        document.getElementById('profileAvatarInitials').style.display = 'none';
        if (currentUser) {
          currentUser.photo = ev.target.result;
        }
      };
      reader.readAsDataURL(file);
    });
  }
});

/* ── search student (admin) ── */
function searchStudent() {
  const idNumber = document.getElementById('searchIdNumber').value.trim();
  const errorEl  = document.getElementById('searchError');

  if (!idNumber) {
    errorEl.textContent = 'Please enter an ID number.';
    errorEl.style.display = '';
    return;
  }

  errorEl.style.display = 'none';
  const token = localStorage.getItem('ccs_admin_token');

  fetch('/api/admin/search-student?idNumber=' + encodeURIComponent(idNumber), {
    headers: { 'Authorization': 'Bearer ' + token },
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        const s = result.student;
        if (s.sessions <= 0) {
          errorEl.textContent = 'This student has no remaining sessions and cannot sit in.';
          errorEl.style.display = '';
          document.getElementById('sitInCard').style.display = 'none';
          return;
        }
        document.getElementById('sitIdNumber').value  = s.idNumber;
        document.getElementById('sitLastName').value  = s.lastName;
        document.getElementById('sitFirstName').value = s.firstName;
        document.getElementById('sitSessions').value  = s.sessions;
        document.getElementById('sitPurpose').value   = '';
        document.getElementById('sitLab').value       = '';
        document.getElementById('sitInError').style.display = 'none';
        document.getElementById('sitInCard').style.display  = '';
      } else {
        errorEl.textContent = result.message || 'Student not found.';
        errorEl.style.display = '';
        document.getElementById('sitInCard').style.display = 'none';
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

/* ── Enter key triggers search ── */
document.addEventListener('keydown', function (e) {
  const searchInput = document.getElementById('searchIdNumber');
  if (e.key === 'Enter' && searchInput && searchInput === document.activeElement) {
    searchStudent();
  }
});

/* ── clear sit-in form ── */
function clearSitInForm() {
  const s = document.getElementById('searchIdNumber');
  const c = document.getElementById('sitInCard');
  const err = document.getElementById('searchError');
  if (s) s.value = '';
  if (c) c.style.display = 'none';
  if (err) err.style.display = 'none';
}

/* ── load profile page ── */
function loadProfile() {
  if (!currentUser) return;

  document.getElementById('profileFullName').textContent =
    currentUser.firstName + ' ' + currentUser.lastName;
  document.getElementById('profileCourseBadge').textContent =
    currentUser.level + ' — ' + currentUser.course;

  const img      = document.getElementById('profilePhotoImg');
  const initials = document.getElementById('profileAvatarInitials');
  if (currentUser.photo) {
    img.src = currentUser.photo;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.style.display = 'none';
    initials.style.display = '';
    initials.textContent =
      (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
  }

  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const total = itCourses.includes(currentUser.course) ? 30 : 15;
  const remaining = currentUser.sessions !== undefined ? currentUser.sessions : 30;
  document.getElementById('sessionCount').textContent = remaining + ' / ' + total;
  const dotsEl = document.getElementById('sessionDots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'session-dot' + (i >= remaining ? ' used' : '');
    dotsEl.appendChild(dot);
  }

  document.getElementById('vIdNumber').textContent   = currentUser.idNumber;
  document.getElementById('vLastName').textContent   = currentUser.lastName;
  document.getElementById('vFirstName').textContent  = currentUser.firstName;
  document.getElementById('vMiddleName').textContent = currentUser.middleName || '—';
  document.getElementById('vCourseYear').textContent = currentUser.level + ' — ' + currentUser.course;
  document.getElementById('vEmail').textContent      = currentUser.email;
  document.getElementById('vAddress').textContent    = currentUser.address;
}

/* ── toggle edit mode ── */
function toggleEditMode(on) {
  document.getElementById('profileViewMode').style.display = on ? 'none' : '';
  document.getElementById('profileEditMode').style.display = on ? '' : 'none';
  document.getElementById('photoEditLabel').style.display = on ? '' : 'none';
  if (on && currentUser) {
    document.getElementById('editProfileForm').dataset.originalPhoto = currentUser.photo || '';
    document.getElementById('eIdNumber').value   = currentUser.idNumber;
    document.getElementById('eLastName').value   = currentUser.lastName;
    document.getElementById('eFirstName').value  = currentUser.firstName;
    document.getElementById('eMiddleName').value = currentUser.middleName || '';
    document.getElementById('eCourse').value     = currentUser.course;
    document.getElementById('eLevel').value      = currentUser.level;
    document.getElementById('eEmail').value      = currentUser.email;
    document.getElementById('eAddress').value    = currentUser.address;
    document.getElementById('ePassword').value   = '';
  } else {
    // ← restore original photo if cancelled
    const originalPhoto = document.getElementById('editProfileForm').dataset.originalPhoto;
    if (originalPhoto !== undefined && currentUser) {
      currentUser.photo = originalPhoto || null;
      saveSession(getToken(), currentUser);
      const img = document.getElementById('profilePhotoImg');
      const initials = document.getElementById('profileAvatarInitials');
      if (originalPhoto) {
        img.src = originalPhoto;
        img.style.display = 'block';
        initials.style.display = 'none';
      } else {
        img.style.display = 'none';
        initials.style.display = '';
        initials.textContent = (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
      }
    }
  }
}

/* ── load dashboard ── */
function loadDashboard() {
  if (!currentUser) return;

  document.getElementById('dashWelcomeName').textContent = currentUser.firstName;

  // student info
  const img = document.getElementById('dashPhotoImg');
  const initials = document.getElementById('dashAvatarInitials');
  if (currentUser.photo) {
    img.src = currentUser.photo;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.style.display = 'none';
    initials.style.display = '';
    initials.textContent = (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
  }

  document.getElementById('dashFullName').textContent  = currentUser.firstName + ' ' + (currentUser.middleName ? currentUser.middleName + ' ' : '') + currentUser.lastName;
  document.getElementById('dashCourseYear').textContent = currentUser.level + ' — ' + currentUser.course;
  document.getElementById('dashEmail').textContent     = currentUser.email;
  document.getElementById('dashAddress').textContent   = currentUser.address;

  const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
  const total     = itCourses.includes(currentUser.course) ? 30 : 15;
  const remaining = currentUser.sessions !== undefined ? currentUser.sessions : total;
  document.getElementById('dashSessionsCount').textContent = remaining + ' / ' + total;
  const dotsEl = document.getElementById('dashSessionDots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'session-dot' + (i >= remaining ? ' used' : '');
    dotsEl.appendChild(dot);
  }

  // fetch announcements
  authFetch('/api/announcements')
    .then(res => res.json())
    .then(result => {
      const el = document.getElementById('dashAnnouncementsList');
      if (!result.announcements || result.announcements.length === 0) {
        el.innerHTML = '<p class="dash-empty">No announcements yet.</p>';
        return;
      }
      el.innerHTML = result.announcements.map(a => `
        <div class="dash-announcement-item">
          <div class="dash-announcement-title">${a.title}</div>
          <div class="dash-announcement-content">${a.content}</div>
          <div class="dash-announcement-date">${a.created_at}</div>
        </div>
      `).join('');
    })
    .catch(() => {});

  // hardcoded rules
  document.getElementById('dashRulesContent').innerHTML = `
    <div class="dash-rules-content">
      <div style="text-align:center; margin-bottom:0.75rem; line-height:1.6;">
        <strong>University of Cebu</strong><br>
        <strong>COLLEGE OF INFORMATION & COMPUTER STUDIES</strong>
      </div>
      <strong>LABORATORY RULES AND REGULATIONS</strong>
      <div style="margin-top:0.4rem; margin-bottom:0.4rem;">To avoid embarrassment and maintain camaraderie with your friends and superiors at our laboratories, please observe the following:</div>
      <div>1. Maintain silence, proper decorum, and discipline inside the laboratory. Mobile phones, walkmans and other personal pieces of equipment must be switched off.</div>
      <div>2. Games are not allowed inside the lab. This includes computer-related games, card games and other games that may disturb the operation of the lab.</div>
      <div>3. Surfing the Internet is allowed only with the permission of the instructor. Downloading and installing of software are strictly prohibited.</div>
      <div>4. Students are not allowed to use the laboratory for personal purposes during class hours.</div>
      <div>5. Food, and drinks are strictly prohibited inside the laboratory.</div>
      <div>6. Students must take care of the equipment. Any damage due to misuse or negligence will be charged to the responsible student/s.</div>
      <div>7. Chairs must be arranged properly before leaving the laboratory.</div>
      <div>8. Students must log out of all accounts before leaving.</div>
      <div>9. Follow the instructions of the laboratory staff at all times.</div>
    </div>
  `;
}

/* ── toggle dash card (mobile) ── */
function toggleDashCard(bodyId) {
  if (window.innerWidth > 768) return;
  const body    = document.getElementById(bodyId);
  const chevron = document.getElementById('chevron-' + bodyId);
  const isOpen  = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

/* ── load admin announcements list ── */
function loadAdminAnnouncements() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/announcements-admin', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      const el = document.getElementById('adminAnnouncementsList');
      if (!result.announcements || result.announcements.length === 0) {
        el.innerHTML = '<p class="text-muted small">No announcements yet.</p>';
        return;
      }
      el.innerHTML = result.announcements.map(a => `
        <div class="admin-announcement-item">
          <div class="admin-announcement-item-title">${a.title}</div>
          <div class="admin-announcement-item-content">${a.content}</div>
          <div class="admin-announcement-actions">
            <button class="btn-ann-edit" onclick="editAnnouncement(${a.id}, '${encodeURIComponent(a.title)}', '${encodeURIComponent(a.content)}')">
              <i class="bi bi-pencil-fill me-1"></i>Edit
            </button>
            <button class="btn-ann-delete" onclick="deleteAnnouncement(${a.id})">
              <i class="bi bi-trash-fill me-1"></i>Delete
            </button>
          </div>
        </div>
      `).join('');
    })
    .catch(() => {});
}

/* ── edit announcement ── */
function editAnnouncement(id, title, content) {
  document.getElementById('announcementEditId').value    = id;
  document.getElementById('announcementTitle').value     = decodeURIComponent(title);
  document.getElementById('announcementContent').value   = decodeURIComponent(content);
  document.getElementById('announcementSubmitBtn').innerHTML = '<i class="bi bi-check-lg me-1"></i> Save Changes';
  document.getElementById('announcementCancelBtn').style.display = '';
  document.getElementById('announcementTitle').focus();
}

/* ── cancel announcement edit ── */
function cancelAnnouncementEdit() {
  document.getElementById('announcementEditId').value    = '';
  document.getElementById('announcementTitle').value     = '';
  document.getElementById('announcementContent').value   = '';
  document.getElementById('announcementSubmitBtn').innerHTML = '<i class="bi bi-plus-lg me-1"></i> Post Announcement';
  document.getElementById('announcementCancelBtn').style.display = 'none';
}

/* ── delete announcement ── */
function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/announcements/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) loadAdminAnnouncements();
    })
    .catch(() => alert('Could not reach the server.'));
}