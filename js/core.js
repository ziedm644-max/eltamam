'use strict';
/* ==========================================================
   core.js - الأدوات المشتركة (API / أيقونات / مودال / رفع ملفات)
   ========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = {
  token: localStorage.getItem('it_token') || '',
  role: localStorage.getItem('it_role') || '',
  user: null,
  config: { stages: [], supportPhone: '01027793263', teacherName: 'مستر إبراهيم التمام', aiEnabled: false },
  summary: { newSheets: 0, newCourses: 0 }
};

function setSession(token, role) {
  S.token = token; S.role = role;
  if (token) { localStorage.setItem('it_token', token); localStorage.setItem('it_role', role); }
  else { localStorage.removeItem('it_token'); localStorage.removeItem('it_role'); S.user = null; }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    keepalive: !!opts.keepalive
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && S.token && !opts.quiet) { setSession('', ''); location.hash = '#/login'; }
    throw new Error(data.error || 'حصل خطأ، جرب تاني');
  }
  return data;
}

/* ---------- أيقونات ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  sheet: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  grade: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  course: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1.2-4.3A8 8 0 1 1 21 12z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.5 2.3 3.5 5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  whatsapp: '<path d="M20 4A10 10 0 0 0 4.2 16L3 21l5.1-1.3A10 10 0 1 0 20 4z"/><path d="M9 8c0 4 3 7 7 7l1.2-1.6-2.3-1.2-1 .8a5 5 0 0 1-2.3-2.3l.8-1L11 7.5z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  logo: '<path d="M3 9l9-5 9 5"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18"/>'
};
const ico = (n, size = 20) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const logoMark = (s = 28) => `<div class="logo-mark">${ico('logo', s)}</div>`;

/* ---------- تنسيقات ---------- */
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const pct = (s, m) => Math.round((s / m) * 100);
const barClass = p => (p >= 85 ? 'ok' : p >= 50 ? '' : p >= 35 ? 'warn' : 'err');
const num = n => Number(n).toLocaleString('ar-EG');

function waLink(phone, text) {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '20' + d.slice(1);
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('تم النسخ', 'ok'); }
  catch {
    const i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select();
    try { document.execCommand('copy'); toast('تم النسخ', 'ok'); } catch { toast('انسخه يدوي: ' + t); }
    i.remove();
  }
}

/* ---------- توست ---------- */
function toast(msg, type = 'info', ms = 3800) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, ms);
}

/* ---------- مودال ---------- */
function openModal({ title, html, onMount, size = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal glass ${size}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="إغلاق">${ico('close', 18)}</button></div>
    <div class="modal-body">${html}</div></div>`;
  $('#modal-root').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 350); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  if (onMount) onMount($('.modal-body', wrap), close);
  return { close, el: wrap };
}

function confirmBox(text, okLabel = 'تأكيد') {
  return new Promise(resolve => {
    const m = openModal({
      title: 'تأكيد',
      html: `<p class="muted" style="margin-bottom:18px">${esc(text)}</p>
        <div class="row end"><button class="glass-btn" data-no>إلغاء</button><button class="glass-btn danger" data-yes>${esc(okLabel)}</button></div>`,
      onMount: (b, close) => {
        $('[data-yes]', b).onclick = () => { close(); resolve(true); };
        $('[data-no]', b).onclick = () => { close(); resolve(false); };
      }
    });
    m.el.addEventListener('mousedown', e => { if (e.target === m.el) resolve(false); });
    m.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) resolve(false); });
  });
}

/* ---------- رفع الملفات (مع شريط تقدم) ---------- */
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('تعذر قراءة الملف'));
    fr.onload = () => {
      const b64 = String(fr.result).split(',')[1] || '';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (S.token) xhr.setRequestHeader('Authorization', 'Bearer ' + S.token);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let d = {};
        try { d = JSON.parse(xhr.responseText); } catch {}
        xhr.status >= 200 && xhr.status < 300 ? resolve(d) : reject(new Error(d.error || 'فشل رفع الملف'));
      };
      xhr.onerror = () => reject(new Error('مشكلة في الاتصال بالإنترنت'));
      xhr.send(JSON.stringify({ name: file.name, data: b64 }));
    };
    fr.readAsDataURL(file);
  });
}

const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png,.webp,.gif';
const fileField = (label = 'اضغط لاختيار الملف') =>
  `<label class="drop">${ico('upload', 26)}<span data-label>${esc(label)}</span><small>PDF / Word / PowerPoint / صور</small>
   <input type="file" name="file" accept="${FILE_ACCEPT}" required></label>
   <div class="progress hidden"><i></i></div>`;

document.addEventListener('change', e => {
  if (e.target.matches('.drop input[type=file]')) {
    const f = e.target.files[0];
    const lab = $('[data-label]', e.target.closest('.drop'));
    if (f && lab) lab.innerHTML = `<b>${esc(f.name)}</b> (${fmtSize(f.size)})`;
  }
});

/* اختيار المرحلة بأزرار */
function stageChoices(selected = '', name = 'stage') {
  return `<div class="choices">${S.config.stages.map(s =>
    `<label class="choice"><input type="radio" name="${name}" value="${esc(s)}" ${s === selected ? 'checked' : ''} required><span>${esc(s)}</span></label>`).join('')}</div>`;
}

/* ---------- تأثير الليكويد تحت الإصبع / الماوس ---------- */
document.addEventListener('pointermove', e => {
  const b = e.target.closest && e.target.closest('.glass-btn');
  if (!b) return;
  const r = b.getBoundingClientRect();
  b.style.setProperty('--mx', e.clientX - r.left + 'px');
  b.style.setProperty('--my', e.clientY - r.top + 'px');
});

/* ---------- تحميل CSV (بيفتح عربي صح في إكسيل) ---------- */
function downloadCSV(filename, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const emptyBox = (text, icon = 'sheet') => `<div class="empty">${ico(icon, 34)}<p>${esc(text)}</p></div>`;
