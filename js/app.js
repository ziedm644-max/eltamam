'use strict';
/* ==========================================================
   app.js - الراوتر + القائمة الليكويد + تسجيل الدخول + الودجتات + المساعد الذكي
   ========================================================== */
const SNAV = [
  ['home', 'الرئيسية', 'home'], ['sheets', 'شيتاتي', 'sheet'], ['grades', 'درجاتي', 'grade'],
  ['courses', 'كورساتي', 'course'], ['contact', 'تواصل', 'chat']
];
const TNAV = [
  ['t/dashboard', 'لوحتي', 'home'], ['t/sheets', 'الشيتات', 'sheet'], ['t/courses', 'الكورسات', 'course'],
  ['t/students', 'الطلاب', 'users'], ['t/submissions', 'التسليمات', 'check'], ['t/grades', 'الدرجات', 'grade']
];
const PAGES = {
  home: pStudentHome, sheets: pStudentSheets, grades: pStudentGrades, courses: pStudentCourses, contact: pStudentContact,
  't/dashboard': pTDashboard, 't/sheets': pTSheets, 't/courses': pTCourses, 't/students': pTStudents,
  't/submissions': pTSubs, 't/grades': pTGrades
};

let navId = 0;
let shellRole = '';
const homeHash = () => (S.role === 'teacher' ? '#/t/dashboard' : '#/home');
function go(hash) { if (location.hash === hash) router(); else location.hash = hash; }
const reloadView = () => router({ silent: true });

/* ---------- الهيكل (الهيدر + القائمة الليكويد) ---------- */
function buildShell() {
  const items = S.role === 'teacher' ? TNAV : SNAV;
  const name = (S.user && S.user.name) || '';
  $('#app').innerHTML = `
    <div class="shell">
      <header class="topbar glass">
        <div class="brand">${logoMark(22)}<div><b>${esc(S.config.teacherName)}</b><small>تاريخ ودراسات اجتماعية</small></div></div>
        <nav class="nav" id="nav"><span class="liquid"></span>
          ${items.map(([r, l, i]) => `<a href="#/${r}" data-route="${r}">${ico(i, 18)}<span>${l}</span></a>`).join('')}
        </nav>
        <div class="user-box">
          <div class="user-chip"><span class="av">${esc(name.trim().charAt(0) || 'م')}</span><span>${esc(name)}</span></div>
          <button class="icon-btn" id="logout" title="تسجيل الخروج" aria-label="تسجيل الخروج">${ico('logout', 18)}</button>
        </div>
      </header>
      <main id="view"></main>
      <footer class="footer">&copy; ${new Date().getFullYear()} ${esc(S.config.teacherName)} &mdash; جميع الحقوق محفوظة</footer>
    </div>`;
  shellRole = S.role;
  $('#logout').onclick = async () => {
    try { await api('/logout', { method: 'POST', quiet: true }); } catch {}
    setSession('', '');
    sessionStorage.removeItem('it_welcome');
    shellRole = '';
    go('#/login');
  };
}

function moveLiquid() {
  const nav = $('#nav');
  if (!nav) return;
  const act = $('a.active', nav), pill = $('.liquid', nav);
  if (!act || !pill) return;
  const first = !pill.dataset.ready;
  if (first) pill.style.transition = 'none';
  pill.style.width = act.offsetWidth + 'px';
  pill.style.transform = `translateX(${act.offsetLeft}px)`;
  if (first) { void pill.offsetWidth; pill.style.transition = ''; pill.dataset.ready = '1'; }
  else { pill.classList.remove('moving'); void pill.offsetWidth; pill.classList.add('moving'); }
}
function setActiveNav(path) {
  $$('#nav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', path === r || (r === 't/dashboard' && path.startsWith('t/stage/')));
  });
  moveLiquid();
}
window.addEventListener('resize', () => { const p = $('.liquid'); if (p) { p.style.transition = 'none'; delete p.dataset.ready; moveLiquid(); } });
window.addEventListener('load', moveLiquid);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const p = $('.liquid'); if (p) { delete p.dataset.ready; moveLiquid(); } });

/* ---------- إشعارات (شيت / كورس جديد) ---------- */
async function refreshBadges() {
  if (S.role !== 'student' || !S.token) return;
  try {
    const s = await api('/summary', { quiet: true });
    S.summary = s;
    const a = $('#nav a[data-route="home"]');
    if (!a) return s;
    let b = $('.badge', a);
    const n = s.newSheets + s.newCourses;
    if (n) {
      if (!b) { b = document.createElement('i'); b.className = 'badge'; a.appendChild(b); }
      b.textContent = num(n);
    } else if (b) b.remove();
    return s;
  } catch {}
}

async function welcomeStudent() {
  if (sessionStorage.getItem('it_welcome') === '1') return;
  sessionStorage.setItem('it_welcome', '1');
  const s = await refreshBadges();
  const parts = [];
  if (s && s.newSheets) parts.push(`<li>${num(s.newSheets)} شيت جديد في مرحلتك</li>`);
  if (s && s.newCourses) parts.push(`<li><b>كورس جديد:</b> ${esc(s.newCourseTitles.join('، '))}</li>`);
  openModal({
    title: `أهلاً بيك يا ${firstName()}`,
    html: `<p class="muted" style="margin-bottom:12px">نورت منصة <b style="color:var(--text)">${esc(S.config.teacherName)}</b>. كل اللي محتاجه للتاريخ والدراسات الاجتماعية في مكان واحد.</p>
      ${parts.length ? `<div class="glass-card" style="padding:14px 18px;margin-bottom:16px"><b style="color:var(--blue-2)">جديد من آخر زيارة</b><ul style="margin:6px 18px 0">${parts.join('')}</ul></div>` : ''}
      <button class="glass-btn primary block" data-close>يلا نبدأ</button>`
  });
}

/* ---------- الراوتر + انتقال الصفحات ---------- */
async function router(opts = {}) {
  const my = ++navId;
  const path = location.hash.replace(/^#\/?/, '');
  if (!S.token) {
    if (path !== 'login') { location.hash = '#/login'; return; }
    return showLogin();
  }
  if (!path || path === 'login') { location.hash = homeHash(); return; }
  if ((S.role === 'teacher') !== path.startsWith('t/')) { location.hash = homeHash(); return; }
  const m = path.match(/^t\/stage\/(\d+)$/);
  const page = m ? () => pTStage(m[1]) : PAGES[path];
  if (!page) { location.hash = homeHash(); return; }
  if (!$('#view') || shellRole !== S.role) buildShell();
  setActiveNav(path);
  const view = $('#view'), bar = $('#loadbar');
  if (!opts.silent) {
    bar.className = 'loadbar on';
    view.classList.remove('entering');
    view.classList.add('leaving');
    await sleep(190);
  }
  let res;
  try { res = await page(); } catch (ex) { res = { html: emptyBox(ex.message) }; }
  if (my !== navId) return;
  view.classList.remove('leaving', 'entering');
  view.innerHTML = res.html || '';
  if (res.mount) res.mount(view);
  if (!opts.silent) {
    window.scrollTo({ top: 0 });
    void view.offsetWidth;
    view.classList.add('entering');
  }
  bar.className = 'loadbar done';
  if (!opts.silent) refreshBadges();
}
window.addEventListener('hashchange', () => router());

/* ---------- صفحة الدخول ---------- */
function showLogin() {
  shellRole = '';
  const registered = !!localStorage.getItem('it_registered');
  $('#app').innerHTML = `
    <div class="auth"><div class="auth-box glass">
      <div class="auth-side">
        ${logoMark(36)}
        <p class="eyebrow">أهلاً بك في منصة</p>
        <h1><em>${esc(S.config.teacherName)}</em>تاريخ ودراسات اجتماعية</h1>
        <p>منصة تعليمية متكاملة: شيتات مراجعة، كورسات، ومتابعة لدرجاتك لحظة بلحظة.</p>
        <ul class="auth-points">
          <li>${ico('check', 18)} كود خاص بيك تدخل بيه في ثانية</li>
          <li>${ico('check', 18)} شيتات وكورسات مخصوصة لمرحلتك</li>
          <li>${ico('check', 18)} متابعة درجاتك وتسليماتك</li>
        </ul>
      </div>
      <div class="auth-main">
        <div class="tabs" id="auth-tabs">
          <button data-t="code">دخول بالكود</button><button data-t="new">طالب جديد</button><button data-t="teacher">المدرس</button>
        </div>

        <form data-form="code">
          <div class="field"><label><span>كود الطالب (6 أرقام)</span>
            <input class="code-input" type="text" name="code" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="______" required></label></div>
          <div class="form-err"></div>
          <button class="glass-btn primary block" type="submit">دخول</button>
          <p class="muted" style="text-align:center;margin-top:14px;font-size:.88rem">نسيت الكود؟ <a href="${waLink(S.config.supportPhone, 'نسيت كود الدخول على المنصة')}" target="_blank" rel="noopener" style="color:var(--blue-2);font-weight:700">كلّم الدعم</a></p>
        </form>

        <form data-form="new">
          <div class="field"><label><span>الاسم بالكامل</span><input type="text" name="name" required minlength="3" maxlength="60" autocomplete="name" placeholder="الاسم الثلاثي"></label></div>
          <div class="field"><label><span>رقم الموبايل</span><input type="tel" name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" style="direction:ltr;text-align:right"></label></div>
          <div class="field"><span>مرحلتك الدراسية</span>${stageChoices('')}</div>
          <div class="form-err"></div>
          <button class="glass-btn primary block" type="submit">إنشاء حساب واستلام الكود</button>
        </form>

        <form data-form="teacher">
          <div class="field"><label><span>اسم المستخدم</span><input type="text" name="username" required autocomplete="username"></label></div>
          <div class="field"><label><span>كلمة السر</span><input type="password" name="password" required autocomplete="current-password"></label></div>
          <div class="form-err"></div>
          <button class="glass-btn primary block" type="submit">دخول المدرس</button>
        </form>
      </div>
    </div></div>`;
  const root = $('#app');
  const showTab = t => {
    $$('#auth-tabs button', root).forEach(b => b.classList.toggle('active', b.dataset.t === t));
    $$('form[data-form]', root).forEach(f => f.classList.toggle('hidden', f.dataset.form !== t));
  };
  showTab(registered ? 'code' : 'new');
  $('#auth-tabs', root).onclick = e => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); };

  const handle = (name, fn) => {
    const f = $(`form[data-form="${name}"]`, root);
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', f), err = $('.form-err', f), label = btn.textContent;
      btn.disabled = true; err.textContent = ''; btn.textContent = 'لحظة...';
      try { await fn(new FormData(f)); }
      catch (ex) { err.textContent = ex.message; }
      btn.disabled = false; btn.textContent = label;
    };
  };

  handle('code', async fd => {
    const r = await api('/login', { method: 'POST', body: { code: fd.get('code') }, quiet: true });
    setSession(r.token, 'student'); S.user = r.student;
    localStorage.setItem('it_registered', '1');
    sessionStorage.removeItem('it_welcome');
    go('#/home');
    welcomeStudent();
  });
  handle('new', async fd => {
    const r = await api('/register', { method: 'POST', body: { name: fd.get('name'), phone: fd.get('phone'), stage: fd.get('stage') }, quiet: true });
    setSession(r.token, 'student'); S.user = r.student;
    localStorage.setItem('it_registered', '1');
    sessionStorage.setItem('it_welcome', '1');
    go('#/home');
    showCodeModal(r.student);
  });
  handle('teacher', async fd => {
    const r = await api('/teacher/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') }, quiet: true });
    setSession(r.token, 'teacher'); S.user = r.teacher;
    go('#/t/dashboard');
  });
}

function showCodeModal(st) {
  openModal({
    title: 'تم إنشاء حسابك بنجاح',
    html: `<p class="muted">أهلاً بيك يا <b style="color:var(--text)">${esc(st.name.split(' ')[0])}</b> في منصة ${esc(S.config.teacherName)}. ده الكود الخاص بيك، هتدخل بيه كل مرة بدل التسجيل من الأول:</p>
      <div class="code-box"><b>${esc(st.code)}</b></div>
      <div class="row" style="justify-content:center;margin-bottom:12px">
        <button class="glass-btn" data-copy>${ico('copy', 18)} نسخ الكود</button>
        <a class="glass-btn green" target="_blank" rel="noopener" href="${waLink(st.phone, 'كود دخولي على منصة مستر إبراهيم التمام: ' + st.code)}">${ico('whatsapp', 18)} احفظه على واتساب</a>
      </div>
      <p class="muted" style="font-size:.86rem;margin-bottom:16px">احتفظ بالكود (سكرين شوت أو نسخ) ومتشاركوش مع حد. لو نسيته كلّم الدعم.</p>
      <button class="glass-btn primary block" data-close>دخول المنصة</button>`,
    onMount: b => { $('[data-copy]', b).onclick = () => copyText(st.code); }
  });
}

/* ---------- الودجتات: المساعد الذكي + الدعم ---------- */
function fmtBot(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
function buildWidgets() {
  const phone = S.config.supportPhone;
  $('#widgets').innerHTML = `
    <section class="ai-panel glass" id="ai-panel" aria-label="المساعد الذكي">
      <div class="ai-head">${ico('sparkle', 22)}<b>المساعد الذكي<small>اسألني عن المنصة أو عن دروسك</small></b>
        <button class="icon-btn" id="ai-close" aria-label="إغلاق">${ico('close', 16)}</button></div>
      <div class="ai-msgs" id="ai-msgs"></div>
      <div class="ai-sug" id="ai-sug">
        <button>إزاي أسلّم الشيت؟</button><button>فين درجاتي؟</button><button>إزاي أشترك في كورس؟</button><button>نسيت الكود</button>
      </div>
      <form class="ai-form" id="ai-form"><input type="text" id="ai-input" placeholder="اكتب سؤالك..." maxlength="500" autocomplete="off"><button aria-label="إرسال">${ico('send', 18)}</button></form>
    </section>
    <button class="fab ai" id="ai-fab" title="المساعد الذكي" aria-label="المساعد الذكي">${ico('sparkle', 26)}</button>
    <div class="wa-wrap">
      <div class="support-pop" id="support-pop"><a href="${waLink(phone)}" target="_blank" rel="noopener">تواصل مع الدعم</a>
        <button id="pop-close" aria-label="إغلاق">${ico('close', 14)}</button></div>
      <a class="fab wa" href="${waLink(phone)}" target="_blank" rel="noopener" title="تواصل مع الدعم" aria-label="تواصل مع الدعم على واتساب">${ico('whatsapp', 26)}</a>
    </div>`;

  /* علامة الدعم المنبثقة */
  const pop = $('#support-pop');
  const showPop = () => { if (!sessionStorage.getItem('sp_off')) { pop.classList.add('show'); setTimeout(() => pop.classList.remove('show'), 9000); } };
  setTimeout(showPop, 4500);
  setInterval(showPop, 50000);
  $('#pop-close').onclick = () => { pop.classList.remove('show'); sessionStorage.setItem('sp_off', '1'); };

  /* المساعد الذكي */
  const panel = $('#ai-panel'), msgs = $('#ai-msgs'), input = $('#ai-input');
  const chat = [];
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; };
  const greet = () => add('bot', 'أهلاً بيك! أنا مساعد منصة مستر إبراهيم التمام. اسألني عن الشيتات والدرجات والكورسات، أو حتى عن دروس التاريخ والدراسات.');
  greet();
  const toggle = open => {
    panel.classList.toggle('open', open);
    if (open) setTimeout(() => input.focus(), 400);
  };
  $('#ai-fab').onclick = () => toggle(!panel.classList.contains('open'));
  $('#ai-close').onclick = () => toggle(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });

  const send = async text => {
    text = text.trim();
    if (!text) return;
    $('#ai-sug').classList.add('hidden');
    add('me', esc(text));
    chat.push({ role: 'user', content: text });
    const typing = add('bot', '<span class="typing"><i></i><i></i><i></i></span>');
    try {
      const r = await api('/ai', { method: 'POST', body: { messages: chat.slice(-8) }, quiet: true });
      typing.innerHTML = fmtBot(r.reply);
      chat.push({ role: 'assistant', content: r.reply });
    } catch (ex) {
      typing.innerHTML = esc(ex.message);
      chat.pop();
    }
    msgs.scrollTop = msgs.scrollHeight;
  };
  $('#ai-form').onsubmit = e => { e.preventDefault(); const v = input.value; input.value = ''; send(v); };
  $('#ai-sug').onclick = e => { const b = e.target.closest('button'); if (b) send(b.textContent); };
}

/* ---------- التشغيل ---------- */
(async function init() {
  const t0 = Date.now();
  $('#splash-logo').innerHTML = logoMark(46);
  try { Object.assign(S.config, await api('/config', { quiet: true })); } catch {}
  if (S.token) {
    try {
      const me = await api('/me', { quiet: true });
      S.role = me.role;
      S.user = me.role === 'student' ? me.student : me.teacher;
    } catch { setSession('', ''); }
  }
  buildWidgets();
  await router();
  await sleep(Math.max(0, 1900 - (Date.now() - t0)));
  const sp = $('#splash');
  sp.classList.add('out');
  setTimeout(() => sp.remove(), 900);
  if (S.role === 'student' && S.token) welcomeStudent();
})();
