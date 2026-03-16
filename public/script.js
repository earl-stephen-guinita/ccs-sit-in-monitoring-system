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
  'admin-login':'CCS | Admin Login',
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
          currentUser = result.user;
          saveSession(result.token, result.user);
          updateNavForLoggedIn();
          showPage('profile');
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
    };

    authFetch('/api/profile/update', {
      method: 'POST',
      body: JSON.stringify(updated),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          currentUser = { ...currentUser, ...updated };
          saveSession(getToken(), currentUser);
          updateNavForLoggedIn();
          loadProfile();
          toggleEditMode(false);
          alert('Profile updated successfully!');
        } else {
          alert(result.message || 'Update failed.');
        }
      })
      .catch(() => alert('Could not reach the server.'));
  }

  /* admin login */
  if (e.target.id === 'adminLoginForm') {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          localStorage.setItem('ccs_admin_token', result.token);
          document.getElementById('navAdminLogin').style.display = 'none';
          showPage('admin');
        } else {
          alert(result.message || 'Invalid admin credentials.');
        }
      })
      .catch(() => alert('Could not reach the server.'));
  }

  /* sit-in form */
  if (e.target.id === 'sitInForm') {
    e.preventDefault();
    const errorEl = document.getElementById('sitInError');
    const purpose = document.getElementById('sitPurpose').value;
    const lab     = document.getElementById('sitLab').value;

    if (!purpose || !lab) {
      errorEl.textContent = 'Please select both a Purpose and a Lab.';
      errorEl.style.display = '';
      return;
    }

    const data = {
      idNumber:  document.getElementById('sitIdNumber').value,
      lastName:  document.getElementById('sitLastName').value.trim(),
      firstName: document.getElementById('sitFirstName').value.trim(),
      sessions:  document.getElementById('sitSessions').value,
      purpose, lab,
    };

    const token = localStorage.getItem('ccs_admin_token');
    fetch('/api/admin/sit-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(data),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          alert('Sit-in confirmed! Remaining sessions: ' + result.remainingSessions);
          clearSitInForm();
        } else {
          errorEl.textContent = result.message || 'Sit-in failed.';
          errorEl.style.display = '';
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
  currentUser = null;
  clearSession();
  document.getElementById('navLogin').style.display = '';
  document.getElementById('navRegisterItem').style.display = ''; 
  document.getElementById('navProfileItem').style.display = 'none';
  document.getElementById('navLogoutItem').style.display = 'none';
  showPage('home');
}

/* ── admin logout ── */
function adminLogout() {
  localStorage.removeItem('ccs_admin_token');
  document.getElementById('navAdminLogin').style.display = '';
  clearSitInForm();
  showPage('home');
}

/* ── restore session on page load ── */
window.addEventListener('DOMContentLoaded', function () {
  if (currentUser && getToken()) updateNavForLoggedIn();
  if (localStorage.getItem('ccs_admin_token')) {
    document.getElementById('navAdminLogin').style.display = 'none';
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
          saveSession(getToken(), currentUser);
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
    currentUser.course + ' — ' + currentUser.level;

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

  const total     = 30;
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
  document.getElementById('vCourse').textContent     = currentUser.course;
  document.getElementById('vLevel').textContent      = currentUser.level;
  document.getElementById('vEmail').textContent      = currentUser.email;
  document.getElementById('vAddress').textContent    = currentUser.address;
}

/* ── toggle edit mode ── */
function toggleEditMode(on) {
  document.getElementById('profileViewMode').style.display = on ? 'none' : '';
  document.getElementById('profileEditMode').style.display = on ? '' : 'none';
  if (on && currentUser) {
    document.getElementById('eIdNumber').value   = currentUser.idNumber;
    document.getElementById('eLastName').value   = currentUser.lastName;
    document.getElementById('eFirstName').value  = currentUser.firstName;
    document.getElementById('eMiddleName').value = currentUser.middleName || '';
    document.getElementById('eCourse').value     = currentUser.course;
    document.getElementById('eLevel').value      = currentUser.level;
    document.getElementById('eEmail').value      = currentUser.email;
    document.getElementById('eAddress').value    = currentUser.address;
    document.getElementById('ePassword').value   = '';
  }
}