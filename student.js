'use strict';
/* ==========================================================
   student.js - صفحات الطالب
   ========================================================== */
const firstName = () => (S.user && S.user.name ? S.user.name.split(' ')[0] : '');

/* ---------- كروت ---------- */
function sheetCard(s) {
  const status = { taken: '<span class="chip">تم الاستلام</span>', submitted: '<span class="chip ok">تم التسليم</span>' }[s.status] || '';
  const grade = s.grade ? `<span class="chip gold">${num(s.grade.score)} / ${num(s.grade.max)}</span>` : '';
  const mine = s.mySubmissionFile
    ? `<a class="chip" href="${esc(s.mySubmissionFile.url)}" target="_blank" rel="noopener">حلّي</a>` : '';
  return `<article class="card glass-card sheet" data-id="${s.id}">
    <div class="card-top"><div class="card-ico">${ico('sheet', 22)}</div>
      <div class="badges">${s.isNew ? '<span class="chip new">جديد</span>' : ''}${status}${grade}${mine}</div></div>
    <h3>${esc(s.title)}</h3>
    <p class="muted">${esc(s.description || 'شيت مراجعة من مستر إبراهيم')}</p>
    <div class="card-foot"><small class="muted">${fmtDate(s.createdAt)}</small>
      <div class="row">
        <a class="glass-btn sm primary" href="${esc(s.file.url)}" target="_blank" rel="noopener" data-open="${s.id}">${ico('download', 16)} فتح الشيت</a>
        <button class="glass-btn sm" data-submit="${s.id}">${ico('upload', 16)} ${s.status === 'submitted' ? 'إعادة التسليم' : 'تسليم الحل'}</button>
      </div></div>
  </article>`;
}

function courseCard(c) {
  return `<article class="card glass-card course">
    <div class="card-top"><div class="card-ico">${ico('course', 22)}</div>
      <div class="badges">${c.isNew ? '<span class="chip new">كورس جديد</span>' : ''}${c.enrolled ? '<span class="chip ok">مشترك</span>' : ''}</div></div>
    <h3>${esc(c.title)}</h3>
    <p class="muted">${esc(c.description || '')}</p>
    <div class="card-foot"><small class="muted">${num(c.lessonsCount)} درس</small>
      <button class="glass-btn sm primary" data-course="${c.id}" data-enrolled="${c.enrolled ? 1 : 0}">${c.enrolled ? 'متابعة الكورس' : 'اشترك في الكورس'}</button>
    </div>
  </article>`;
}

function bindSheetActions(root) {
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-open]');
    if (a) {
      api('/sheets/' + a.dataset.open + '/open', { method: 'POST', keepalive: true }).then(refreshBadges).catch(() => {});
      const card = a.closest('.sheet');
      if (card) { const n = $('.chip.new', card); if (n) n.remove(); }
      return;
    }
    const b = e.target.closest('[data-submit]');
    if (b) submitSheetModal(b.dataset.submit);
  });
}

function bindCourseActions(root) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-course]');
    if (!b) return;
    const id = b.dataset.course;
    try {
      if (b.dataset.enrolled !== '1') { await api('/courses/' + id + '/enroll', { method: 'POST' }); toast('تم الاشتراك في الكورس ✔', 'ok'); }
      else await api('/courses/' + id + '/seen', { method: 'POST' });
      refreshBadges();
      location.hash = '#/courses';
    } catch (ex) { toast(ex.message, 'err'); }
  });
}

function submitSheetModal(id) {
  openModal({
    title: 'تسليم الحل',
    html: `<form id="sf"><p class="muted" style="margin-bottom:14px">ارفع صورة واضحة للحل أو ملف PDF / Word.</p>
      ${fileField('اضغط لاختيار ملف الحل')}
      <div class="form-err"></div>
      <button class="glass-btn primary block" type="submit">إرسال الحل</button></form>`,
    onMount: (b, close) => {
      const f = $('#sf', b);
      f.onsubmit = async e => {
        e.preventDefault();
        const file = f.elements.file.files[0];
        if (!file) return;
        const btn = $('button[type=submit]', f), err = $('.form-err', f), pr = $('.progress', f);
        btn.disabled = true; err.textContent = ''; pr.classList.remove('hidden');
        try {
          const up = await uploadFile(file, p => { $('i', pr).style.width = p + '%'; });
          await api('/sheets/' + id + '/submit', { method: 'POST', body: { file: up } });
          close(); toast('تم تسليم الحل بنجاح ✔', 'ok');
          refreshBadges(); reloadView();
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; pr.classList.add('hidden'); }
      };
    }
  });
}

/* ---------- الرئيسية ---------- */
async function pStudentHome() {
  const [sh, co] = await Promise.all([api('/sheets'), api('/courses')]);
  const sheets = sh.sheets, courses = co.courses;
  const fresh = sheets.filter(s => s.isNew);
  const newCourses = courses.filter(c => c.isNew).length;
  const submitted = sheets.filter(s => s.status === 'submitted').length;
  const enrolled = courses.filter(c => c.enrolled).length;
  const html = `
    <section class="hero glass">
      <p class="eyebrow">أهلاً بك في منصة ${esc(S.config.teacherName)}</p>
      <h1>مرحباً يا <em>${esc(firstName())}</em>، يوم جديد مع التاريخ</h1>
      <p>هنا هتلاقي شيتات المراجعة والكورسات ودرجاتك في مكان واحد، كله متنظّم ومخصوص لمرحلتك الدراسية.</p>
      <span class="stage-badge">${ico('layers', 16)} ${esc(S.user.stage)}</span>
      <div class="row">
        <button class="glass-btn primary" data-scroll="new-sheets">${ico('sheet', 18)} الشيتات الجديدة ${fresh.length ? '(' + num(fresh.length) + ')' : ''}</button>
        <button class="glass-btn" data-scroll="all-courses">${ico('course', 18)} الكورسات ${newCourses ? '(' + num(newCourses) + ' جديد)' : ''}</button>
      </div>
    </section>

    <section class="grid stats">
      <div class="glass-card stat"><b>${num(sheets.length)}</b><span>شيت متاح</span></div>
      <div class="glass-card stat"><b>${num(submitted)}</b><span>شيت سلّمته</span></div>
      <div class="glass-card stat"><b>${num(courses.length)}</b><span>كورس متاح</span></div>
      <div class="glass-card stat"><b>${num(enrolled)}</b><span>كورساتك</span></div>
    </section>

    <div class="sec-head" id="new-sheets"><h2>الشيتات الجديدة ${fresh.length ? `<span class="count">${num(fresh.length)}</span>` : ''}</h2></div>
    ${fresh.length ? `<div class="grid">${fresh.map(sheetCard).join('')}</div>` : emptyBox('مفيش شيتات جديدة دلوقتي، هتظهر هنا أول ما مستر إبراهيم يضيف شيت جديد.')}

    <div class="sec-head"><h2>كل الشيتات المتاحة <span class="count">${num(sheets.length)}</span></h2></div>
    ${sheets.length ? `<div class="grid">${sheets.map(sheetCard).join('')}</div>` : emptyBox('لسه مفيش شيتات في مرحلتك.')}

    <div class="sec-head" id="all-courses"><h2>كل الكورسات <span class="count">${num(courses.length)}</span></h2></div>
    ${courses.length ? `<div class="grid">${courses.map(courseCard).join('')}</div>` : emptyBox('لسه مفيش كورسات في مرحلتك.', 'course')}`;
  return {
    html,
    mount(root) {
      bindSheetActions(root);
      bindCourseActions(root);
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-scroll]');
        if (b) document.getElementById(b.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };
}

/* ---------- شيتاتي (اللي استلمتها / سلّمتها) ---------- */
async function pStudentSheets() {
  const { sheets } = await api('/my/sheets');
  const done = sheets.filter(s => s.status === 'submitted').length;
  const html = `
    <div class="sec-head" style="margin-top:6px"><h2>شيتاتي <span class="count">${num(sheets.length)}</span></h2>
      <span class="muted">استلمت ${num(sheets.length)} &middot; سلّمت ${num(done)}</span></div>
    ${sheets.length ? `<div class="grid">${sheets.map(sheetCard).join('')}</div>`
      : emptyBox('لسه ما استلمتش أي شيت. افتح أي شيت من الرئيسية وهيظهر هنا.')}
    <div class="row" style="margin-top:22px"><a class="glass-btn" href="#/home">${ico('home', 18)} تصفّح كل الشيتات</a></div>`;
  return { html, mount: bindSheetActions };
}

/* ---------- درجاتي ---------- */
async function pStudentGrades() {
  const { grades, average } = await api('/my/grades');
  const best = grades.length ? Math.max(...grades.map(g => g.percent)) : null;
  const html = `
    <div class="sec-head" style="margin-top:6px"><h2>درجاتي <span class="count">${num(grades.length)}</span></h2></div>
    <section class="grid stats" style="margin-bottom:20px">
      <div class="glass-card stat"><b>${average === null ? '—' : num(average) + '%'}</b><span>المتوسط العام</span></div>
      <div class="glass-card stat"><b>${best === null ? '—' : num(best) + '%'}</b><span>أعلى نتيجة</span></div>
      <div class="glass-card stat"><b>${num(grades.length)}</b><span>عدد التقييمات</span></div>
    </section>
    ${grades.length ? `<div class="list">${grades.map(g => `
      <div class="glass-card grade-row">
        <div><h3>${esc(g.title)}</h3><small class="muted">${fmtDate(g.updatedAt)}${g.note ? ' &middot; ' + esc(g.note) : ''}</small></div>
        <div class="score">${num(g.score)} <small class="muted">/ ${num(g.max)}</small></div>
        <div class="bar"><i class="${barClass(g.percent)}" style="width:${g.percent}%"></i></div>
      </div>`).join('')}</div>`
      : emptyBox('لسه مفيش درجات. هتظهر هنا بعد ما مستر إبراهيم يصحّح شيتاتك واختباراتك.', 'grade')}`;
  return { html };
}

/* ---------- كورساتي ---------- */
async function pStudentCourses() {
  const { courses } = await api('/courses');
  const mine = courses.filter(c => c.enrolled);
  const html = `
    <div class="sec-head" style="margin-top:6px"><h2>كورساتي <span class="count">${num(mine.length)}</span></h2></div>
    ${mine.length ? `<div class="list">${mine.map(c => `
      <article class="glass-card card">
        <div class="card-top"><div class="card-ico">${ico('course', 22)}</div><span class="chip">${num(c.lessons.length)} درس</span></div>
        <h3>${esc(c.title)}</h3><p class="muted">${esc(c.description || '')}</p>
        ${c.lessons.length ? `<ul class="lessons">${c.lessons.map((l, i) => l.url
          ? `<li><a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="n">${num(i + 1)}</span><span>${esc(l.title)}</span></a></li>`
          : `<li><span><span class="n">${num(i + 1)}</span><span>${esc(l.title)}</span></span></li>`).join('')}</ul>`
          : '<p class="muted">الدروس هتتضاف قريب.</p>'}
      </article>`).join('')}</div>`
      : emptyBox('لسه ما اشتركتش في أي كورس. تصفّح الكورسات المتاحة واشترك.', 'course')}
    <div class="row" style="margin-top:22px"><a class="glass-btn primary" href="#/home" data-goto-courses>${ico('course', 18)} تصفّح كل الكورسات</a></div>`;
  return {
    html,
    mount(root) {
      const b = $('[data-goto-courses]', root);
      if (b) b.addEventListener('click', () => setTimeout(() => { const t = document.getElementById('all-courses'); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 700));
    }
  };
}

/* ---------- تواصل ---------- */
async function pStudentContact() {
  const phone = S.config.supportPhone;
  const html = `
    <div class="sec-head" style="margin-top:6px"><h2>تواصل معنا</h2></div>
    <div class="contact-card">
      <div class="glass-card card" style="gap:16px">
        <h3>كلّمنا على واتساب</h3>
        <p class="muted">أي استفسار عن الشيتات أو الدرجات أو الكورسات، ابعتلنا وهنرد عليك في أقرب وقت.</p>
        <a class="wa-big" href="${waLink(phone)}" target="_blank" rel="noopener">
          <div class="card-ico">${ico('whatsapp', 28)}</div>
          <div><small class="muted">اضغط للتواصل مباشرة</small><b>${esc(phone)}</b></div>
        </a>
      </div>
      <form class="glass-card card" id="cf">
        <h3>ابعت رسالة</h3>
        <div class="field"><span>رسالتك</span><textarea name="msg" required placeholder="اكتب سؤالك أو مشكلتك هنا..."></textarea></div>
        <button class="glass-btn green block" type="submit">${ico('send', 18)} إرسال على واتساب</button>
      </form>
    </div>`;
  return {
    html,
    mount(root) {
      $('#cf', root).onsubmit = e => {
        e.preventDefault();
        const msg = `السلام عليكم مستر إبراهيم، أنا ${S.user.name} (${S.user.stage}).\n${e.target.elements.msg.value}`;
        window.open(waLink(phone, msg), '_blank', 'noopener');
      };
    }
  };
}
