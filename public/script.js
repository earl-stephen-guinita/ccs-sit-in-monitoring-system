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
  home:              'CCS | Home',
  register:          'CCS | Register',
  login:             'CCS | Login',
  profile:           'CCS | Profile',
  admin:             'CCS | Admin Panel',
  history:           'CCS | History',
  sitin:             'CCS | Current Sit-In',
  students:          'CCS | Students',
  adminreservations: 'CCS | Reservations',
  adminfeedback:     'CCS | Feedback Reports',
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
    if (pageKey === 'admin') { loadAdminAnnouncements(); loadAdminStats(); }
    if (pageKey === 'history') loadHistory();
    if (pageKey !== 'history') _stopLiveDuration();
    if (pageKey === 'sitin') loadSitin();
    if (pageKey === 'students') loadStudents();
    if (pageKey === 'reservation') { loadReservationForm(); loadReservations(); }
    if (pageKey === 'adminreservations') loadAdminReservations();
    if (pageKey === 'adminfeedback') loadFeedbackReport();
    if (pageKey === 'records') loadRecords();

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

    // read file as base64 if attached
    const fileInput = document.getElementById('annFileInput');
    const file      = fileInput && fileInput.files[0];

    const doSubmit = (attachment) => {
      const url    = id ? '/api/admin/announcements/' + id : '/api/admin/announcements';
      const method = id ? 'PUT' : 'POST';

      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ title, content, attachment }),
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
    };

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File is too large. Maximum size is 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        doSubmit({ name: file.name, type: file.type, data: ev.target.result });
      };
      reader.readAsDataURL(file);
    } else {
      doSubmit(null);
    }
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
  document.getElementById('navAdminReservations').style.display = '';
  document.getElementById('navAdminFeedback').style.display = '';
  const recNav = document.getElementById('navAdminRecords');
  if (recNav) recNav.style.display = '';
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
  document.getElementById('navAdminReservations').style.display = 'none';  
  document.getElementById('navAdminFeedback').style.display = 'none';
  const recNav = document.getElementById('navAdminRecords');
  if (recNav) recNav.style.display = 'none';
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

  const adminToken2 = localStorage.getItem('ccs_admin_token');
  if (adminToken2) {
    const recNav = document.getElementById('navAdminRecords');
    if (recNav) recNav.style.display = '';
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
      const el    = document.getElementById('adminAnnouncementsList');
      const badge = document.getElementById('adminAnnCount');
      const list  = result.announcements || [];

      // update count badge
      if (badge) {
        if (list.length > 0) {
          badge.textContent   = list.length;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }

      if (list.length === 0) {
        el.innerHTML = '<p class="text-muted small px-2 py-2 mb-0">No announcements yet.</p>';
        return;
      }
      el.innerHTML = list.map(a => `
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

/* ── load admin dashboard stats + pie chart ── */
function loadAdminStats() {
  const token = localStorage.getItem('ccs_admin_token');

  // fetch students count
  fetch('/api/admin/students', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(res => res.json())
    .then(result => {
      document.getElementById('statStudentsRegistered').textContent =
        result.students ? result.students.length : '0';
    })
    .catch(() => {});

  // fetch sit-in logs for active count, total count, and pie data
  fetch('/api/admin/sitin', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(res => res.json())
    .then(result => {
      const logs = result.logs || [];
      const active = logs.filter(l => !l.logout_time).length;
      document.getElementById('statCurrentSitin').textContent = active;
      document.getElementById('statTotalSitin').textContent   = logs.length;

      // tally by purpose
      const tally = {};
      for (const log of logs) {
        tally[log.purpose] = (tally[log.purpose] || 0) + 1;
      }

      const labels  = Object.keys(tally);
      const counts  = Object.values(tally);
      const palette = ['#7c3aed','#f5a623','#10b981','#3b82f6','#ef4444','#a855f7'];

      // draw pie chart on canvas
      const canvas = document.getElementById('adminPieChart');
      const ctx    = canvas.getContext('2d');
      const total  = counts.reduce((a, b) => a + b, 0);
      let startAngle = -Math.PI / 2;

      ctx.clearRect(0, 0, 220, 220);

      if (total === 0) {
        ctx.beginPath();
        ctx.arc(110, 110, 90, 0, Math.PI * 2);
        ctx.fillStyle = '#e8d8ff';
        ctx.fill();
        ctx.fillStyle = '#9b72cf';
        ctx.font = '600 13px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', 110, 115);
      } else {
        labels.forEach((label, i) => {
          const slice = (counts[i] / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(110, 110);
          ctx.arc(110, 110, 90, startAngle, startAngle + slice);
          ctx.closePath();
          ctx.fillStyle = palette[i % palette.length];
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
          startAngle += slice;
        });

        // center hole (donut)
        ctx.beginPath();
        ctx.arc(110, 110, 48, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.fillStyle = '#2d0f5e';
        ctx.font = '800 22px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(total, 110, 118);
      }

      // legend
      const legendEl = document.getElementById('adminPieLegend');
      if (total === 0) {
        legendEl.innerHTML = '<p class="text-muted small text-center">No sit-in records yet.</p>';
      } else {
        legendEl.innerHTML = labels.map((label, i) => `
          <div class="pie-legend-item">
            <div class="pie-legend-dot" style="background:${palette[i % palette.length]};"></div>
            <span>${label}</span>
            <span class="pie-legend-count">${counts[i]}</span>
          </div>
        `).join('');
      }
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
  removeAnnFile(); 
}

/* ── announcement file attachment ── */
let _annFileData = null;

document.addEventListener('DOMContentLoaded', function () {
  const drop  = document.getElementById('annFileDrop');
  const input = document.getElementById('annFileInput');
  if (!drop || !input) return;

  input.addEventListener('change', () => {
    if (input.files[0]) _handleAnnFile(input.files[0]);
  });

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) _handleAnnFile(file);
  });
}, { once: false });

function _handleAnnFile(file) {
  if (file.size > 5 * 1024 * 1024) { alert('File too large. Max 5MB.'); return; }
  _annFileData = file;
  // update the hidden input so the submit handler can read it
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('annFileInput').files = dt.files;
  // show preview
  document.getElementById('annFileDrop').style.display    = 'none';
  document.getElementById('annFilePreview').style.display = '';
  document.getElementById('annFileName').textContent      = file.name;
}

function removeAnnFile() {
  _annFileData = null;
  document.getElementById('annFileInput').value           = '';
  document.getElementById('annFileDrop').style.display    = '';
  document.getElementById('annFilePreview').style.display = 'none';
  document.getElementById('annFileName').textContent      = '';
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

/* ── toggle admin posted announcements collapse ── */
function toggleAdminAnnList() {
  const collapse = document.getElementById('adminAnnouncementsCollapse');
  const chevron  = document.getElementById('adminAnnChevron');
  const isOpen   = collapse.classList.contains('open');
  collapse.classList.toggle('open', !isOpen);
  chevron.classList.toggle('open', !isOpen);
}

/* ── history state ── */
let historyData = [];
let historySortKey = 'date';
let historySortDir = 'desc';
let historyPage = 1;

/* ── live duration ticker ── */
let _liveDurationTimer = null;

function _stopLiveDuration() {
  if (_liveDurationTimer) { clearInterval(_liveDurationTimer); _liveDurationTimer = null; }
}

function _msToHMS(ms) {
  if (ms < 0) ms = 0;
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function _msToHMShort(ms) {
  if (ms < 0) ms = 0;
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function _parseSQLiteDateTime(str) {
  if (!str) return null;
  return new Date(str.replace(' ', 'T'));
}

/* ── render sessions table + summary ── */
function renderSessionsAndSummary(logs) {
  _stopLiveDuration();

  const tbody = document.getElementById('sessionsTableBody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No sessions yet.</td></tr>';
    document.getElementById('summaryTotalHours').textContent   = '0h 0m';
    document.getElementById('summaryNumSessions').textContent  = '0';
    document.getElementById('summaryAvgDuration').textContent  = '—';
    document.getElementById('summaryLongest').textContent      = '—';
    return;
  }

  // sort newest first
  const sorted = [...logs].sort((a, b) => {
    const da = _parseSQLiteDateTime(a.login_time) || 0;
    const db2 = _parseSQLiteDateTime(b.login_time) || 0;
    return db2 - da;
  });

  function buildRows() {
    const now = new Date();
    tbody.innerHTML = sorted.map(r => {
      const loginDt  = _parseSQLiteDateTime(r.login_time);
      const logoutDt = _parseSQLiteDateTime(r.logout_time);
      const isActive = !r.logout_time;

      let durationStr, statusHtml;
      if (isActive) {
        const ms = loginDt ? now - loginDt : 0;
        durationStr = `<span class="duration-live" data-login="${r.login_time}">` +
                      _msToHMS(ms) + `</span>`;
        statusHtml  = '<span class="sitin-status active">Active</span>';
      } else {
        const ms = (loginDt && logoutDt) ? logoutDt - loginDt : 0;
        durationStr = _msToHMShort(ms);
        statusHtml  = '<span class="sitin-status done">Done</span>';
      }

      const timeIn  = loginDt  ? loginDt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—';
      const timeOut = logoutDt ? logoutDt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—';
      const dateFmt = r.date || '—';
      const pcNo    = r.pc_number ? 'PC ' + r.pc_number : '—';
      const lab     = r.lab || '—';

      return `<tr>
        <td>${dateFmt}</td>
        <td>${timeIn}</td>
        <td>${timeOut}</td>
        <td>${durationStr}</td>
        <td>${pcNo}</td>
        <td>${lab}</td>
        <td>${statusHtml}</td>
      </tr>`;
    }).join('');
  }

  buildRows();

  // tick live durations every second
  const hasActive = sorted.some(r => !r.logout_time);
  if (hasActive) {
    _liveDurationTimer = setInterval(() => {
      const now = new Date();
      document.querySelectorAll('.duration-live[data-login]').forEach(el => {
        const loginDt = _parseSQLiteDateTime(el.dataset.login);
        if (loginDt) el.textContent = _msToHMS(now - loginDt);
      });
    }, 1000);
  }

  // ── compute summary ──
  let totalMs   = 0;
  let longestMs = 0;
  let counted   = 0;
  const now = new Date();

  sorted.forEach(r => {
    const loginDt  = _parseSQLiteDateTime(r.login_time);
    const logoutDt = _parseSQLiteDateTime(r.logout_time);
    const ms = loginDt
      ? (logoutDt ? logoutDt - loginDt : now - loginDt)
      : 0;
    totalMs += ms;
    if (ms > longestMs) longestMs = ms;
    counted++;
  });

  const avgMs = counted > 0 ? totalMs / counted : 0;

  document.getElementById('summaryTotalHours').textContent   = _msToHMShort(totalMs);
  document.getElementById('summaryNumSessions').textContent  = counted;
  document.getElementById('summaryAvgDuration').textContent  = counted > 0 ? _msToHMShort(avgMs) : '—';
  document.getElementById('summaryLongest').textContent      = longestMs > 0 ? _msToHMShort(longestMs) : '—';
}

/* ── load history ── */
function loadHistory() {
  _stopLiveDuration();
  authFetch('/api/history')
    .then(res => res.json())
    .then(result => {
      historyData = result.logs || [];
      historyPage = 1;
      renderSessionsAndSummary(historyData);
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
  const keys = ['id_number', 'name', 'purpose', 'lab', 'pc_number', 'login_time', 'logout_time', 'date'];
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
        <td>${r.pc_number || '—'}</td>
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

/* ── profanity word list (client-side pre-check) ── */
const CLIENT_BANNED = [
  'fuck','shit','bitch','asshole','bastard','crap','piss','dick','cock',
  'pussy','cunt','whore','slut','faggot','nigger','nigga','retard','motherfucker',
  'bullshit','jackass','dumbass','ass','puta','putang','putangina','gago','bobo',
  'tanga','ulol','hindot','pakyu','pakingshet','leche','kupal','tarantado',
  'hayop','bwisit','lintik','supot','bilat','betlog','burat','suso','kantot',
  'tangina','shet','wtf','kys',
];

function clientHasProfanity(text) {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (CLIENT_BANNED.includes(word)) return true;
    for (const banned of CLIENT_BANNED) {
      if (banned.length >= 5 && word.includes(banned)) return true;
    }
  }
  return false;
}

/* ── submit feedback ── */
function submitFeedback() {
  const id       = document.getElementById('feedbackLogId').value;
  const feedback = document.getElementById('feedbackText').value.trim();
  if (!feedback) { alert('Please write your feedback first.'); return; }

  if (clientHasProfanity(feedback)) {
    document.getElementById('feedbackText').classList.add('is-invalid');
    const existing = document.getElementById('feedbackProfanityMsg');
    if (!existing) {
      const msg = document.createElement('div');
      msg.id = 'feedbackProfanityMsg';
      msg.className = 'invalid-feedback d-block';
      msg.textContent = '⚠ Your feedback contains inappropriate language. Please keep it respectful.';
      document.getElementById('feedbackText').insertAdjacentElement('afterend', msg);
    }
    return;
  }

  // clear any previous error
  document.getElementById('feedbackText').classList.remove('is-invalid');
  const errMsg = document.getElementById('feedbackProfanityMsg');
  if (errMsg) errMsg.remove();

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
  document.getElementById('navAdminReservations').classList.toggle('active', page === 'adminreservations');
  document.getElementById('navAdminFeedback').classList.toggle('active', page === 'adminfeedback');
  const recNav = document.getElementById('navAdminRecords');
  if (recNav) recNav.classList.toggle('active', page === 'records');
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
  const keys = ['id', 'id_number', 'name', 'purpose', 'lab', 'pc_number', 'sessions', 'status'];
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
          <td>${r.pc_number || '—'}</td>
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
let selectedPcNumber = null;

function loadReservationForm() {
  if (!currentUser) return;

  document.getElementById('resIdNumber').value  = currentUser.idNumber;
  document.getElementById('resLastName').value  = currentUser.lastName;
  document.getElementById('resFirstName').value = currentUser.firstName;
  document.getElementById('resSessions').value  = currentUser.sessions !== undefined ? currentUser.sessions : '—';

  // block Sundays — set min to today
  const today = new Date();
  document.getElementById('resDate').min = today.toISOString().split('T')[0];

  // reset fields
  document.getElementById('resPurpose').value = '';
  document.getElementById('resLab').value     = '';
  document.getElementById('resTimeIn').value  = '';
  document.getElementById('resDate').value    = '';
  document.getElementById('resError').style.display   = 'none';
  document.getElementById('resSuccess').style.display = 'none';
  document.getElementById('pcGridSection').style.display = 'none';
  document.getElementById('selectedPcInfo').style.display = 'none';
  selectedPcNumber = null;
}

function onResFieldChange() {
  const lab    = document.getElementById('resLab').value;
  const date   = document.getElementById('resDate').value;
  const timeIn = document.getElementById('resTimeIn').value;

  // validate Sunday
  if (date) {
    const day = new Date(date + 'T00:00:00').getDay();
    if (day === 0) {
      document.getElementById('resError').textContent = 'Reservations are not allowed on Sundays.';
      document.getElementById('resError').style.display = '';
      document.getElementById('pcGridSection').style.display = 'none';
      return;
    }
    document.getElementById('resError').style.display = 'none';
  }

  if (lab && date && timeIn) {
    loadPcGrid(lab, date, timeIn);
  } else {
    document.getElementById('pcGridSection').style.display = 'none';
    selectedPcNumber = null;
  }
}

function loadPcGrid(lab, date, timeIn) {
  const section = document.getElementById('pcGridSection');
  const grid    = document.getElementById('pcGrid');
  const loading = document.getElementById('pcGridLoading');

  section.style.display = '';
  grid.innerHTML = '';
  loading.style.display = '';
  selectedPcNumber = null;
  document.getElementById('selectedPcInfo').style.display = 'none';

  authFetch(`/api/lab-pcs?lab=${encodeURIComponent(lab)}&date=${encodeURIComponent(date)}&timeIn=${encodeURIComponent(timeIn)}`)
    .then(res => res.json())
    .then(result => {
      loading.style.display = 'none';
      if (!result.success) return;

      grid.innerHTML = result.pcs.map(pc => `
        <div class="pc-cell ${pc.effectiveStatus}"
             id="pc-cell-${pc.pc_number}"
             onclick="${pc.effectiveStatus === 'available' ? `selectPc(${pc.pc_number})` : ''}"
             title="PC ${pc.pc_number} — ${pc.effectiveStatus}">
          <i class="bi bi-display"></i>
          <span>${pc.pc_number}</span>
        </div>
      `).join('');
    })
    .catch(() => { loading.style.display = 'none'; });
}

function selectPc(pcNumber) {
  // deselect previous
  document.querySelectorAll('.pc-cell.selected').forEach(el => {
    el.classList.remove('selected');
    el.classList.add('available');
  });

  const cell = document.getElementById(`pc-cell-${pcNumber}`);
  if (cell) {
    cell.classList.remove('available');
    cell.classList.add('selected');
  }

  selectedPcNumber = pcNumber;
  const info = document.getElementById('selectedPcInfo');
  const label = document.getElementById('selectedPcLabel');
  label.textContent = `PC ${pcNumber} — Lab ${document.getElementById('resLab').value}`;
  info.style.display = '';
}
 
// ── student reservations sort state ──
let studentResData    = [];
let studentResSortKey = 'date';
let studentResSortDir = 'desc';

function sortStudentRes(key) {
  if (studentResSortKey === key) {
    studentResSortDir = studentResSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    studentResSortKey = key;
    studentResSortDir = 'asc';
  }
  renderReservationsTable();
}

function loadReservations() {
  authFetch('/api/reservations')
    .then(res => res.json())
    .then(result => {
      studentResData = result.reservations || [];
      renderReservationsTable();
    })
    .catch(() => {});
}

function renderReservationsTable() {
  const tbody = document.getElementById('reservationTableBody');

  // sort
  const sorted = [...studentResData].sort((a, b) => {
    let valA = a[studentResSortKey] !== undefined ? String(a[studentResSortKey] ?? '') : '';
    let valB = b[studentResSortKey] !== undefined ? String(b[studentResSortKey] ?? '') : '';
    if (valA < valB) return studentResSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return studentResSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // update sort icons
  document.querySelectorAll('#reservationTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#reservationTable th');
  const keys = ['purpose', 'pc_number', 'lab', 'time_in', 'date', 'status'];
  keys.forEach((k, i) => {
    if (k === studentResSortKey && ths[i]) ths[i].querySelector('.sort-btns')?.classList.add('active');
  });

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No reservations yet.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(r => {
    const canCancel = r.status === 'pending';
    return `
      <tr>
        <td>${r.purpose}</td>
        <td>${r.pc_number ? 'PC ' + r.pc_number : '—'}</td>
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

  if (!selectedPcNumber) {
    errEl.textContent = 'Please select a PC from the grid.';
    errEl.style.display = '';
    return;
  }

  // block Sundays
  const day = new Date(date + 'T00:00:00').getDay();
  if (day === 0) {
    errEl.textContent = 'Reservations are not allowed on Sundays.';
    errEl.style.display = '';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    errEl.textContent = 'Please select today or a future date.';
    errEl.style.display = '';
    return;
  }

  authFetch('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({ purpose, lab, timeIn, date, pcNumber: selectedPcNumber }),
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        okEl.textContent = `✓ PC ${selectedPcNumber} reserved! Waiting for admin approval.`;
        okEl.style.display = '';
        selectedPcNumber = null;
        document.getElementById('resPurpose').value = '';
        document.getElementById('resLab').value     = '';
        document.getElementById('resTimeIn').value  = '';
        document.getElementById('resDate').value    = '';
        document.getElementById('pcGridSection').style.display = 'none';
        document.getElementById('selectedPcInfo').style.display = 'none';
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

let adminResFilter = 'all';
let adminResData   = [];

function loadAdminReservations() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/reservations', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      adminResData = result.reservations || [];
      renderAdminReservationsTable();
    })
    .catch(() => {});
}

// ── admin reservations sort state ──
let adminResSortKey = 'date';
let adminResSortDir = 'desc';

function sortAdminRes(key) {
  if (adminResSortKey === key) {
    adminResSortDir = adminResSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    adminResSortKey = key;
    adminResSortDir = 'asc';
  }
  renderAdminReservationsTable();
}

function setResFilter(filter) {
  adminResFilter = filter;
  ['All','Pending','Approved','Rejected'].forEach(f => {
    document.getElementById('resFilter' + f).classList.toggle('active', filter === f.toLowerCase());
  });
  renderAdminReservationsTable();
}

function renderAdminReservationsTable() {
  let filtered = adminResFilter === 'all'
    ? adminResData
    : adminResData.filter(r => r.status === adminResFilter);

  // sort
  filtered = [...filtered].sort((a, b) => {
    let valA, valB;
    if (adminResSortKey === 'name') {
      valA = a.first_name + ' ' + a.last_name;
      valB = b.first_name + ' ' + b.last_name;
    } else {
      valA = a[adminResSortKey] !== undefined ? String(a[adminResSortKey] ?? '') : '';
      valB = b[adminResSortKey] !== undefined ? String(b[adminResSortKey] ?? '') : '';
    }
    if (valA < valB) return adminResSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return adminResSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // update sort icons
  document.querySelectorAll('#adminReservationsTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#adminReservationsTable th');
  const keys = ['id_number', 'name', 'purpose', 'lab', 'pc_number', 'time_in', 'date', 'status'];
  keys.forEach((k, i) => {
    if (k === adminResSortKey && ths[i]) ths[i].querySelector('.sort-btns')?.classList.add('active');
  });

  const tbody = document.getElementById('adminReservationsTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">No reservations found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.id_number}</td>
      <td>${r.first_name} ${r.last_name}</td>
      <td>${r.purpose}</td>
      <td>${r.lab}</td>
      <td>${r.pc_number ? 'PC ' + r.pc_number : '—'}</td>
      <td>${formatTime(r.time_in)}</td>
      <td>${r.date}</td>
      <td><span class="res-status ${r.status}">${capitalize(r.status)}</span></td>
      <td>
        ${r.status === 'pending' ? `
          <div class="d-flex gap-1">
            <button class="btn-student-edit" onclick="approveReservation(${r.id})">
              <i class="bi bi-check-lg me-1"></i>Approve
            </button>
            <button class="btn-student-delete" onclick="rejectReservation(${r.id})">
              <i class="bi bi-x-lg me-1"></i>Reject
            </button>
          </div>
        ` : '—'}
      </td>
    </tr>
  `).join('');
}

function approveReservation(id) {
  if (!confirm('Approve this reservation?')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/reservations/' + id + '/approve', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) loadAdminReservations();
      else alert(result.message || 'Failed to approve.');
    })
    .catch(() => alert('Could not reach the server.'));
}

function rejectReservation(id) {
  if (!confirm('Reject this reservation?')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/reservations/' + id + '/reject', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) loadAdminReservations();
      else alert(result.message || 'Failed to reject.');
    })
    .catch(() => alert('Could not reach the server.'));
}

/* =====================================================
   NOTIFICATION SYSTEM — append to script.js
   ===================================================== */

let notifPanelOpen  = false;
let notifPollTimer  = null;
const NOTIF_POLL_MS = 30000; // poll every 30 s

/* ── show bell in nav when student logs in ──────────── */
/* Call this inside updateNavForLoggedIn() — already patched below via init */

/* ── toggle the side panel ── */
function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  const panel   = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');

  if (notifPanelOpen) {
    panel.style.display   = 'flex';
    overlay.style.display = '';
    loadNotifications();
  } else {
    panel.style.display   = 'none';
    overlay.style.display = 'none';
  }
}

/* ── fetch notifications from server ── */
function loadNotifications() {
  if (!currentUser || !getToken()) return;

  authFetch('/api/notifications')
    .then(res => res.json())
    .then(result => {
      if (!result.success) return;
      updateNotifBadge(result.unreadCount);
      renderNotifPanel(result.notifications);
    })
    .catch(() => {});
}

/* ── update the red badge number ── */
function updateNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/* ── render items inside the panel ── */
function renderNotifPanel(notifications) {
  const body = document.getElementById('notifPanelBody');
  if (!notifications || notifications.length === 0) {
    body.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
    return;
  }

  body.innerHTML = notifications.map(n => {
    const iconClass = n.type === 'announcement'
      ? 'announcement'
      : n.type === 'reservation_approved'
        ? 'approved'
        : 'rejected';

    const iconSymbol = n.type === 'announcement'
      ? '<i class="bi bi-megaphone-fill"></i>'
      : n.type === 'reservation_approved'
        ? '<i class="bi bi-check-circle-fill"></i>'
        : '<i class="bi bi-x-circle-fill"></i>';

    return `
      <div class="notif-item ${n.is_read ? '' : 'unread'}"
           id="notif-${n.id}"
           onclick="markNotifRead(${n.id})">
        ${!n.is_read ? '<div class="notif-unread-dot"></div>' : '<div style="width:8px;flex-shrink:0;"></div>'}
        <div class="notif-icon ${iconClass}">${iconSymbol}</div>
        <div class="notif-content">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          <div class="notif-message">${escapeHtml(n.message)}</div>
          <div class="notif-time">${formatRelativeTime(n.created_at)}</div>
        </div>
        <button class="notif-delete-btn" title="Delete"
                onclick="deleteNotif(event, ${n.id})">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `;
  }).join('');
}

/* ── mark single notification as read ── */
function markNotifRead(id) {
  authFetch(`/api/notifications/${id}/read`, { method: 'PUT' })
    .then(res => res.json())
    .then(() => loadNotifications())
    .catch(() => {});
}

/* ── mark all as read ── */
function markAllNotifsRead() {
  authFetch('/api/notifications/read-all', { method: 'PUT' })
    .then(res => res.json())
    .then(() => loadNotifications())
    .catch(() => {});
}

/* ── delete a single notification ── */
function deleteNotif(e, id) {
  e.stopPropagation(); // don't fire markNotifRead
  authFetch(`/api/notifications/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(() => loadNotifications())
    .catch(() => {});
}

/* ── clear all notifications ── */
function clearAllNotifs() {
  if (!confirm('Clear all notifications?')) return;
  authFetch('/api/notifications', { method: 'DELETE' })
    .then(res => res.json())
    .then(() => loadNotifications())
    .catch(() => {});
}

/* ── start polling for unread count ── */
function startNotifPolling() {
  stopNotifPolling();
  loadNotifications(); // immediate first load
  notifPollTimer = setInterval(loadNotifications, NOTIF_POLL_MS);
}

/* ── stop polling ── */
function stopNotifPolling() {
  if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
}

/* ── helper: escape HTML to avoid XSS ── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── helper: relative time (e.g. "2 min ago") ── */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now  = new Date();
  const then = new Date(dateStr.replace(' ', 'T')); // SQLite uses space separator
  const diff = Math.floor((now - then) / 1000);     // seconds

  if (isNaN(diff) || diff < 0) return dateStr;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
  if (diff < 604800) return Math.floor(diff / 86400) + ' day' + (Math.floor(diff / 86400) > 1 ? 's' : '') + ' ago';
  return then.toLocaleDateString();
}

/* =====================================================
   PATCH existing functions to wire up notifications
   ===================================================== */

/* Override updateNavForLoggedIn to also show bell + start polling */
const _origUpdateNavForLoggedIn = updateNavForLoggedIn;
updateNavForLoggedIn = function () {
  _origUpdateNavForLoggedIn();
  const bellItem = document.getElementById('navNotificationItem');
  if (bellItem) bellItem.style.display = '';
  startNotifPolling();
};

/* Override logoutUser to hide bell + stop polling */
const _origLogoutUser = logoutUser;
logoutUser = function () {
  stopNotifPolling();
  const bellItem = document.getElementById('navNotificationItem');
  if (bellItem) bellItem.style.display = 'none';
  updateNotifBadge(0);
  // close panel if open
  if (notifPanelOpen) toggleNotifPanel();
  _origLogoutUser();
};

/* On DOMContentLoaded, if already logged in, start polling */
document.addEventListener('DOMContentLoaded', function () {
  if (currentUser && getToken()) {
    const bellItem = document.getElementById('navNotificationItem');
    if (bellItem) bellItem.style.display = '';
    startNotifPolling();
  }
}, { once: false }); // runs after the existing DOMContentLoaded in script.js

/* ══════════════════════════════════════════════════════
   ADMIN FEEDBACK REPORTS
══════════════════════════════════════════════════════ */

let feedbackData    = [];
let feedbackSortKey = 'date';
let feedbackSortDir = 'desc';
let feedbackPage    = 1;

function loadFeedbackReport() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/feedback', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      feedbackData = result.logs || [];
      feedbackPage = 1;
      renderFeedbackTable();
    })
    .catch(() => {});
}

function sortFeedback(key) {
  if (feedbackSortKey === key) {
    feedbackSortDir = feedbackSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    feedbackSortKey = key;
    feedbackSortDir = 'asc';
  }
  feedbackPage = 1;
  renderFeedbackTable();
}

function renderFeedbackTable() {
  const pageSize = parseInt(document.getElementById('feedbackPageSize').value);
  const search   = document.getElementById('feedbackSearch').value.toLowerCase();

  let filtered = feedbackData.filter(r => {
    const name = r.first_name + ' ' + r.last_name;
    return (
      r.id_number.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      r.lab.toLowerCase().includes(search) ||
      (r.date || '').toLowerCase().includes(search) ||
      (r.feedback || '').toLowerCase().includes(search)
    );
  });

  filtered.sort((a, b) => {
    let valA, valB;
    if (feedbackSortKey === 'name') {
      valA = a.first_name + ' ' + a.last_name;
      valB = b.first_name + ' ' + b.last_name;
    } else {
      valA = a[feedbackSortKey] || '';
      valB = b[feedbackSortKey] || '';
    }
    if (valA < valB) return feedbackSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return feedbackSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / pageSize));
  if (feedbackPage > pages) feedbackPage = pages;
  const start  = (feedbackPage - 1) * pageSize;
  const end    = Math.min(start + pageSize, total);
  const paged  = filtered.slice(start, end);

  document.querySelectorAll('#feedbackTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#feedbackTable th');
  const keys = ['id_number', 'name', 'lab', 'date', 'feedback'];
  keys.forEach((k, i) => {
    if (k === feedbackSortKey && ths[i]) ths[i].querySelector('.sort-btns').classList.add('active');
  });

  const tbody = document.getElementById('feedbackTableBody');
  if (paged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No feedback found.</td></tr>';
  } else {
    tbody.innerHTML = paged.map(r => `
      <tr>
        <td>${r.id_number}</td>
        <td>${r.first_name} ${r.last_name}</td>
        <td>${r.lab}</td>
        <td>${r.date || '—'}</td>
        <td class="feedback-message-cell">${r.feedback}</td>
      </tr>
    `).join('');
  }

  document.getElementById('feedbackInfo').textContent =
    total === 0 ? 'Showing 0 to 0 of 0 entries'
    : `Showing ${start + 1} to ${end} of ${total} entries`;

  renderPagination('feedbackPagination', feedbackPage, pages, (p) => { feedbackPage = p; renderFeedbackTable(); });
}

function printFeedbackReport() {
  const rows = feedbackData.filter(r => {
    const search = document.getElementById('feedbackSearch').value.toLowerCase();
    if (!search) return true;
    const name = r.first_name + ' ' + r.last_name;
    return (
      r.id_number.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      r.lab.toLowerCase().includes(search) ||
      (r.date || '').toLowerCase().includes(search) ||
      (r.feedback || '').toLowerCase().includes(search)
    );
  });

  const tableRows = rows.map(r => `
    <tr>
      <td>${r.id_number}</td>
      <td>${r.first_name} ${r.last_name}</td>
      <td>${r.lab}</td>
      <td>${r.date || '—'}</td>
      <td>${r.feedback}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Feedback Report — CCS Sit-In Monitoring System</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 2rem; color: #1a1a2e; }
        .print-header { text-align: center; margin-bottom: 1.5rem; }
        .print-header h2 { margin: 0; font-size: 1.3rem; color: #2d0f5e; }
        .print-header p  { margin: 0.25rem 0 0; font-size: 0.85rem; color: #666; }
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        thead tr { background: #2d0f5e; color: #fff; }
        th, td { padding: 0.6rem 0.8rem; border: 1px solid #ddd; text-align: left; vertical-align: top; }
        tbody tr:nth-child(even) { background: #f8f4ff; }
        .print-footer { margin-top: 1rem; font-size: 0.75rem; color: #aaa; text-align: right; }
      </style>
    </head>
    <body>
      <div class="print-header">
        <h2>College of Computer Studies — Feedback Report</h2>
        <p>University of Cebu &nbsp;|&nbsp; CCS Sit-In Monitoring System &nbsp;|&nbsp; Printed: ${new Date().toLocaleString()}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Student ID Number</th>
            <th>Name</th>
            <th>Laboratory</th>
            <th>Date</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="print-footer">Total records: ${rows.length}</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

/* ══════════════════════════════════════════════════════
   LAB SOFTWARE — STUDENT DASHBOARD
══════════════════════════════════════════════════════ */

const LAB_ICONS = {
  '524': 'bi-cpu',
  '526': 'bi-pc-display',
  '528': 'bi-pc-display',
  '530': 'bi-database',
  '542': 'bi-pc-display',
  '544': 'bi-server',
};

/* ══════════════════════════════════════════════════════
   LAB SOFTWARE — ADMIN MANAGEMENT
══════════════════════════════════════════════════════ */

let adminSoftwareData = {};

function loadAdminSoftware() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/lab-software', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(result => {
      if (!result.success) return;
      adminSoftwareData = result.software;
      renderAdminSoftwareTable(result.software);
    })
    .catch(() => {});
}

function renderAdminSoftwareTable(software) {
  const wrap = document.getElementById('swAdminTableWrap');
  if (!wrap) return;
  const labs = ['524', '526', '528', '530', '542', '544'];
  let html = '<div class="sw-admin-grid">';
  for (const lab of labs) {
    const entries = software[lab] || [];
    html += `
      <div class="sw-admin-lab-card">
        <div class="sw-admin-lab-header">
          <i class="bi bi-building me-2"></i>Laboratory ${lab}
          <span class="sw-admin-count">${entries.length}</span>
        </div>
        <div class="sw-admin-entries">
          ${entries.length === 0
            ? '<p class="sw-admin-empty">No software listed.</p>'
            : entries.map(e => `
                <div class="sw-admin-entry">
                  <span><i class="bi bi-check-circle-fill sw-entry-icon me-2"></i>${e.software}</span>
                  <button class="btn-sw-delete" onclick="deleteSoftwareEntry(${e.id})" title="Remove">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              `).join('')
          }
        </div>
      </div>
    `;
  }
  html += '</div>';
  wrap.innerHTML = html;
}

function addSoftwareEntry() {
  const lab      = document.getElementById('swAddLab').value;
  const software = document.getElementById('swAddName').value.trim();
  const errEl    = document.getElementById('swAddError');
  errEl.style.display = 'none';

  if (!lab) {
    errEl.textContent = 'Please select a laboratory.';
    errEl.style.display = '';
    return;
  }
  if (!software) {
    errEl.textContent = 'Please enter a software name.';
    errEl.style.display = '';
    return;
  }

  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/lab-software', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ lab, software }),
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        document.getElementById('swAddName').value = '';
        document.getElementById('swAddLab').value  = '';
        loadAdminSoftware();
      } else {
        errEl.textContent   = result.message || 'Failed to add software.';
        errEl.style.display = '';
      }
    })
    .catch(() => {
      errEl.textContent   = 'Could not reach the server.';
      errEl.style.display = '';
    });
}

function deleteSoftwareEntry(id) {
  if (!confirm('Remove this software entry?')) return;
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/lab-software/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token },
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) loadAdminSoftware();
      else alert(result.message || 'Failed to delete.');
    })
    .catch(() => alert('Could not reach the server.'));
}

function exportAdminSoftwareCSV() {
  const token = localStorage.getItem('ccs_admin_token');
  fetch('/api/admin/lab-software/export-csv', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.text())
    .then(csv => {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'lab-software.csv';
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert('Could not export CSV.'));
}

function importSoftwareCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // detect header
    const startIdx = lines[0].toLowerCase().includes('lab') ? 1 : 0;
    const rows = [];

    for (let i = startIdx; i < lines.length; i++) {
      // simple CSV parse (handles quoted fields)
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 2) continue;
      const lab      = cols[0].trim().replace(/^Lab\s*/i, '');
      const software = cols[1].trim();
      if (lab && software) rows.push({ lab, software });
    }

    if (rows.length === 0) {
      alert('No valid rows found in CSV. Check the format and try again.');
      event.target.value = '';
      return;
    }

    if (!confirm(`Import ${rows.length} software entries? This will REPLACE all existing software data.`)) {
      event.target.value = '';
      return;
    }

    const token = localStorage.getItem('ccs_admin_token');
    fetch('/api/admin/lab-software/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ rows, mode: 'replace' }),
    })
      .then(res => res.json())
      .then(result => {
        event.target.value = '';
        if (result.success) {
          adminSoftwareData = result.software;
          renderAdminSoftwareTable(result.software);
          alert(`✓ Imported ${rows.length} software entries successfully.`);
        } else {
          alert(result.message || 'Import failed.');
        }
      })
      .catch(() => {
        event.target.value = '';
        alert('Could not reach the server.');
      });
  };
  reader.readAsText(file);
}

/* ── simple CSV line parser (handles quoted fields) ── */
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ── patch showPage to load software page ── */
const _origShowPage = showPage;
showPage = function (pageKey) {
  _origShowPage(pageKey);
  if (pageKey === 'software') loadAdminSoftware();
};

/* ── patch showAdminNav to include software nav item ── */
const _origShowAdminNav = showAdminNav;
showAdminNav = function () {
  _origShowAdminNav();
  const swNav = document.getElementById('navAdminSoftware');
  if (swNav) swNav.style.display = '';
};

/* ── patch adminLogout to hide software nav item ── */
const _origAdminLogout = adminLogout;
adminLogout = function () {
  const swNav = document.getElementById('navAdminSoftware');
  if (swNav) swNav.style.display = 'none';
  _origAdminLogout();
};

/* ── patch setAdminNav to handle 'software' ── */
const _origSetAdminNav = setAdminNav;
setAdminNav = function (page) {
  _origSetAdminNav(page);
  const swNav = document.getElementById('navAdminSoftware');
  if (swNav) swNav.classList.toggle('active', page === 'software');
};

/* ── restore software on DOMContentLoaded if admin token present ── */
document.addEventListener('DOMContentLoaded', function () {
  const adminToken = localStorage.getItem('ccs_admin_token');
  if (adminToken) {
    const swNav = document.getElementById('navAdminSoftware');
    if (swNav) swNav.style.display = '';
  }
});

/* ══════════════════════════════════════════════════════
   ADMIN RECORDS / GENERATE REPORTS
══════════════════════════════════════════════════════ */

let recordsData    = [];
let recordsSortKey = 'date';
let recordsSortDir = 'desc';
let recordsPage    = 1;

function loadRecords(dateFrom = '', dateTo = '') {
  const token = localStorage.getItem('ccs_admin_token');
  let url = '/api/admin/records';
  const params = [];
  if (dateFrom) params.push('dateFrom=' + encodeURIComponent(dateFrom));
  if (dateTo)   params.push('dateTo='   + encodeURIComponent(dateTo));
  if (params.length) url += '?' + params.join('&');

  fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(res => res.json())
    .then(result => {
      recordsData = result.logs || [];
      recordsPage = 1;
      renderRecordsTable();

      const badge   = document.getElementById('recordsCountBadge');
      const badgeTxt = document.getElementById('recordsCountText');
      if (recordsData.length > 0) {
        badge.style.display  = '';
        badgeTxt.textContent = recordsData.length + ' record' + (recordsData.length !== 1 ? 's' : '') + ' found';
      } else {
        badge.style.display = 'none';
      }
    })
    .catch(() => {});
}

function searchRecords() {
  const from = document.getElementById('recordsDateFrom').value;
  const to   = document.getElementById('recordsDateTo').value;
  loadRecords(from, to);
}

function resetRecords() {
  document.getElementById('recordsDateFrom').value = '';
  document.getElementById('recordsDateTo').value   = '';
  document.getElementById('recordsSearch').value   = '';
  document.getElementById('recordsCountBadge').style.display = 'none';
  recordsData = [];
  recordsPage = 1;
  renderRecordsTable();
}

function sortRecords(key) {
  if (key === 'duration') {
    // sort by computed duration ms
    if (recordsSortKey === 'duration') {
      recordsSortDir = recordsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      recordsSortKey = 'duration';
      recordsSortDir = 'asc';
    }
  } else {
    if (recordsSortKey === key) {
      recordsSortDir = recordsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      recordsSortKey = key;
      recordsSortDir = 'asc';
    }
  }
  recordsPage = 1;
  renderRecordsTable();
}

function _getRecordDurationMs(r) {
  const login  = _parseSQLiteDateTime(r.login_time);
  const logout = _parseSQLiteDateTime(r.logout_time);
  if (!login) return 0;
  if (!logout) return new Date() - login; // active
  return logout - login;
}

function renderRecordsTable() {
  const pageSize = parseInt(document.getElementById('recordsPageSize').value);
  const search   = document.getElementById('recordsSearch').value.toLowerCase();

  let filtered = recordsData.filter(r => {
    const name = (r.first_name || '') + ' ' + (r.last_name || '');
    return (
      (r.id_number || '').toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      (r.purpose || '').toLowerCase().includes(search) ||
      (r.lab || '').toLowerCase().includes(search) ||
      (r.date || '').toLowerCase().includes(search) ||
      String(r.pc_number || '').includes(search)
    );
  });

  // sort
  filtered.sort((a, b) => {
    let valA, valB;
    if (recordsSortKey === 'name') {
      valA = (a.first_name || '') + ' ' + (a.last_name || '');
      valB = (b.first_name || '') + ' ' + (b.last_name || '');
    } else if (recordsSortKey === 'duration') {
      valA = _getRecordDurationMs(a);
      valB = _getRecordDurationMs(b);
      return recordsSortDir === 'asc' ? valA - valB : valB - valA;
    } else {
      valA = String(a[recordsSortKey] || '');
      valB = String(b[recordsSortKey] || '');
    }
    if (valA < valB) return recordsSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return recordsSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (recordsPage > pages) recordsPage = pages;
  const start = (recordsPage - 1) * pageSize;
  const end   = Math.min(start + pageSize, total);
  const paged = filtered.slice(start, end);

  // update sort icons
  document.querySelectorAll('#recordsTable .sort-btns').forEach(el => el.classList.remove('active'));
  const ths  = document.querySelectorAll('#recordsTable th');
  const keys = ['id_number', 'name', 'purpose', 'lab', 'pc_number', 'date', 'login_time', 'logout_time', 'duration'];
  keys.forEach((k, i) => {
    if (k === recordsSortKey && ths[i]) ths[i].querySelector('.sort-btns').classList.add('active');
  });

  const tbody = document.getElementById('recordsTableBody');
  if (paged.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">
      <i class="bi bi-inbox me-2"></i>${recordsData.length === 0 ? 'Use the date filter above or click Search to load records.' : 'No records match your search.'}
    </td></tr>`;
  } else {
    tbody.innerHTML = paged.map(r => {
      const durationMs  = _getRecordDurationMs(r);
      const durationStr = r.logout_time ? _msToHMShort(durationMs) : `<span style="color:#10b981;font-weight:700;">Active</span>`;
      const loginDt     = _parseSQLiteDateTime(r.login_time);
      const logoutDt    = _parseSQLiteDateTime(r.logout_time);
      const timeIn      = loginDt  ? loginDt.toLocaleTimeString([],  { hour: '2-digit', minute: '2-digit' }) : '—';
      const timeOut     = logoutDt ? logoutDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

      return `<tr>
        <td>${r.id_number}</td>
        <td>${r.first_name} ${r.last_name}</td>
        <td>${r.purpose}</td>
        <td>${r.lab}</td>
        <td>${r.pc_number ? 'PC ' + r.pc_number : '—'}</td>
        <td>${r.date || '—'}</td>
        <td>${timeIn}</td>
        <td>${timeOut}</td>
        <td>${durationStr}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('recordsInfo').textContent =
    total === 0 ? 'Showing 0 to 0 of 0 entries'
    : `Showing ${start + 1} to ${end} of ${total} entries`;

  renderPagination('recordsPagination', recordsPage, pages, (p) => { recordsPage = p; renderRecordsTable(); });
}

/* ── export helpers ── */
function _recordsFilteredAll() {
  const search = document.getElementById('recordsSearch').value.toLowerCase();
  return recordsData.filter(r => {
    const name = (r.first_name || '') + ' ' + (r.last_name || '');
    return (
      (r.id_number || '').toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      (r.purpose || '').toLowerCase().includes(search) ||
      (r.lab || '').toLowerCase().includes(search) ||
      (r.date || '').toLowerCase().includes(search) ||
      String(r.pc_number || '').includes(search)
    );
  });
}

function _recordRow(r) {
  const durationMs  = _getRecordDurationMs(r);
  const durationStr = r.logout_time ? _msToHMShort(durationMs) : 'Active';
  const loginDt     = _parseSQLiteDateTime(r.login_time);
  const logoutDt    = _parseSQLiteDateTime(r.logout_time);
  const timeIn      = loginDt  ? loginDt.toLocaleTimeString([],  { hour: '2-digit', minute: '2-digit' }) : '—';
  const timeOut     = logoutDt ? logoutDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  return {
    idNumber: r.id_number,
    name: (r.first_name || '') + ' ' + (r.last_name || ''),
    purpose: r.purpose,
    lab: r.lab,
    pcNo: r.pc_number ? 'PC ' + r.pc_number : '—',
    date: r.date || '—',
    login: timeIn,
    logout: timeOut,
    duration: durationStr,
  };
}

/* CSV */
function exportRecordsCSV() {
  const rows = _recordsFilteredAll();
  if (rows.length === 0) { alert('No records to export.'); return; }
  const headers = ['ID Number','Name','Purpose','Laboratory','PC No.','Date','Login','Logout','Duration'];
  const lines   = [headers.join(',')];
  rows.forEach(r => {
    const d = _recordRow(r);
    lines.push([d.idNumber, `"${d.name}"`, `"${d.purpose}"`, d.lab, d.pcNo, d.date, d.login, d.logout, d.duration].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'sit-in-records.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* Excel (XLSX via simple HTML table trick) */
function exportRecordsExcel() {
  const rows = _recordsFilteredAll();
  if (rows.length === 0) { alert('No records to export.'); return; }
  const headers = ['ID Number','Name','Purpose','Laboratory','PC No.','Date','Login','Logout','Duration'];
  let html = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => {
    const d = _recordRow(r);
    html += `<tr><td>${d.idNumber}</td><td>${d.name}</td><td>${d.purpose}</td><td>${d.lab}</td>` +
            `<td>${d.pcNo}</td><td>${d.date}</td><td>${d.login}</td><td>${d.logout}</td><td>${d.duration}</td></tr>`;
  });
  html += '</tbody></table>';
  const blob = new Blob([`<html><head><meta charset="UTF-8"></head><body>${html}</body></html>`],
    { type: 'application/vnd.ms-excel' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'sit-in-records.xls';
  a.click();
  URL.revokeObjectURL(url);
}

/* PDF (print-to-PDF via hidden window) */
function exportRecordsPDF() {
  const rows = _recordsFilteredAll();
  if (rows.length === 0) { alert('No records to export.'); return; }
  _openRecordsPrintWindow(rows, true);
}

/* Print */
function printRecords() {
  const rows = _recordsFilteredAll();
  if (rows.length === 0) { alert('No records to print.'); return; }
  _openRecordsPrintWindow(rows, false);
}

function _openRecordsPrintWindow(rows, pdf) {
  const fromVal = document.getElementById('recordsDateFrom').value;
  const toVal   = document.getElementById('recordsDateTo').value;
  const range   = fromVal && toVal ? `${fromVal} — ${toVal}` : fromVal || toVal || 'All dates';

  const tableRows = rows.map(r => {
    const d = _recordRow(r);
    return `<tr>
      <td>${d.idNumber}</td><td>${d.name}</td><td>${d.purpose}</td>
      <td>${d.lab}</td><td>${d.pcNo}</td><td>${d.date}</td>
      <td>${d.login}</td><td>${d.logout}</td><td>${d.duration}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Sit-In Records — CCS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; padding: 1.5rem 2rem; color: #1a1a2e; font-size: 12px; }
    .print-header { text-align: center; margin-bottom: 1.2rem; border-bottom: 2px solid #2d0f5e; padding-bottom: 0.8rem; }
    .print-header h2 { font-size: 1.1rem; color: #2d0f5e; font-weight: 800; }
    .print-header p  { font-size: 0.78rem; color: #666; margin-top: 0.2rem; }
    .print-meta { display: flex; justify-content: space-between; margin-bottom: 0.85rem; font-size: 0.75rem; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #2d0f5e; color: #fff; }
    th { padding: 0.5rem 0.6rem; text-align: left; font-weight: 700; white-space: nowrap; }
    td { padding: 0.42rem 0.6rem; border-bottom: 1px solid #e8d8ff; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f8f4ff; }
    .print-footer { margin-top: 0.85rem; font-size: 0.72rem; color: #aaa; text-align: right; }
    @media print { body { padding: 0.5rem 1rem; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h2><i>College of Computer Studies — Sit-In Records Report</i></h2>
    <p>University of Cebu &nbsp;|&nbsp; CCS Sit-In Monitoring System</p>
  </div>
  <div class="print-meta">
    <span><strong>Date Range:</strong> ${range}</span>
    <span><strong>Generated:</strong> ${new Date().toLocaleString()}</span>
    <span><strong>Total Records:</strong> ${rows.length}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID Number</th><th>Name</th><th>Purpose</th>
        <th>Laboratory</th><th>PC No.</th><th>Date</th>
        <th>Login</th><th>Logout</th><th>Duration</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="print-footer">CCS Sit-In Monitoring System &mdash; ${new Date().toLocaleDateString()}</div>
  <script>
    window.onload = function() {
      window.print();
      ${pdf ? '' : '// window.close();'}
    };
  <\/script>
</body>
</html>`);
  win.document.close();
}