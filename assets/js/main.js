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
          `<a href="#" id="logoutBtn" class="btn btn-gold btn-sm">خروج</a>`;
        const lb = document.getElementById('logoutBtn');
        if (lb) lb.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
        // hide the standalone login/register nav links when signed in
        document.querySelectorAll('.nav-links > a[href="register.html"], .nav-links > a[href="login.html"]')
          .forEach((a) => { a.style.display = 'none'; });
      } else {
        authSlot.innerHTML =
          `<a href="login.html">دخول</a>` +
          `<a href="register.html" class="btn btn-gold btn-sm">سجّل الآن</a>`;
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

  // ---- breeds list (public) ----
  window.loadBreeds = async function () {
    try { return (await api('/api/breeds')).breeds || []; } catch { return []; }
  };

  // ---- reusable multi-breed editor (register / dashboard / admin) ----
  // Each row = { breed (select), birds, cages }. Returns { entries } getter.
  window.makeBreedEditor = function ({ container, addBtn, breeds, entries }) {
    function options(sel) {
      return '<option value="">اختر السلالة</option>' +
        breeds.map((b) => `<option value="${b.name}"${b.name === sel ? ' selected' : ''}>${b.name}</option>`).join('');
    }
    function addRow(e) {
      e = e || { breed: '', birds: '', cages: '' };
      const row = document.createElement('div');
      row.className = 'breed-row';
      row.innerHTML =
        `<select class="br-breed" aria-label="السلالة">${options(e.breed)}</select>` +
        `<input class="br-birds" type="number" min="0" placeholder="عدد الطيور" value="${e.birds || ''}" />` +
        `<input class="br-cages" type="number" min="0" placeholder="عدد الأقفاص" value="${e.cages || ''}" />` +
        `<button type="button" class="br-del" title="حذف السلالة">${window.icon ? window.icon('x') : '×'}</button>`;
      row.querySelector('.br-del').addEventListener('click', () => {
        row.remove();
        if (!container.querySelector('.breed-row')) addRow();
      });
      container.appendChild(row);
    }
    container.innerHTML = '';
    (entries && entries.length ? entries : [null]).forEach(addRow);
    if (addBtn) addBtn.onclick = () => addRow();
    return {
      get entries() {
        return [...container.querySelectorAll('.breed-row')].map((r) => ({
          breed: r.querySelector('.br-breed').value,
          birds: r.querySelector('.br-birds').value || 0,
          cages: r.querySelector('.br-cages').value || 0,
        })).filter((x) => x.breed);
      },
      totals() {
        return this.entries.reduce((a, e) => ({
          birds: a.birds + (+e.birds || 0), cages: a.cages + (+e.cages || 0),
        }), { birds: 0, cages: 0 });
      },
    };
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
