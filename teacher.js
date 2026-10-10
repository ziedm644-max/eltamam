'use strict';
/* ==========================================================
   teacher.js - صفحات المدرس (لوحة التحكم + صفحة لكل مرحلة)
   ========================================================== */
const qStage = stage => (stage ? '?stage=' + encodeURIComponent(stage) : '');
const loadingBox = () => '<div class="empty">جاري التحميل...</div>';

function bindTableSearch(root) {
  const inp = $('[data-search]', root);
  if (!inp) return;
  inp.oninput = () => {
    const q = inp.value.trim();
    $$('tbody tr', root).forEach(tr => { tr.hidden = !!q && !tr.textContent.includes(q); });
  };
}
const searchBox = () => `<input type="search" data-search placeholder="ابحث بالاسم..." style="max-width:240px">`;

/* ---------------- نماذج الإضافة ---------------- */
function openAddSheet(stage, done) {
  openModal({
    title: 'إضافة شيت جديد',
    html: `<form id="f">
      <div class="field"><label><span>عنوان الشيت</span><input type="text" name="title" required maxlength="120" placeholder="مثال: شيت الحملة الفرنسية"></label></div>
      <div class="field"><label><span>وصف مختصر (اختياري)</span><textarea name="description" maxlength="600" placeholder="إيه اللي في الشيت؟"></textarea></label></div>
      <div class="field"><span>هتضيف الشيت في أنهي مرحلة تعليمية؟</span>${stageChoices(stage || '')}</div>
      ${fileField('اضغط لاختيار ملف الشيت')}
      <div class="form-err"></div>
      <button class="glass-btn primary block" type="submit">${ico('upload', 18)} رفع ونشر الشيت</button></form>`,
    onMount: (b, close) => {
      const f = $('#f', b);
      f.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(f), file = f.elements.file.files[0];
        const btn = $('button[type=submit]', f), err = $('.form-err', f), pr = $('.progress', f);
        btn.disabled = true; err.textContent = ''; pr.classList.remove('hidden');
        try {
          const up = await uploadFile(file, p => { $('i', pr).style.width = p + '%'; });
          await api('/sheets', { method: 'POST', body: { title: fd.get('title'), description: fd.get('description'), stage: fd.get('stage'), file: up } });
          close(); toast('تم نشر الشيت وظهر للطلاب ✔', 'ok'); done && done();
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; pr.classList.add('hidden'); }
      };
    }
  });
}

function openAddCourse(stage, done) {
  openModal({
    title: 'إضافة كورس جديد',
    html: `<form id="f">
      <div class="field"><label><span>اسم الكورس</span><input type="text" name="title" required maxlength="120" placeholder="مثال: كورس التاريخ الحديث"></label></div>
      <div class="field"><label><span>وصف الكورس (اختياري)</span><textarea name="description" maxlength="600"></textarea></label></div>
      <div class="field"><span>هتضيف الكورس في أنهي مرحلة تعليمية؟</span>${stageChoices(stage || '')}</div>
      <div class="field"><label><span>الدروس (كل درس في سطر)  —  عنوان الدرس | رابط الفيديو</span>
        <textarea name="lessons" style="min-height:120px" placeholder="الدرس الأول: الحملة الفرنسية | https://youtu.be/...&#10;الدرس الثاني: محمد علي | https://youtu.be/..."></textarea></label></div>
      <div class="form-err"></div>
      <button class="glass-btn primary block" type="submit">${ico('plus', 18)} نشر الكورس</button></form>`,
    onMount: (b, close) => {
      const f = $('#f', b);
      f.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(f), btn = $('button[type=submit]', f), err = $('.form-err', f);
        const lessons = String(fd.get('lessons') || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const i = l.lastIndexOf('|');
          return i > -1 ? { title: l.slice(0, i).trim(), url: l.slice(i + 1).trim() } : { title: l, url: '' };
        });
        btn.disabled = true; err.textContent = '';
        try {
          await api('/courses', { method: 'POST', body: { title: fd.get('title'), description: fd.get('description'), stage: fd.get('stage'), lessons } });
          close(); toast('تم نشر الكورس وهيظهر للطلاب كـ "جديد" ✔', 'ok'); done && done();
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      };
    }
  });
}

/* نافذة الدرجة: add (إضافة يدوية) / edit (تعديل) / sub (تقييم تسليم) */
async function gradeModal(o) {
  let who = '';
  if (o.mode === 'add') {
    const { students } = await api('/teacher/students' + qStage(o.stage));
    if (!students.length) return toast('مفيش طلاب مسجلين في المرحلة دي لسه', 'err');
    const groups = {};
    students.forEach(s => (groups[s.stage] = groups[s.stage] || []).push(s));
    who = `<div class="field"><label><span>الطالب</span><select name="studentId" required><option value="">اختار الطالب</option>
      ${Object.entries(groups).map(([st, l]) => `<optgroup label="${esc(st)}">${l.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}
      </select></label></div>`;
  } else who = `<p style="margin-bottom:14px">الطالب: <b>${esc(o.studentName)}</b></p>`;
  openModal({
    title: o.mode === 'edit' ? 'تعديل الدرجة' : o.mode === 'sub' ? 'تقييم التسليم' : 'إضافة درجة',
    html: `<form id="f">${who}
      <div class="field"><label><span>عنوان الدرجة (اختبار / شيت ...)</span><input type="text" name="title" required maxlength="100" value="${esc(o.title || '')}"></label></div>
      <div class="two">
        <div class="field"><label><span>الدرجة</span><input type="number" name="score" required min="0" step="0.25" value="${o.score ?? ''}"></label></div>
        <div class="field"><label><span>من</span><input type="number" name="max" required min="1" step="0.25" value="${o.max ?? 100}"></label></div>
      </div>
      <div class="field"><label><span>ملاحظة (اختياري)</span><input type="text" name="note" maxlength="300" value="${esc(o.note || '')}"></label></div>
      <div class="form-err"></div>
      <button class="glass-btn primary block" type="submit">${ico('check', 18)} حفظ الدرجة</button></form>`,
    onMount: (b, close) => {
      const f = $('#f', b);
      f.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(f), btn = $('button[type=submit]', f), err = $('.form-err', f);
        const body = { title: fd.get('title'), score: fd.get('score'), max: fd.get('max'), note: fd.get('note') };
        btn.disabled = true; err.textContent = '';
        try {
          if (o.mode === 'edit') await api('/teacher/grades/' + o.gradeId, { method: 'PUT', body });
          else await api('/teacher/grades', { method: 'POST', body: { ...body, studentId: o.studentId || fd.get('studentId'), sheetId: o.sheetId || undefined } });
          close(); toast('تم حفظ الدرجة ✔', 'ok'); o.done && o.done();
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      };
    }
  });
}

/* ---------------- الأقسام (بتتكرر في الصفحات وصفحات المراحل) ---------------- */
async function secSheets(root, stage) {
  root.innerHTML = loadingBox();
  const reload = () => secSheets(root, stage);
  try {
    const { sheets } = await api('/sheets' + qStage(stage));
    root.innerHTML = `
      <div class="sec-head"><h2>الشيتات <span class="count">${num(sheets.length)}</span></h2>
        <button class="glass-btn primary" data-add>${ico('plus', 18)} إضافة شيت</button></div>
      ${sheets.length ? `<div class="grid">${sheets.map(s => `
        <article class="card glass-card">
          <div class="card-top"><div class="card-ico">${ico('sheet', 22)}</div><span class="chip">${esc(s.stage)}</span></div>
          <h3>${esc(s.title)}</h3><p class="muted">${esc(s.description || '')}</p>
          <div class="row"><span class="chip">استلموه: ${num(s.opened)}</span><span class="chip ok">سلّموه: ${num(s.submitted)}</span></div>
          <div class="card-foot"><small class="muted">${fmtDate(s.createdAt)}</small>
            <div class="row"><a class="glass-btn sm" href="${esc(s.file.url)}" target="_blank" rel="noopener">فتح</a>
            <button class="glass-btn sm danger" data-del="${s.id}">${ico('trash', 15)}</button></div></div>
        </article>`).join('')}</div>` : emptyBox('لسه ما أضفتش شيتات هنا. اضغط "إضافة شيت".')}`;
  } catch (ex) { root.innerHTML = emptyBox(ex.message); return; }
  root.onclick = async e => {
    if (e.target.closest('[data-add]')) return openAddSheet(stage, reload);
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox('هتحذف الشيت وكل تسليمات الطلاب عليه. متأكد؟', 'حذف')) {
      try { await api('/sheets/' + d.dataset.del, { method: 'DELETE' }); toast('تم الحذف', 'ok'); reload(); } catch (ex) { toast(ex.message, 'err'); }
    }
  };
}

async function secCourses(root, stage) {
  root.innerHTML = loadingBox();
  const reload = () => secCourses(root, stage);
  try {
    const { courses } = await api('/courses' + qStage(stage));
    root.innerHTML = `
      <div class="sec-head"><h2>الكورسات <span class="count">${num(courses.length)}</span></h2>
        <button class="glass-btn primary" data-add>${ico('plus', 18)} إضافة كورس</button></div>
      ${courses.length ? `<div class="grid">${courses.map(c => `
        <article class="card glass-card">
          <div class="card-top"><div class="card-ico">${ico('course', 22)}</div><span class="chip">${esc(c.stage)}</span></div>
          <h3>${esc(c.title)}</h3><p class="muted">${esc(c.description || '')}</p>
          <div class="card-foot"><small class="muted">${num(c.lessons.length)} درس &middot; ${fmtDate(c.createdAt)}</small>
            <button class="glass-btn sm danger" data-del="${c.id}">${ico('trash', 15)}</button></div>
        </article>`).join('')}</div>` : emptyBox('لسه ما أضفتش كورسات هنا. اضغط "إضافة كورس".', 'course')}`;
  } catch (ex) { root.innerHTML = emptyBox(ex.message); return; }
  root.onclick = async e => {
    if (e.target.closest('[data-add]')) return openAddCourse(stage, reload);
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox('متأكد إنك عايز تحذف الكورس؟', 'حذف')) {
      try { await api('/courses/' + d.dataset.del, { method: 'DELETE' }); toast('تم الحذف', 'ok'); reload(); } catch (ex) { toast(ex.message, 'err'); }
    }
  };
}

async function secStudents(root, stage) {
  root.innerHTML = loadingBox();
  const reload = () => secStudents(root, stage);
  try {
    const { students } = await api('/teacher/students' + qStage(stage));
    root.innerHTML = `
      <div class="sec-head"><h2>الطلاب <span class="count">${num(students.length)}</span></h2>${searchBox()}</div>
      ${students.length ? `<div class="glass-card table-wrap"><table>
        <thead><tr><th>الاسم</th><th>الموبايل</th><th>المرحلة</th><th>الكود</th><th>سلّم</th><th>التسجيل</th><th></th></tr></thead>
        <tbody>${students.map(s => `<tr>
          <td><b>${esc(s.name)}</b></td>
          <td><a href="${waLink(s.phone)}" target="_blank" rel="noopener" class="chip ok" style="direction:ltr">${esc(s.phone)}</a></td>
          <td>${esc(s.stage)}</td>
          <td><span class="code-pill">${esc(s.code)}</span></td>
          <td>${num(s.submitted)}</td><td>${fmtDate(s.createdAt)}</td>
          <td><div class="row"><button class="icon-btn" title="نسخ الكود" data-copy="${esc(s.code)}">${ico('copy', 16)}</button>
            <button class="icon-btn" title="حذف" data-del="${s.id}" data-name="${esc(s.name)}">${ico('trash', 16)}</button></div></td>
        </tr>`).join('')}</tbody></table></div>` : emptyBox('لسه مفيش طلاب مسجلين هنا.', 'users')}`;
    bindTableSearch(root);
  } catch (ex) { root.innerHTML = emptyBox(ex.message); return; }
  root.onclick = async e => {
    const c = e.target.closest('[data-copy]');
    if (c) return copyText(c.dataset.copy);
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox(`هتحذف الطالب "${d.dataset.name}" بكل تسليماته ودرجاته. متأكد؟`, 'حذف')) {
      try { await api('/teacher/students/' + d.dataset.del, { method: 'DELETE' }); toast('تم حذف الطالب', 'ok'); reload(); } catch (ex) { toast(ex.message, 'err'); }
    }
  };
}

async function secSubs(root, stage) {
  root.innerHTML = loadingBox();
  const reload = () => secSubs(root, stage);
  let list = [];
  try {
    list = (await api('/teacher/submissions' + qStage(stage))).submissions;
    root.innerHTML = `
      <div class="sec-head"><h2>التسليمات <span class="count">${num(list.length)}</span></h2>${searchBox()}</div>
      ${list.length ? `<div class="glass-card table-wrap"><table>
        <thead><tr><th>الطالب</th><th>الشيت</th><th>الحالة</th><th>ملف الحل</th><th>الدرجة</th><th>التاريخ</th><th></th></tr></thead>
        <tbody>${list.map((s, i) => `<tr>
          <td><b>${esc(s.student.name)}</b><br><small class="muted">${esc(s.student.stage)}</small></td>
          <td>${esc(s.sheet.title)}</td>
          <td>${s.status === 'submitted' ? '<span class="chip ok">سلّم</span>' : '<span class="chip">استلم بس</span>'}</td>
          <td>${s.file ? `<a class="chip" href="${esc(s.file.url)}" target="_blank" rel="noopener">فتح الحل</a>` : '—'}</td>
          <td>${s.grade ? `<span class="chip gold">${num(s.grade.score)} / ${num(s.grade.max)}</span>` : '—'}</td>
          <td>${fmtDate(s.submittedAt || s.takenAt)}</td>
          <td>${s.status === 'submitted' ? `<button class="glass-btn sm primary" data-grade="${i}">${s.grade ? 'تعديل التقييم' : 'تقييم'}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>` : emptyBox('لسه مفيش تسليمات.', 'check')}`;
    bindTableSearch(root);
  } catch (ex) { root.innerHTML = emptyBox(ex.message); return; }
  root.onclick = e => {
    const b = e.target.closest('[data-grade]');
    if (!b) return;
    const s = list[Number(b.dataset.grade)];
    gradeModal({
      mode: 'sub', studentId: s.student.id, studentName: s.student.name, sheetId: s.sheet.id,
      title: s.sheet.title, score: s.grade ? s.grade.score : '', max: s.grade ? s.grade.max : 10, done: reload
    });
  };
}

async function secGrades(root, stage) {
  root.innerHTML = loadingBox();
  const reload = () => secGrades(root, stage);
  let list = [];
  try {
    list = (await api('/teacher/grades' + qStage(stage))).grades;
    root.innerHTML = `
      <div class="sec-head"><h2>الدرجات <span class="count">${num(list.length)}</span></h2>
        <div class="row">${searchBox()}
          <button class="glass-btn" data-csv ${list.length ? '' : 'disabled'}>${ico('download', 18)} تنزيل الدرجات (Excel)</button>
          <button class="glass-btn primary" data-add>${ico('plus', 18)} إضافة درجة</button></div></div>
      ${list.length ? `<div class="glass-card table-wrap"><table>
        <thead><tr><th>الطالب</th><th>المرحلة</th><th>العنوان</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th><th></th></tr></thead>
        <tbody>${list.map((g, i) => `<tr>
          <td><b>${esc(g.student.name)}</b></td><td>${esc(g.student.stage)}</td><td>${esc(g.title)}</td>
          <td><b>${num(g.score)}</b> / ${num(g.max)}</td>
          <td style="min-width:130px"><div class="bar"><i class="${barClass(g.percent)}" style="width:${g.percent}%"></i></div><small class="muted">${num(g.percent)}%</small></td>
          <td>${fmtDate(g.updatedAt)}</td>
          <td><div class="row"><button class="icon-btn" title="تعديل" data-edit="${i}">${ico('edit', 16)}</button>
            <button class="icon-btn" title="حذف" data-del="${g.id}">${ico('trash', 16)}</button></div></td>
        </tr>`).join('')}</tbody></table></div>` : emptyBox('لسه مفيش درجات مسجلة.', 'grade')}`;
    bindTableSearch(root);
  } catch (ex) { root.innerHTML = emptyBox(ex.message); return; }
  root.onclick = async e => {
    if (e.target.closest('[data-add]')) return gradeModal({ mode: 'add', stage, done: reload });
    if (e.target.closest('[data-csv]')) {
      const rows = [['الطالب', 'كود الطالب', 'الموبايل', 'المرحلة', 'العنوان', 'الدرجة', 'من', 'النسبة %', 'التاريخ', 'ملاحظات']];
      list.forEach(g => rows.push([g.student.name, g.student.code, g.student.phone, g.student.stage, g.title, g.score, g.max, g.percent, new Date(g.updatedAt).toLocaleDateString('en-GB'), g.note || '']));
      return downloadCSV(`درجات-${stage || 'كل-المراحل'}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const g = list[Number(ed.dataset.edit)];
      return gradeModal({ mode: 'edit', gradeId: g.id, studentName: g.student.name, title: g.title, score: g.score, max: g.max, note: g.note, done: reload });
    }
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox('متأكد إنك عايز تحذف الدرجة؟', 'حذف')) {
      try { await api('/teacher/grades/' + d.dataset.del, { method: 'DELETE' }); toast('تم الحذف', 'ok'); reload(); } catch (ex) { toast(ex.message, 'err'); }
    }
  };
}

/* ---------------- الصفحات ---------------- */
async function pTDashboard() {
  const { stages, totals } = await api('/teacher/stats');
  const html = `
    <section class="hero glass">
      <p class="eyebrow">لوحة التحكم</p>
      <h1>أهلاً يا <em>${esc(S.config.teacherName)}</em></h1>
      <p>من هنا بتتحكم في الشيتات والكورسات والطلاب والدرجات لكل مرحلة تعليمية.</p>
      <div class="row">
        <button class="glass-btn primary" data-act="sheet">${ico('upload', 18)} إضافة شيت</button>
        <button class="glass-btn" data-act="course">${ico('course', 18)} إضافة كورس</button>
        <button class="glass-btn" data-act="grade">${ico('grade', 18)} إضافة درجة</button>
        <button class="glass-btn" data-act="csv">${ico('download', 18)} تنزيل كل الدرجات</button>
      </div>
    </section>
    <section class="grid stats">
      <div class="glass-card stat"><b>${num(totals.students)}</b><span>طالب مسجّل</span></div>
      <div class="glass-card stat"><b>${num(totals.sheets)}</b><span>شيت منشور</span></div>
      <div class="glass-card stat"><b>${num(totals.courses)}</b><span>كورس</span></div>
      <div class="glass-card stat"><b>${num(totals.submissions)}</b><span>تسليم</span></div>
    </section>
    <div class="sec-head"><h2>المراحل التعليمية</h2></div>
    <div class="grid">${stages.map((s, i) => `
      <a class="glass-card stage-card" href="#/t/stage/${i}">
        <div class="card-top"><div class="card-ico">${ico('layers', 22)}</div>
          ${s.pending ? `<span class="chip new">${num(s.pending)} محتاج تصحيح</span>` : ''}</div>
        <h3>${esc(s.stage)}</h3>
        <div class="mini"><span><b>${num(s.students)}</b> طالب</span><span><b>${num(s.sheets)}</b> شيت</span><span><b>${num(s.courses)}</b> كورس</span></div>
      </a>`).join('')}</div>`;
  return {
    html,
    mount(root) {
      root.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.dataset.act;
        if (a === 'sheet') openAddSheet('', reloadView);
        else if (a === 'course') openAddCourse('', reloadView);
        else if (a === 'grade') gradeModal({ mode: 'add', done: reloadView });
        else if (a === 'csv') {
          try {
            const { grades } = await api('/teacher/grades');
            if (!grades.length) return toast('مفيش درجات لسه', 'err');
            const rows = [['الطالب', 'كود الطالب', 'الموبايل', 'المرحلة', 'العنوان', 'الدرجة', 'من', 'النسبة %', 'التاريخ', 'ملاحظات']];
            grades.forEach(g => rows.push([g.student.name, g.student.code, g.student.phone, g.student.stage, g.title, g.score, g.max, g.percent, new Date(g.updatedAt).toLocaleDateString('en-GB'), g.note || '']));
            downloadCSV('كل-الدرجات-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
          } catch (ex) { toast(ex.message, 'err'); }
        }
      });
    }
  };
}

/* صفحة عامة (كل المراحل) مع فلتر مرحلة */
function pTList(title, secFn) {
  return async () => ({
    html: `<div class="sec-head" style="margin-top:6px"><h2>${esc(title)}</h2>
        <select id="sf" style="max-width:260px"><option value="">كل المراحل</option>
        ${S.config.stages.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div id="sec"></div>`,
    mount(root) {
      const sec = $('#sec', root), sf = $('#sf', root);
      const go = () => secFn(sec, sf.value || null);
      sf.onchange = go;
      go();
    }
  });
}
const pTSheets = pTList('إدارة الشيتات', secSheets);
const pTCourses = pTList('إدارة الكورسات', secCourses);
const pTStudents = pTList('الطلاب', secStudents);
const pTSubs = pTList('تسليمات الطلاب', secSubs);
const pTGrades = pTList('درجات الطلاب', secGrades);

/* صفحة خاصة بكل مرحلة تعليمية */
async function pTStage(i) {
  const stage = S.config.stages[Number(i)];
  if (!stage) { location.hash = '#/t/dashboard'; return { html: '' }; }
  const tabs = [['sheets', 'الشيتات', secSheets], ['courses', 'الكورسات', secCourses], ['students', 'الطلاب', secStudents],
    ['subs', 'التسليمات', secSubs], ['grades', 'الدرجات', secGrades]];
  return {
    html: `<section class="hero glass" style="padding:26px 28px;margin-bottom:6px">
        <p class="eyebrow">صفحة المرحلة</p><h1><em>${esc(stage)}</em></h1>
        <div class="row"><a class="glass-btn sm" href="#/t/dashboard">${ico('home', 16)} الرجوع للوحة التحكم</a></div></section>
      <div class="tabs">${tabs.map(([k, l], n) => `<button data-tab="${k}" class="${n ? '' : 'active'}">${l}</button>`).join('')}</div>
      <div id="sec"></div>`,
    mount(root) {
      const sec = $('#sec', root);
      const show = k => {
        $$('.tabs button', root).forEach(b => b.classList.toggle('active', b.dataset.tab === k));
        tabs.find(t => t[0] === k)[2](sec, stage);
      };
      $('.tabs', root).addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
      show('sheets');
    }
  };
}
