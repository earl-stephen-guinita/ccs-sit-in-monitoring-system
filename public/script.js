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
  history:      'CCS | History',
  sitin:        'CCS | Current Sit-In',
  students:     'CCS | Students',
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
    if (pageKey === 'history') loadHistory();
    if (pageKey === 'sitin') loadSitin();
    if (pageKey === 'students') loadStudents();
    if (pageKey === 'reservation') { loadReservationForm(); loadReservations(); }

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
            showAdminNav();
            setAdminNav('admin');
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

  /* sit-in form */
  if (e.target.id === 'sitInForm') {
    e.preventDefault();
    const idNumber  = document.getElementById('sitIdNumber').value;
    const lastName  = document.getElementById('sitLastName').value;
    const firstName = document.getElementById('sitFirstName').value;
    const purpose   = document.getElementById('sitPurpose').value;
    const lab       = document.getElementById('sitLab').value;
    const token     = localStorage.getItem('ccs_admin_token');

    if (!purpose || !lab) {
      document.getElementById('sitInError').textContent = 'Please select a purpose and lab.';
      document.getElementById('sitInError').style.display = '';
      return;
    }

    fetch('/api/admin/sit-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ idNumber, lastName, firstName, purpose, lab }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          alert('Sit-in confirmed! Remaining sessions: ' + result.remainingSessions);
          clearSitInForm();
        } else {
          document.getElementById('sitInError').textContent = result.message || 'Failed to confirm sit-in.';
          document.getElementById('sitInError').style.display = '';
        }
      })
      .catch(() => alert('Could not reach the server.'));
  }
});

/* ── show admin nav items ── */
function showAdminNav() {
  document.getElementById('navHome').style.display = 'none';
  document.getElementById('navCommunity').style.display = 'none';
  document.getElementById('navAbout').style.display = 'none';
  document.getElementById('navRegisterItem').style.display = 'none';
  document.getElementById('navLogin').style.display = 'none';
  document.getElementById('navAdminPanel').style.display = '';
  document.getElementById('navAdminStudents').style.display = '';
  document.getElementById('navAdminSitin').style.display = '';
  document.getElementById('navAdminLogout').style.display = '';
}

/* ── update nav for logged-in student ── */
function updateNavForLoggedIn() {
  document.getElementById('navLogin').style.display = 'none';
  document.getElementById('navRegisterItem').style.display = 'none';
  document.getElementById('navCommunity').style.display = 'none';
  document.getElementById('navAbout').style.display = 'none';
  document.getElementById('navProfileItem').style.display = '';
  document.getElementById('navLogoutItem').style.display = '';
  document.getElementById('navProfileName').textContent = currentUser.firstName;
  document.getElementById('navHistoryItem').style.display = '';
  document.getElementById('navReservationItem').style.display = '';
}

/* ── logout ── */
function logoutUser() {
  authFetch('/api/logout', { method: 'POST' })
    .finally(() => {
      currentUser = null;
      clearSession();
      document.getElementById('navLogin').style.display = '';
      document.getElementById('navRegisterItem').style.display = '';
      document.getElementById('navCommunity').style.display = '';
      document.getElementById('navAbout').style.display = '';
      document.getElementById('navProfileItem').style.display = 'none';
      document.getElementById('navLogoutItem').style.display = 'none';
      document.getElementById('navHistoryItem').style.display = 'none';
      document.getElementById('heroSection').style.display = '';
      document.getElementById('dashboardSection').style.display = 'none';
      document.getElementById('navReservationItem').style.display = 'none';
      showPage('home');
    });
}

/* ── admin logout ── */
function adminLogout() {
  localStorage.removeItem('ccs_admin_token');
  document.getElementById('navHome').style.display = '';
  document.getElementById('navAdminPanel').style.display = 'none';
  document.getElementById('navAdminStudents').style.display = 'none';
  document.getElementById('navAdminSitin').style.display = 'none';
  document.getElementById('navAdminLogout').style.display = 'none';
  document.getElementById('navCommunity').style.display = '';
  document.getElementById('navAbout').style.display = '';
  document.getElementById('navRegisterItem').style.display = '';
  document.getElementById('navLogin').style.display = '';
  clearSitInForm();
  showPage('home');
}

window.addEventListener('DOMContentLoaded', function () {
  const adminToken = localStorage.getItem('ccs_admin_token');
  if (adminToken) {
    fetch('/api/announcements-admin', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          showAdminNav();
          setAdminNav('admin');
          showPage('admin');
        } else {
          localStorage.removeItem('ccs_admin_token');
        }
      })
      .catch(() => localStorage.removeItem('ccs_admin_token'));
  }
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
        if (currentUser) currentUser.photo = ev.target.result;
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

  authFetch('/api/profile')
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        currentUser.sessions = result.user.sessions;
        saveSession(getToken(), currentUser);
      }

      document.getElementById('dashWelcomeName').textContent = currentUser.firstName;

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

      document.getElementById('dashFullName').textContent = currentUser.firstName + ' ' + (currentUser.middleName ? currentUser.middleName + ' ' : '') + currentUser.lastName;
      document.getElementById('dashCourseYear').textContent = currentUser.level + ' — ' + currentUser.course;
      document.getElementById('dashEmail').textContent = currentUser.email;
      document.getElementById('dashAddress').textContent = currentUser.address;

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

      document.getElementById('dashRulesContent').innerHTML = `
        <div class="dash-rules-content">
          <div style="text-align:center; margin-bottom:0.75rem; line-height:1.6;">
            <strong>University of Cebu</strong><br>
            <strong>COLLEGE OF INFORMATION &amp; COMPUTER STUDIES</strong>
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
    })
    .catch(() => {
      document.getElementById('dashWelcomeName').textContent = currentUser.firstName;
    });
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

/* ── history state ── */
let historyData = [];
let historySortKey = 'date';
let historySortDir = 'desc';
let historyPage = 1;

/* ── load history ── */
function loadHistory() {
  authFetch('/api/history')
    .then(res => res.json())
    .then(result => {
      historyData = result.logs || [];
      historyPage = 1;
      renderHistoryTable();
    })
    .catch(() => {});
}

/* ── sort history ── */
function sortHistory(key) {
  if (historySortKey === key) {
    historySortDir = historySortDir === 'asc' ? 'desc' : 'asc';
  } else {
    historySortKey = key;
    historySortDir = 'asc';
  }
  historyPage = 1;
  renderHistoryTable();
}

/* ── render history table ── */
function renderHistoryTable() {
  const pageSize  = parseInt(document.getElementById('historyPageSize').value);
  const search    = document.getElementById('historySearch').value.toLowerCase();

  let filtered = historyData.filter(r => {
    const name = r.first_name + ' ' + r.last_name;
    return (
      r.id_number.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      r.purpose.toLowerCase().includes(search) ||
      r.lab.toLowerCase().includes(search) ||
      (r.date || '').toLowerCase().includes(search)
    );
  });

  filtered.sort((a, b) => {
    let valA, valB;
    if (historySortKey === 'name') {
      valA = a.first_name + ' ' + a.last_name;
      valB = b.first_name + ' ' + b.last_name;
    } else {
      valA = a[historySortKey] || '';
      valB = b[historySortKey] || '';
    }
    if (valA < valB) return historySortDir === 'asc' ? -1 : 1;
    if (valA > valB) return historySortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total   = filtered.length;
  const pages   = Math.max(1, Math.ceil(total / pageSize));
  if (historyPage > pages) historyPage = pages;
  const start   = (historyPage - 1) * pageSize;
  const end     = Math.min(start + pageSize, total);
  const paged   = filtered.slice(start, end);

  document.querySelectorAll('#historyTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths = document.querySelectorAll('#historyTable th');
  const keys = ['id_number', 'name', 'purpose', 'lab', 'login_time', 'logout_time', 'date'];
  keys.forEach((k, i) => {
    if (k === historySortKey) ths[i].querySelector('.sort-btns').classList.add('active');
  });

  const tbody = document.getElementById('historyTableBody');
  if (paged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">No records found.</td></tr>';
  } else {
    tbody.innerHTML = paged.map(r => `
      <tr>
        <td>${r.id_number}</td>
        <td>${r.first_name} ${r.last_name}</td>
        <td>${r.purpose}</td>
        <td>${r.lab}</td>
        <td>${r.login_time || '—'}</td>
        <td>${r.logout_time || '—'}</td>
        <td>${r.date || '—'}</td>
        <td>
          <button class="btn-feedback ${r.feedback ? 'submitted' : ''}"
            onclick="${r.feedback ? '' : 'openFeedback(' + r.id + ')'}"
            ${r.feedback ? 'disabled title="Feedback submitted"' : ''}>
            <i class="bi bi-chat-left-text me-1"></i>${r.feedback ? 'Submitted' : 'Feedback'}
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('historyInfo').textContent =
    total === 0 ? 'Showing 0 to 0 of 0 entries'
    : `Showing ${start + 1} to ${end} of ${total} entries`;

  renderPagination('historyPagination', historyPage, pages, (p) => { historyPage = p; renderHistoryTable(); });
}

/* ── open feedback modal ── */
function openFeedback(logId) {
  document.getElementById('feedbackLogId').value = logId;
  document.getElementById('feedbackText').value = '';
  new bootstrap.Modal(document.getElementById('feedbackModal')).show();
}

/* ── submit feedback ── */
function submitFeedback() {
  const id       = document.getElementById('feedbackLogId').value;
  const feedback = document.getElementById('feedbackText').value.trim();
  if (!feedback) { alert('Please write your feedback first.'); return; }

  authFetch('/api/history/feedback/' + id, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        bootstrap.Modal.getInstance(document.getElementById('feedbackModal')).hide();
        loadHistory();
      } else {
        alert(result.message || 'Failed to submit feedback.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

/* ── admin sit-in state ── */
let sitinData = [];
let sitinSortKey = 'id';
let sitinSortDir = 'desc';
let sitinPage = 1;
let sitinFilter = 'all';

/* ── set admin nav active ── */
function setAdminNav(page) {
  document.getElementById('navAdminPanel').classList.toggle('active', page === 'admin');
  document.getElementById('navAdminStudents').classList.toggle('active', page === 'students');
  document.getElementById('navAdminSitin').classList.toggle('active', page === 'sitin');
}

/* ── set sitin filter ── */
function setSitinFilter(filter) {
  sitinFilter = filter;
  sitinPage = 1;
  document.getElementById('filterAll').classList.toggle('active', filter === 'all');
  document.getElementById('filterActive').classList.toggle('active', filter === 'active');
  document.getElementById('filterDone').classList.toggle('active', filter === 'done');
  renderSitinTable();
}

/* ── load sitin ── */
function loadSitin() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/sitin', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      sitinData = result.logs || [];
      sitinPage = 1;
      renderSitinTable();
    })
    .catch(() => {});
}

/* ── sort sitin ── */
function sortSitin(key) {
  if (sitinSortKey === key) {
    sitinSortDir = sitinSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sitinSortKey = key;
    sitinSortDir = 'asc';
  }
  sitinPage = 1;
  renderSitinTable();
}

/* ── render sitin table ── */
function renderSitinTable() {
  const pageSize = parseInt(document.getElementById('sitinPageSize').value);
  const search   = document.getElementById('sitinSearch').value.toLowerCase();

  let filtered = sitinData.filter(r => {
    const isActive = !r.logout_time;
    if (sitinFilter === 'active' && !isActive) return false;
    if (sitinFilter === 'done' && isActive) return false;
    const name = r.first_name + ' ' + r.last_name;
    return (
      String(r.id).toLowerCase().includes(search) ||
      r.id_number.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      r.purpose.toLowerCase().includes(search) ||
      r.lab.toLowerCase().includes(search)
    );
  });

  filtered.sort((a, b) => {
    let valA, valB;
    if (sitinSortKey === 'name') {
      valA = a.first_name + ' ' + a.last_name;
      valB = b.first_name + ' ' + b.last_name;
    } else if (sitinSortKey === 'status') {
      valA = a.logout_time ? 'done' : 'active';
      valB = b.logout_time ? 'done' : 'active';
    } else {
      valA = a[sitinSortKey] !== undefined ? String(a[sitinSortKey]) : '';
      valB = b[sitinSortKey] !== undefined ? String(b[sitinSortKey]) : '';
    }
    if (valA < valB) return sitinSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sitinSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / pageSize));
  if (sitinPage > pages) sitinPage = pages;
  const start  = (sitinPage - 1) * pageSize;
  const end    = Math.min(start + pageSize, total);
  const paged  = filtered.slice(start, end);

  document.querySelectorAll('#sitinTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#sitinTable th');
  const keys = ['id', 'id_number', 'name', 'purpose', 'lab', 'sessions', 'status'];
  keys.forEach((k, i) => {
    if (k === sitinSortKey) ths[i].querySelector('.sort-btns').classList.add('active');
  });

  const tbody = document.getElementById('sitinTableBody');
  if (paged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">No records found.</td></tr>';
  } else {
    tbody.innerHTML = paged.map(r => {
      const isActive = !r.logout_time;
      return `
        <tr>
          <td>${r.id}</td>
          <td>${r.id_number}</td>
          <td>${r.first_name} ${r.last_name}</td>
          <td>${r.purpose}</td>
          <td>${r.lab}</td>
          <td>${r.sessions_at_sitin !== null && r.sessions_at_sitin !== undefined ? r.sessions_at_sitin : '—'}</td>
          <td>
            <span class="sitin-status ${isActive ? 'active' : 'done'}">
              ${isActive ? 'Active' : 'Done'}
            </span>
          </td>
          <td>
            ${isActive ? `
              <button class="btn-logout-sitin" onclick="adminLogoutSitin(${r.id})">
                <i class="bi bi-box-arrow-right me-1"></i>Logout
              </button>
            ` : '—'}
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('sitinInfo').textContent =
    total === 0 ? 'Showing 0 to 0 of 0 entries'
    : `Showing ${start + 1} to ${end} of ${total} entries`;

  renderPagination('sitinPagination', sitinPage, pages, (p) => { sitinPage = p; renderSitinTable(); });
}

/* ── admin logout student from sit-in ── */
function adminLogoutSitin(id) {
  if (!confirm('Log out this student? This will deduct 1 session.')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/sitin-logout/' + id, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        loadSitin();
      } else {
        alert(result.message || 'Failed to logout student.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

/* ══════════════════════════════════════════════════════
   STUDENTS PAGE
══════════════════════════════════════════════════════ */

let studentsData    = [];
let studentsSortKey = 'name';
let studentsSortDir = 'asc';
let studentsPage    = 1;

/* ── load students ── */
function loadStudents() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/students', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      studentsData = result.students || [];
      studentsPage = 1;
      renderStudentsTable();
    })
    .catch(() => {});
}

/* ── sort students ── */
function sortStudents(key) {
  if (studentsSortKey === key) {
    studentsSortDir = studentsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    studentsSortKey = key;
    studentsSortDir = 'asc';
  }
  studentsPage = 1;
  renderStudentsTable();
}

/* ── render students table ── */
function renderStudentsTable() {
  const pageSize = parseInt(document.getElementById('studentsPageSize').value);
  const search   = document.getElementById('studentsSearch').value.toLowerCase();

  let filtered = studentsData.filter(s => {
    const name = s.first_name + ' ' + s.last_name;
    return (
      s.id_number.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      s.course.toLowerCase().includes(search) ||
      s.year_level.toLowerCase().includes(search)
    );
  });

  filtered.sort((a, b) => {
    let valA, valB;
    if (studentsSortKey === 'name') {
      valA = a.last_name + ' ' + a.first_name;
      valB = b.last_name + ' ' + b.first_name;
    } else if (studentsSortKey === 'sessions') {
      valA = a.sessions;
      valB = b.sessions;
    } else {
      valA = String(a[studentsSortKey] || '');
      valB = String(b[studentsSortKey] || '');
    }
    if (valA < valB) return studentsSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return studentsSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / pageSize));
  if (studentsPage > pages) studentsPage = pages;
  const start  = (studentsPage - 1) * pageSize;
  const end    = Math.min(start + pageSize, total);
  const paged  = filtered.slice(start, end);

  // update sort icons — only 5 sortable columns (Action col has no sort-btns)
  document.querySelectorAll('#studentsTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#studentsTable th');
  const keys = ['id_number', 'name', 'year_level', 'course', 'sessions'];
  keys.forEach((k, i) => {
    if (k === studentsSortKey && ths[i]) ths[i].querySelector('.sort-btns').classList.add('active');
  });

  const tbody = document.getElementById('studentsTableBody');
  if (paged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No students found.</td></tr>';
  } else {
    tbody.innerHTML = paged.map(s => {
      const itCourses = ['BSIT', 'BSCS', 'BSCS-AI'];
      const total_s   = itCourses.includes(s.course) ? 30 : 15;
      const pct       = Math.round((s.sessions / total_s) * 100);
      const barColor  = pct > 50 ? '#198754' : pct > 20 ? '#f5a623' : '#dc3545';
      return `
        <tr>
          <td>${s.id_number}</td>
          <td>${s.last_name}, ${s.first_name}${s.middle_name ? ' ' + s.middle_name : ''}</td>
          <td>${s.year_level}</td>
          <td>${s.course}</td>
          <td>
            <div class="student-session-cell">
              <span class="student-session-count">${s.sessions} / ${total_s}</span>
              <div class="student-session-bar-wrap">
                <div class="student-session-bar-fill" style="width:${pct}%; background:${barColor};"></div>
              </div>
            </div>
          </td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn-student-edit" onclick='openEditStudentModal(${JSON.stringify(s)})'>
                <i class="bi bi-pencil-fill me-1"></i>Edit
              </button>
              <button class="btn-student-delete" onclick="deleteStudent('${s.id_number}')">
                <i class="bi bi-trash-fill me-1"></i>Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('studentsInfo').textContent =
    total === 0 ? 'Showing 0 to 0 of 0 entries'
    : `Showing ${start + 1} to ${end} of ${total} entries`;

  renderPagination('studentsPagination', studentsPage, pages, (p) => { studentsPage = p; renderStudentsTable(); });
}

/* ── open add student modal ── */
function openAddStudentModal() {
  document.getElementById('studentModalTitle').innerHTML = '<i class="bi bi-person-plus-fill me-2"></i>Add Student';
  document.getElementById('studentModalSaveLabel').textContent = 'Add Student';
  document.getElementById('sModalMode').value = 'add';

  document.getElementById('sModalIdNumber').value      = '';
  document.getElementById('sModalIdNumber').readOnly   = false;
  document.getElementById('sModalIdNumber').style.background = '';
  document.getElementById('sModalIdNumber').style.cursor     = '';
  document.getElementById('sModalIdNote').style.display      = 'none';

  document.getElementById('sModalLastName').value    = '';
  document.getElementById('sModalFirstName').value   = '';
  document.getElementById('sModalMiddleName').value  = '';
  document.getElementById('sModalCourse').value      = '';
  document.getElementById('sModalLevel').value       = '';
  document.getElementById('sModalEmail').value       = '';
  document.getElementById('sModalAddress').value     = '';
  document.getElementById('sModalPassword').value    = '';

  document.getElementById('sModalPasswordLabel').innerHTML = 'Password <span class="text-danger">*</span>';
  document.getElementById('sModalPasswordNote').style.display = 'none';
  document.getElementById('studentModalError').style.display  = 'none';

  new bootstrap.Modal(document.getElementById('studentModal')).show();
}

/* ── open edit student modal ── */
function openEditStudentModal(s) {
  document.getElementById('studentModalTitle').innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Edit Student';
  document.getElementById('studentModalSaveLabel').textContent = 'Save Changes';
  document.getElementById('sModalMode').value = 'edit';

  document.getElementById('sModalIdNumber').value      = s.id_number;
  document.getElementById('sModalIdNumber').readOnly   = true;
  document.getElementById('sModalIdNumber').style.background = '#f0e6ff';
  document.getElementById('sModalIdNumber').style.cursor     = 'not-allowed';
  document.getElementById('sModalIdNote').style.display      = '';

  document.getElementById('sModalLastName').value    = s.last_name;
  document.getElementById('sModalFirstName').value   = s.first_name;
  document.getElementById('sModalMiddleName').value  = s.middle_name || '';
  document.getElementById('sModalCourse').value      = s.course;
  document.getElementById('sModalLevel').value       = s.year_level;
  document.getElementById('sModalEmail').value       = s.email;
  document.getElementById('sModalAddress').value     = s.address;
  document.getElementById('sModalPassword').value    = '';

  document.getElementById('sModalPasswordLabel').innerHTML = 'New Password';
  document.getElementById('sModalPasswordNote').style.display = '';
  document.getElementById('studentModalError').style.display  = 'none';

  new bootstrap.Modal(document.getElementById('studentModal')).show();
}

/* ── submit student modal (add or edit) ── */
function submitStudentModal() {
  const mode      = document.getElementById('sModalMode').value;
  const idNumber  = document.getElementById('sModalIdNumber').value.trim();
  const lastName  = document.getElementById('sModalLastName').value.trim();
  const firstName = document.getElementById('sModalFirstName').value.trim();
  const middleName = document.getElementById('sModalMiddleName').value.trim();
  const course    = document.getElementById('sModalCourse').value;
  const level     = document.getElementById('sModalLevel').value;
  const email     = document.getElementById('sModalEmail').value.trim();
  const address   = document.getElementById('sModalAddress').value.trim();
  const password  = document.getElementById('sModalPassword').value;
  const errorEl   = document.getElementById('studentModalError');
  const token     = localStorage.getItem('ccs_admin_token');

  // basic validation
  if (!idNumber || !lastName || !firstName || !course || !level || !email || !address) {
    errorEl.textContent = 'Please fill in all required fields.';
    errorEl.style.display = '';
    return;
  }
  if (mode === 'add' && !password) {
    errorEl.textContent = 'Password is required when adding a student.';
    errorEl.style.display = '';
    return;
  }

  errorEl.style.display = 'none';

  const body = { firstName, lastName, middleName, course, level, email, address, password };

  const url    = mode === 'add' ? '/api/admin/students' : '/api/admin/students/' + idNumber;
  const method = mode === 'add' ? 'POST' : 'PUT';
  if (mode === 'add') body.idNumber = idNumber;

  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body),
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        bootstrap.Modal.getInstance(document.getElementById('studentModal')).hide();
        loadStudents();
      } else {
        errorEl.textContent = result.message || 'Operation failed.';
        errorEl.style.display = '';
      }
    })
    .catch(() => {
      errorEl.textContent = 'Could not reach the server.';
      errorEl.style.display = '';
    });
}

/* ── delete student ── */
function deleteStudent(idNumber) {
  if (!confirm('Delete student ' + idNumber + '? This cannot be undone.')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/students/' + idNumber, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        loadStudents();
      } else {
        alert(result.message || 'Failed to delete student.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

/* ── reset all sessions ── */
function resetAllSessions() {
  if (!confirm('Reset all students\' sessions to their course defaults? This cannot be undone.')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/students/reset-sessions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        alert('All sessions have been reset.');
        loadStudents();
      } else {
        alert(result.message || 'Failed to reset sessions.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

/* ── shared pagination renderer ── */
function renderPagination(containerId, currentPage, pages, onPageClick) {
  const pag = document.getElementById(containerId);
  pag.innerHTML = '';
  const mkBtn = (label, page, disabled, active) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.innerHTML = label;
    btn.disabled = disabled;
    btn.onclick = () => onPageClick(page);
    pag.appendChild(btn);
  };
  mkBtn('&laquo;', 1, currentPage === 1, false);
  mkBtn('&lsaquo;', currentPage - 1, currentPage === 1, false);
  for (let i = 1; i <= pages; i++) {
    if (pages <= 5 || Math.abs(i - currentPage) <= 1 || i === 1 || i === pages) {
      mkBtn(i, i, false, i === currentPage);
    } else if (Math.abs(i - currentPage) === 2) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.cssText = 'padding:0.25rem 0.4rem; color:#aaa; font-size:0.82rem;';
      pag.appendChild(dots);
    }
  }
  mkBtn('&rsaquo;', currentPage + 1, currentPage === pages, false);
  mkBtn('&raquo;', pages, currentPage === pages, false);
}

/* ══════════════════════════════════════════════════════
   RESERVATION PAGE
══════════════════════════════════════════════════════ */
 
/* ── populate reservation form with current user data ── */
function loadReservationForm() {
  if (!currentUser) return;
 
  document.getElementById('resIdNumber').value  = currentUser.idNumber;
  document.getElementById('resLastName').value  = currentUser.lastName;
  document.getElementById('resFirstName').value = currentUser.firstName;
  document.getElementById('resSessions').value  = currentUser.sessions !== undefined ? currentUser.sessions : '—';
 
  // set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('resDate').min = today;
 
  // reset dropdowns and inputs
  document.getElementById('resPurpose').value = '';
  document.getElementById('resLab').value     = '';
  document.getElementById('resTimeIn').value  = '';
  document.getElementById('resDate').value    = '';
 
  // hide alerts
  document.getElementById('resError').style.display   = 'none';
  document.getElementById('resSuccess').style.display = 'none';
}
 
/* ── load and render the student's reservation list ── */
function loadReservations() {
  authFetch('/api/reservations')
    .then(res => res.json())
    .then(result => {
      const tbody = document.getElementById('reservationTableBody');
      const rows  = result.reservations || [];
 
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No reservations yet.</td></tr>';
        return;
      }
 
      tbody.innerHTML = rows.map(r => {
        const canCancel = r.status === 'pending';
        return `
          <tr>
            <td>${r.purpose}</td>
            <td>${r.lab}</td>
            <td>${formatTime(r.time_in)}</td>
            <td>${r.date}</td>
            <td><span class="res-status ${r.status}">${capitalize(r.status)}</span></td>
            <td>
              ${canCancel
                ? `<button class="btn-res-cancel" onclick="cancelReservation(${r.id})">
                     <i class="bi bi-x-circle me-1"></i>Cancel
                   </button>`
                : '—'}
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(() => {});
}
 
/* ── submit reservation ── */
function submitReservation() {
  const purpose = document.getElementById('resPurpose').value;
  const lab     = document.getElementById('resLab').value;
  const timeIn  = document.getElementById('resTimeIn').value;
  const date    = document.getElementById('resDate').value;
  const errEl   = document.getElementById('resError');
  const okEl    = document.getElementById('resSuccess');
 
  errEl.style.display = 'none';
  okEl.style.display  = 'none';
 
  if (!purpose || !lab || !timeIn || !date) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = '';
    return;
  }
 
  // date must not be in the past
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    errEl.textContent = 'Please select today or a future date.';
    errEl.style.display = '';
    return;
  }
 
  authFetch('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ purpose, lab, timeIn, date }),
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        okEl.textContent = '✓ Reservation submitted! Please wait for admin approval.';
        okEl.style.display = '';
        // reset editable fields
        document.getElementById('resPurpose').value = '';
        document.getElementById('resLab').value     = '';
        document.getElementById('resTimeIn').value  = '';
        document.getElementById('resDate').value    = '';
        loadReservations();
      } else {
        errEl.textContent = result.message || 'Failed to submit reservation.';
        errEl.style.display = '';
      }
    })
    .catch(() => {
      errEl.textContent = 'Could not reach the server.';
      errEl.style.display = '';
    });
}
 
/* ── cancel a pending reservation ── */
function cancelReservation(id) {
  if (!confirm('Cancel this reservation?')) return;
 
  authFetch('/api/reservations/' + id, { method: 'DELETE' })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        loadReservations();
      } else {
        alert(result.message || 'Failed to cancel reservation.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}
 
/* ── helper: format 24h time to 12h ── */
function formatTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
 
/* ── helper: capitalize first letter ── */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}