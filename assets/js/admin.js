/* Admin dashboard: stats, analytics, per-breed breakdown, breed management,
   participant table with search/wilaya/breed filters, edit/delete, CSV export. */
(function () {
  if (!Auth.isLoggedIn || Auth.role !== 'admin') { location.href = 'login'; return; }

  const $ = (id) => document.getElementById(id);
  let allParticipants = [];
  let allBreeds = [];
  let modalEditor = null;
  let page = 1;
  const PAGE_SIZE = 50; // keeps the DOM light even with thousands of participants

  $('logoutBtn').addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });

  function fmtDate(d) {
    // 'en-GB' = dd/mm/yyyy with Western (Latin) digits, never Eastern-Arabic.
    try { return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { return d; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function loadAll() {
    try {
      const [list, breedsRes, adminsRes] = await Promise.all([
        api('/api/admin/participants', { auth: true }),
        api('/api/breeds'),
        api('/api/admin/admins', { auth: true }),
      ]);
      allParticipants = list.participants;
      allBreeds = breedsRes.breeds || [];
      renderOverviewTotals();
      renderBreedChips();
      renderAdmins(adminsRes);
      renderFilters();
      renderTable();
      buildAnalyticsFilters();
      $('loading').classList.add('hidden');
      $('content').classList.remove('hidden');
    } catch (e) {
      if (String(e.message).match(/الجلسة|الدخول|الإدارة/)) { Auth.logout(); return; }
      $('loading').innerHTML = '<p style="color:var(--danger)">' + esc(e.message) + '</p>';
    }
  }

  function num(n) { return Number(n || 0).toLocaleString('en-US'); }

  // Overview totals (computed client-side from participants).
  function renderOverviewTotals() {
    const tb = allParticipants.reduce((a, p) => a + (p.numBirds || 0), 0);
    const tc = allParticipants.reduce((a, p) => a + (p.numCages || 0), 0);
    const wil = new Set(allParticipants.map((p) => p.wilaya)).size;
    countUp($('tParticipants'), allParticipants.length);
    countUp($('tBirds'), tb);
    countUp($('tCages'), tc);
    countUp($('tWilayas'), wil);
  }

  // ---- admin accounts management ----
  let admins = [];
  async function refreshAdmins() {
    const res = await api('/api/admin/admins', { auth: true });
    renderAdmins(res);
  }
  function renderAdmins(res) {
    admins = res.admins || [];
    const primaryRow = `<tr>
      <td><b>${esc(res.primary.fullName)}</b></td>
      <td>${esc(res.primary.phone)}</td>
      <td><span class="badge">أساسي</span></td>
      <td><span style="color:var(--muted);font-size:.85rem">غير قابل للتعديل</span></td>
    </tr>`;
    const rows = admins.map((a) => `
      <tr>
        <td><b>${esc(a.fullName)}</b></td>
        <td>${esc(a.phone)}</td>
        <td><span class="badge beige">مدير</span></td>
        <td class="actions-cell">
          <button class="btn btn-gold btn-sm" data-aedit="${a.id}">تعديل</button>
          <button class="btn btn-danger btn-sm" data-adel="${a.id}">حذف</button>
        </td>
      </tr>`).join('');
    $('adminsBody').innerHTML = primaryRow + rows;
    $('adminsBody').querySelectorAll('[data-aedit]').forEach((b) =>
      b.addEventListener('click', () => openAdminEdit(b.getAttribute('data-aedit'))));
    $('adminsBody').querySelectorAll('[data-adel]').forEach((b) =>
      b.addEventListener('click', () => delAdmin(b.getAttribute('data-adel'))));
  }

  $('addAdminBtn').addEventListener('click', async () => {
    $('adminAlert').classList.remove('show');
    const body = { fullName: $('naName').value, phone: $('naPhone').value, password: $('naPass').value };
    try {
      await api('/api/admin/admins', { method: 'POST', auth: true, body });
      $('naName').value = $('naPhone').value = $('naPass').value = '';
      await refreshAdmins();
    } catch (e) {
      $('adminAlert').textContent = e.message;
      $('adminAlert').classList.add('show');
    }
  });

  const adminModalBg = $('adminModalBg');
  const adminEditForm = $('adminEditForm');
  function openAdminEdit(id) {
    const a = admins.find((x) => String(x.id) === String(id));
    if (!a) return;
    $('adminModalAlert').classList.remove('show');
    adminEditForm.id.value = a.id;
    adminEditForm.fullName.value = a.fullName || '';
    adminEditForm.phone.value = a.phone || '';
    adminEditForm.password.value = '';
    adminModalBg.classList.add('open');
  }
  $('closeAdminModal').addEventListener('click', () => adminModalBg.classList.remove('open'));
  adminModalBg.addEventListener('click', (e) => { if (e.target === adminModalBg) adminModalBg.classList.remove('open'); });
  adminEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(adminEditForm));
    try {
      await api('/api/admin/admins/' + data.id, { method: 'PUT', auth: true, body: data });
      adminModalBg.classList.remove('open');
      await refreshAdmins();
    } catch (err) {
      $('adminModalAlert').textContent = err.message;
      $('adminModalAlert').classList.add('show');
    }
  });
  async function delAdmin(id) {
    const a = admins.find((x) => String(x.id) === String(id));
    if (!confirm(`حذف المدير "${a ? a.fullName : ''}"؟`)) return;
    try { await api('/api/admin/admins/' + id, { method: 'DELETE', auth: true }); await refreshAdmins(); }
    catch (e) { alert(e.message); }
  }

  // Render a percentage bar: track + filled portion + numeric label.
  function progBar(pct) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    return `<div class="prog"><div class="prog-track"><div class="prog-fill" style="width:${v}%"></div></div><span class="prog-pct">${v}%</span></div>`;
  }

  // ============================================================
  //  ANALYTICS TAB — live filters + Chart.js diagrams
  // ============================================================
  const PALETTE = ['#2f7d4f', '#cda860', '#3c9a63', '#256241', '#b9803f', '#7bbf95', '#15793a', '#d8bd7e', '#5e8c5a', '#c0492f', '#1d4a30', '#88b04b', '#e0cfa6', '#46a06a', '#a9743b'];
  const colors = (n) => Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);
  const charts = {};
  let selBreeds = new Set();
  let selWilayas = new Set();

  if (window.Chart) {
    Chart.defaults.font.family = 'Tajawal, Cairo, sans-serif';
    Chart.defaults.color = '#5e6b56';
  }

  // Tab switching.
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.getAttribute('data-tab');
    $('tab-overview').classList.toggle('hidden', tab !== 'overview');
    $('tab-analytics').classList.toggle('hidden', tab !== 'analytics');
    if (tab === 'analytics') renderAnalytics(); // draw once visible (canvas needs a size)
  }));

  function chipToggle(set, key, el) {
    if (set.has(key)) { set.delete(key); el.classList.remove('on'); }
    else { set.add(key); el.classList.add('on'); }
  }

  function buildAnalyticsFilters() {
    const breedsInData = [...new Set(allParticipants.flatMap((p) => (p.entries || []).map((e) => e.breed)))].filter(Boolean).sort();
    const wilayasInData = [...new Set(allParticipants.map((p) => p.wilaya))].filter(Boolean).sort();
    selBreeds = new Set(breedsInData);
    selWilayas = new Set(wilayasInData);
    const empty = '<span style="color:var(--muted)">لا توجد بيانات</span>';
    $('fBreeds').innerHTML = breedsInData.map((b) => `<span class="chip-tog on" data-b="${esc(b)}">${esc(b)}</span>`).join('') || empty;
    $('fWilayas').innerHTML = wilayasInData.map((w) => `<span class="chip-tog on" data-w="${esc(w)}">${esc(w)}</span>`).join('') || empty;
    $('fBreeds').querySelectorAll('[data-b]').forEach((c) =>
      c.addEventListener('click', () => { chipToggle(selBreeds, c.getAttribute('data-b'), c); renderAnalytics(); }));
    $('fWilayas').querySelectorAll('[data-w]').forEach((c) =>
      c.addEventListener('click', () => { chipToggle(selWilayas, c.getAttribute('data-w'), c); renderAnalytics(); }));
  }

  $('filtAll').addEventListener('click', () => {
    $('fBreeds').querySelectorAll('[data-b]').forEach((c) => { selBreeds.add(c.getAttribute('data-b')); c.classList.add('on'); });
    $('fWilayas').querySelectorAll('[data-w]').forEach((c) => { selWilayas.add(c.getAttribute('data-w')); c.classList.add('on'); });
    renderAnalytics();
  });
  $('filtNone').addEventListener('click', () => {
    selBreeds.clear(); selWilayas.clear();
    document.querySelectorAll('#fBreeds .chip-tog, #fWilayas .chip-tog').forEach((c) => c.classList.remove('on'));
    renderAnalytics();
  });

  function computeAnalytics() {
    const pSet = new Set();
    let birds = 0, cages = 0;
    const breedAgg = {}, wilayaAgg = {};
    for (const p of allParticipants) {
      if (!selWilayas.has(p.wilaya)) continue;
      let inc = false;
      for (const e of (p.entries || [])) {
        if (!selBreeds.has(e.breed)) continue;
        inc = true; birds += e.birds; cages += e.cages;
        (breedAgg[e.breed] || (breedAgg[e.breed] = { p: new Set(), b: 0, c: 0 }));
        breedAgg[e.breed].p.add(p.id); breedAgg[e.breed].b += e.birds; breedAgg[e.breed].c += e.cages;
        (wilayaAgg[p.wilaya] || (wilayaAgg[p.wilaya] = { p: new Set(), b: 0, c: 0 }));
        wilayaAgg[p.wilaya].p.add(p.id); wilayaAgg[p.wilaya].b += e.birds; wilayaAgg[p.wilaya].c += e.cages;
      }
      if (inc) pSet.add(p.id);
    }
    const breeds = Object.entries(breedAgg).map(([k, v]) => ({ breed: k, participants: v.p.size, birds: v.b, cages: v.c })).sort((a, b) => b.birds - a.birds);
    const wilayas = Object.entries(wilayaAgg).map(([k, v]) => ({ wilaya: k, participants: v.p.size, birds: v.b, cages: v.c })).sort((a, b) => b.participants - a.participants);
    return { participants: pSet.size, birds, cages, breeds, wilayas };
  }

  function renderAnalytics() {
    const a = computeAnalytics();
    $('fParticipants').textContent = num(a.participants);
    $('fBirds').textContent = num(a.birds);
    $('fCages').textContent = num(a.cages);
    $('fBreedsCount').textContent = num(a.breeds.length);

    const emptyRow = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">لا توجد بيانات مطابقة.</td></tr>';
    const tb = a.birds || 1, tp = a.participants || 1;
    $('breedStats').innerHTML = a.breeds.map((b) => `
      <tr><td><b>${esc(b.breed)}</b></td>
        <td><span class="badge beige">${b.participants}</span></td>
        <td>${b.birds}</td><td>${b.cages}</td>
        <td>${progBar((b.birds / tb) * 100)}</td></tr>`).join('') || emptyRow;
    $('wilayaStats').innerHTML = a.wilayas.map((w) => `
      <tr><td><b>${esc(w.wilaya)}</b></td>
        <td><span class="badge">${w.participants}</span></td>
        <td>${w.birds}</td><td>${w.cages}</td>
        <td>${progBar((w.participants / tp) * 100)}</td></tr>`).join('') || emptyRow;

    drawCharts(a);
  }

  function mkChart(id, cfg) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), cfg);
  }

  function drawCharts(a) {
    const baseOpts = (extra = {}) => Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { rtl: true, labels: { boxWidth: 14, padding: 12 } },
        tooltip: { rtl: true },
      },
    }, extra);

    const topB = a.breeds.slice(0, 12);
    const topWp = a.wilayas.slice(0, 12);
    const topWb = [...a.wilayas].sort((x, y) => y.birds - x.birds).slice(0, 12);

    mkChart('chBreedPie', {
      type: 'doughnut',
      data: { labels: topB.map((b) => b.breed), datasets: [{ data: topB.map((b) => b.birds), backgroundColor: colors(topB.length), borderColor: '#fff', borderWidth: 2 }] },
      options: baseOpts({ plugins: { legend: { position: 'bottom', rtl: true, labels: { boxWidth: 12, padding: 10 } }, tooltip: { rtl: true } }, cutout: '55%' }),
    });
    mkChart('chBreedBar', {
      type: 'bar',
      data: { labels: topB.map((b) => b.breed), datasets: [
        { label: 'الطيور', data: topB.map((b) => b.birds), backgroundColor: '#2f7d4f', borderRadius: 6 },
        { label: 'الأقفاص', data: topB.map((b) => b.cages), backgroundColor: '#cda860', borderRadius: 6 },
      ] },
      options: baseOpts({ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }),
    });
    mkChart('chWilayaPart', {
      type: 'bar',
      data: { labels: topWp.map((w) => w.wilaya), datasets: [{ label: 'المشاركون', data: topWp.map((w) => w.participants), backgroundColor: colors(topWp.length), borderRadius: 6 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }),
    });
    mkChart('chWilayaBirds', {
      type: 'bar',
      data: { labels: topWb.map((w) => w.wilaya), datasets: [{ label: 'الطيور', data: topWb.map((w) => w.birds), backgroundColor: '#3c9a63', borderRadius: 6 }] },
      options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }),
    });
  }

  // ---- breed management ----
  function renderBreedChips() {
    $('breedChips').innerHTML = allBreeds.map((b) =>
      `<span class="badge" style="display:inline-flex;align-items:center;gap:6px">${esc(b.name)}
        <button data-delbreed="${b.id}" title="حذف" style="border:0;background:transparent;color:#fff;cursor:pointer;display:inline-flex">${icon('x')}</button></span>`
    ).join('') || '<span style="color:var(--muted)">لا توجد سلالات.</span>';
    $('breedChips').querySelectorAll('[data-delbreed]').forEach((btn) =>
      btn.addEventListener('click', () => delBreed(btn.getAttribute('data-delbreed'))));
  }

  $('addBreedBtn').addEventListener('click', async () => {
    const name = $('newBreed').value.trim();
    $('breedAlert').classList.remove('show');
    if (!name) return;
    try {
      await api('/api/admin/breeds', { method: 'POST', auth: true, body: { name } });
      $('newBreed').value = '';
      await loadAll();
    } catch (e) {
      $('breedAlert').textContent = e.message;
      $('breedAlert').classList.add('show');
    }
  });
  $('newBreed').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('addBreedBtn').click(); } });

  async function delBreed(id) {
    const b = allBreeds.find((x) => String(x.id) === String(id));
    if (!confirm(`حذف السلالة "${b ? b.name : ''}" من القائمة؟`)) return;
    try { await api('/api/admin/breeds/' + id, { method: 'DELETE', auth: true }); await loadAll(); }
    catch (e) { alert(e.message); }
  }

  // ---- filters ----
  function renderFilters() {
    const wilayas = [...new Set(allParticipants.map((p) => p.wilaya))].sort();
    $('wilayaFilter').innerHTML = '<option value="">كل الولايات</option>' +
      wilayas.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    // breed filter from the managed list + any breed found on participants
    const used = new Set();
    allParticipants.forEach((p) => (p.entries || []).forEach((e) => used.add(e.breed)));
    const names = [...new Set([...allBreeds.map((b) => b.name), ...used])].filter(Boolean).sort();
    $('breedFilter').innerHTML = '<option value="">كل السلالات</option>' +
      names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const w = $('wilayaFilter').value;
    const br = $('breedFilter').value;
    return allParticipants.filter((p) =>
      (!w || p.wilaya === w) &&
      (!br || (p.entries || []).some((e) => e.breed === br)) &&
      (!q || (p.fullName || '').toLowerCase().includes(q) || (p.phone || '').includes(q))
    );
  }

  function breedChipsHtml(p) {
    const entries = p.entries && p.entries.length ? p.entries : [];
    if (!entries.length) return esc(p.breed) || '—';
    return '<div class="breed-chips">' + entries.map((e) =>
      `<span class="badge" title="${e.birds} طائر · ${e.cages} قفص">${esc(e.breed)} (${e.birds}/${e.cages})</span>`
    ).join('') + '</div>';
  }

  function renderTable() {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE_SIZE;
    const rows = all.slice(start, start + PAGE_SIZE);
    $('emptyMsg').classList.toggle('hidden', all.length > 0);
    $('usersBody').innerHTML = rows.map((p, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td><b>${esc(p.fullName)}</b></td>
        <td>${esc(p.phone)}</td>
        <td><span class="badge beige">${esc(p.wilaya)}</span></td>
        <td>${esc(p.baladya)}</td>
        <td><b>${p.numBirds}</b></td>
        <td><b>${p.numCages}</b></td>
        <td>${breedChipsHtml(p)}</td>
        <td>${fmtDate(p.createdAt)}</td>
        <td class="actions-cell">
          <button class="btn btn-gold btn-sm" data-edit="${p.id}">تعديل</button>
          <button class="btn btn-danger btn-sm" data-del="${p.id}">حذف</button>
        </td>
      </tr>`).join('');
    $('usersBody').querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEdit(b.getAttribute('data-edit'))));
    $('usersBody').querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => del(b.getAttribute('data-del'))));

    renderPager(all.length, pages);
  }

  function renderPager(total, pages) {
    const pager = $('pager');
    if (total <= PAGE_SIZE) { pager.innerHTML = total ? `<span class="pginfo">${total} مشارك</span>` : ''; return; }
    pager.innerHTML =
      `<button id="prevPage" ${page <= 1 ? 'disabled' : ''}>‹ السابق</button>` +
      `<span class="pginfo">صفحة ${page} من ${pages} · ${total} مشارك</span>` +
      `<button id="nextPage" ${page >= pages ? 'disabled' : ''}>التالي ›</button>`;
    const prev = $('prevPage'), next = $('nextPage');
    if (prev) prev.onclick = () => { page--; renderTable(); };
    if (next) next.onclick = () => { page++; renderTable(); };
  }

  function resetAndRender() { page = 1; renderTable(); }
  $('search').addEventListener('input', resetAndRender);
  $('wilayaFilter').addEventListener('change', resetAndRender);
  $('breedFilter').addEventListener('change', resetAndRender);

  // ---- edit modal ----
  const modalBg = $('modalBg');
  const editForm = $('editForm');
  const modalAlert = $('modalAlert');

  function openEdit(id) {
    const p = allParticipants.find((x) => String(x.id) === String(id));
    if (!p) return;
    modalAlert.classList.remove('show');
    editForm.id.value = p.id;
    editForm.fullName.value = p.fullName || '';
    editForm.phone.value = p.phone || '';
    editForm.email.value = p.email || '';
    editForm.notes.value = p.notes || '';
    fillWilayas($('mWilaya'), $('mBaladya'), p.wilaya, p.baladya);
    modalEditor = makeBreedEditor({
      container: $('mBreedsBox'), addBtn: $('mAddBreed'), breeds: allBreeds,
      entries: p.entries && p.entries.length ? p.entries : [{ breed: p.breed || '', birds: p.numBirds, cages: p.numCages }],
    });
    modalBg.classList.add('open');
  }
  function closeEdit() { modalBg.classList.remove('open'); }
  $('closeModal').addEventListener('click', closeEdit);
  modalBg.addEventListener('click', (e) => { if (e.target === modalBg) closeEdit(); });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(editForm));
    data.entries = modalEditor ? modalEditor.entries : [];
    if (data.entries.length === 0) { modalAlert.textContent = 'يرجى إضافة سلالة واحدة على الأقل.'; modalAlert.classList.add('show'); return; }
    try {
      await api('/api/admin/participants/' + data.id, { method: 'PUT', auth: true, body: data });
      closeEdit();
      await loadAll();
    } catch (err) {
      modalAlert.textContent = err.message;
      modalAlert.classList.add('show');
    }
  });

  async function del(id) {
    const p = allParticipants.find((x) => String(x.id) === String(id));
    if (!confirm(`حذف المشارك "${p ? p.fullName : ''}"؟ لا يمكن التراجع.`)) return;
    try { await api('/api/admin/participants/' + id, { method: 'DELETE', auth: true }); await loadAll(); }
    catch (err) { alert(err.message); }
  }

  // ---- CSV export ----
  $('exportBtn').addEventListener('click', () => {
    const rows = filtered();
    const head = ['الاسم', 'الهاتف', 'البريد', 'الولاية', 'البلدية', 'السلالات (طيور/أقفاص)', 'إجمالي الطيور', 'إجمالي الأقفاص', 'ملاحظات', 'التاريخ'];
    const csv = [head.join(',')].concat(rows.map((p) => {
      const breeds = (p.entries || []).map((e) => `${e.breed}:${e.birds}/${e.cages}`).join(' | ') || p.breed || '';
      return [p.fullName, p.phone, p.email, p.wilaya, p.baladya, breeds, p.numBirds, p.numCages, p.notes, fmtDate(p.createdAt)]
        .map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',');
    })).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'participants.csv';
    a.click();
  });

  loadAll();
})();
