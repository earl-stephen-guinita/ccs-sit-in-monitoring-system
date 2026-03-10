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

/* ── page titles ── */
const PAGE_TITLES = {
  home:     'CCS | Home',
  register: 'CCS | Register',
  login:    'CCS | Login',
};

/* ── page switcher ── */
function showPage(pageKey) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageKey);
  if (target) {
    target.classList.add('active');
    document.title = PAGE_TITLES[pageKey] || 'CCS Sit-In Monitoring';
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

/* ── register & login form submit ── */
document.addEventListener('submit', function (e) {

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
          alert('Welcome back, ' + result.firstName + ' ' + result.lastName + '!');
        } else {
          alert(result.message || 'Login failed.');
        }
      })
      .catch(() => alert('Could not reach the server. Please try again.'));
  }

});