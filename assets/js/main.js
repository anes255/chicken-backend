/* Shared helpers: API calls, auth/session, nav, scroll reveal. */
(function () {
  // ---- session ----
  window.Auth = {
    save(data) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
    },
    get token() { return localStorage.getItem('token'); },
    get role() { return localStorage.getItem('role'); },
    get user() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } },
    get isLoggedIn() { return !!this.token; },
    logout() { localStorage.clear(); location.href = 'index.html'; },
  };

  // ---- API ----
  window.api = async function (path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'حدث خطأ في الاتصال بالخادم');
    return data;
  };

  // ---- nav (mobile toggle + active link + auth-aware links) ----
  document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (toggle && links) toggle.addEventListener('click', () => links.classList.toggle('open'));

    // mark active link
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a[href]').forEach((a) => {
      if (a.getAttribute('href') === page) a.classList.add('active');
    });

    // auth-aware nav slots
    const authSlot = document.querySelector('[data-auth-slot]');
    if (authSlot) {
      if (Auth.isLoggedIn) {
        const dash = Auth.role === 'admin' ? 'admin.html' : 'dashboard.html';
        authSlot.innerHTML =
          `<a href="${dash}">${Auth.role === 'admin' ? 'لوحة الإدارة' : 'حسابي'}</a>` +
          `<a href="#" id="logoutBtn">خروج</a>`;
        const lb = document.getElementById('logoutBtn');
        if (lb) lb.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
      } else {
        authSlot.innerHTML =
          `<a href="login.html">دخول</a>` +
          `<a href="register.html" class="btn btn-primary btn-sm">سجّل الآن</a>`;
      }
    }

    // scroll reveal
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
  });

  // ---- wilaya/baladya cascading selects ----
  window.fillWilayas = function (wilayaSelect, baladyaSelect, selectedW, selectedB) {
    if (!window.ALGERIA) return;
    wilayaSelect.innerHTML = '<option value="">اختر الولاية</option>' +
      ALGERIA.map((w) => `<option value="${w.name}">${w.code} - ${w.name}</option>`).join('');
    function loadCommunes(name, pick) {
      const w = ALGERIA.find((x) => x.name === name);
      baladyaSelect.innerHTML = '<option value="">اختر البلدية</option>' +
        (w ? w.communes.map((c) => `<option value="${c}">${c}</option>`).join('') : '');
      if (pick) baladyaSelect.value = pick;
    }
    wilayaSelect.addEventListener('change', () => loadCommunes(wilayaSelect.value));
    if (selectedW) { wilayaSelect.value = selectedW; loadCommunes(selectedW, selectedB); }
  };

  // ---- count-up animation ----
  window.countUp = function (el, target, dur = 1200) {
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.floor(p * target).toLocaleString('ar');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
})();
