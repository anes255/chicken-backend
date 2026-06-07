/* Admin dashboard logic: stats, participant table, edit/delete, CSV export. */
(function () {
  if (!Auth.isLoggedIn || Auth.role !== 'admin') { location.href = 'login.html'; return; }

  const $ = (id) => document.getElementById(id);
  let allParticipants = [];

  $('logoutBtn').addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });

  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString('ar-DZ', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { return d; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function loadAll() {
    try {
      const [stats, list] = await Promise.all([
        api('/api/admin/stats', { auth: true }),
        api('/api/admin/participants', { auth: true }),
      ]);
      renderStats(stats);
      allParticipants = list.participants;
      renderWilayaFilter();
      renderTable();
      $('loading').classList.add('hidden');
      $('content').classList.remove('hidden');
    } catch (e) {
      if (String(e.message).match(/الجلسة|الدخول|الإدارة/)) { Auth.logout(); return; }
      $('loading').innerHTML = '<p style="color:var(--danger)">' + esc(e.message) + '</p>';
    }
  }

  function renderStats(s) {
    countUp($('tParticipants'), s.totals.total_participants);
    countUp($('tBirds'), s.totals.total_birds);
    countUp($('tCages'), s.totals.total_cages);
    countUp($('tWilayas'), s.byWilaya.length);
    const max = Math.max(1, ...s.byWilaya.map((w) => w.participants));
    $('wilayaStats').innerHTML = s.byWilaya.map((w) => `
      <tr>
        <td><b>${esc(w.wilaya)}</b></td>
        <td><span class="badge">${w.participants}</span></td>
        <td>${w.birds}</td>
        <td>${w.cages}</td>
        <td><div class="bar" style="width:${Math.round((w.participants / max) * 100)}%"></div></td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">لا توجد بيانات بعد.</td></tr>';
  }

  function renderWilayaFilter() {
    const wilayas = [...new Set(allParticipants.map((p) => p.wilaya))].sort();
    $('wilayaFilter').innerHTML = '<option value="">كل الولايات</option>' +
      wilayas.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const w = $('wilayaFilter').value;
    return allParticipants.filter((p) =>
      (!w || p.wilaya === w) &&
      (!q || (p.fullName || '').toLowerCase().includes(q) || (p.phone || '').includes(q))
    );
  }

  function renderTable() {
    const rows = filtered();
    $('emptyMsg').classList.toggle('hidden', rows.length > 0);
    $('usersBody').innerHTML = rows.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(p.fullName)}</b></td>
        <td>${esc(p.phone)}</td>
        <td><span class="badge beige">${esc(p.wilaya)}</span></td>
        <td>${esc(p.baladya)}</td>
        <td>${p.numBirds}</td>
        <td>${p.numCages}</td>
        <td>${esc(p.breed) || '—'}</td>
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
  }

  $('search').addEventListener('input', renderTable);
  $('wilayaFilter').addEventListener('change', renderTable);

  // ---- edit modal ----
  const modalBg = $('modalBg');
  const editForm = $('editForm');
  const modalAlert = $('modalAlert');
  fillWilayas($('mWilaya'), $('mBaladya'));

  function openEdit(id) {
    const p = allParticipants.find((x) => String(x.id) === String(id));
    if (!p) return;
    modalAlert.classList.remove('show');
    editForm.id.value = p.id;
    editForm.fullName.value = p.fullName || '';
    editForm.phone.value = p.phone || '';
    editForm.email.value = p.email || '';
    editForm.breed.value = p.breed || '';
    editForm.numBirds.value = p.numBirds;
    editForm.numCages.value = p.numCages;
    editForm.notes.value = p.notes || '';
    fillWilayas($('mWilaya'), $('mBaladya'), p.wilaya, p.baladya);
    modalBg.classList.add('open');
  }
  function closeEdit() { modalBg.classList.remove('open'); }
  $('closeModal').addEventListener('click', closeEdit);
  modalBg.addEventListener('click', (e) => { if (e.target === modalBg) closeEdit(); });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(editForm));
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
    try {
      await api('/api/admin/participants/' + id, { method: 'DELETE', auth: true });
      await loadAll();
    } catch (err) { alert(err.message); }
  }

  // ---- CSV export ----
  $('exportBtn').addEventListener('click', () => {
    const rows = filtered();
    const head = ['الاسم', 'الهاتف', 'البريد', 'الولاية', 'البلدية', 'عدد الطيور', 'عدد الأقفاص', 'السلالة', 'ملاحظات', 'التاريخ'];
    const csv = [head.join(',')].concat(rows.map((p) =>
      [p.fullName, p.phone, p.email, p.wilaya, p.baladya, p.numBirds, p.numCages, p.breed, p.notes, fmtDate(p.createdAt)]
        .map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')
    )).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'participants.csv';
    a.click();
  });

  loadAll();
})();
