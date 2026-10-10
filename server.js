'use strict';
/* ==========================================================
   منصة مستر إبراهيم التمام - السيرفر
   بدون أي مكتبات خارجية: يشتغل بـ  node server.js  بس
   ========================================================== */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/* ================= الإعدادات (عدّل من هنا) ================= */
const CONFIG = {
  port: Number(process.env.PORT) || 3000,
  teacherName: 'مستر إبراهيم التمام',
  // بيانات دخول المدرس - غيّرها فوراً قبل ما تنشر المنصة!
  teacherUser: process.env.TEACHER_USER || 'ibrahim',
  teacherPass: process.env.TEACHER_PASS || 'Ibrahim@2026',
  supportPhone: '01027793263',
  // لتفعيل المساعد الذكي الحقيقي: حط مفتاح Anthropic في المتغير ANTHROPIC_API_KEY
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-sonnet-5-5',
  maxUploadMB: 30, // أقصى حجم ملف للمدرس (الطالب 15 ميجا)
  stages: [
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
    'الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي'
  ]
};

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'gif']);
const MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', zip: 'application/zip', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/* ================= قاعدة البيانات (ملف JSON) ================= */
let db = { students: [], sheets: [], courses: [], submissions: [], grades: [], sessions: {} };
if (fs.existsSync(DB_FILE)) {
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); }
  catch (e) { console.error('تعذر قراءة قاعدة البيانات:', e.message); }
}
let saveTimer = null;
function flush() {
  clearTimeout(saveTimer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 120); }
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { try { flush(); } catch {} process.exit(0); }));

// تنظيف الجلسات القديمة
(function pruneSessions() {
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) {
    const ttl = s.role === 'teacher' ? 7 * 864e5 : 120 * 864e5;
    if (now - s.at > ttl) delete db.sessions[t];
  }
})();

/* ================= أدوات مساعدة ================= */
const uid = () => crypto.randomBytes(6).toString('hex');
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const byNew = (a, b) => b.createdAt - a.createdAt;
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

const hits = new Map();
function blocked(key, max, ms) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < ms);
  hits.set(key, arr);
  return arr.length >= max;
}
function record(key) { const arr = hits.get(key) || []; arr.push(Date.now()); hits.set(key, arr); }

function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function newCode() {
  let c;
  do { c = String(crypto.randomInt(100000, 999999)); } while (db.students.some(s => s.code === c));
  return c;
}
function newSession(role, id) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { role, id, at: Date.now() };
  save();
  return token;
}
function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = db.sessions[token];
  if (!s) return null;
  if (s.role === 'teacher') return { role: 'teacher', user: { name: CONFIG.teacherName }, token };
  const st = db.students.find(x => x.id === s.id);
  return st ? { role: 'student', user: st, token } : null;
}
function need(req, role) {
  const a = auth(req);
  if (!a) throw httpErr(401, 'سجّل دخولك الأول');
  if (role && a.role !== role) throw httpErr(403, 'مش مسموح لك بالصفحة دي');
  return a;
}
const pubStudent = s => ({ id: s.id, name: s.name, phone: s.phone, stage: s.stage, code: s.code, createdAt: s.createdAt });

function validFile(f) {
  if (!f || typeof f.url !== 'string' || !/^\/uploads\/[^/]+$/.test(f.url)) throw httpErr(400, 'الملف غير صالح، ارفعه تاني');
  let dec;
  try { dec = decodeURIComponent(f.url.slice(9)); } catch { throw httpErr(400, 'الملف غير صالح'); }
  if (path.basename(dec) !== dec || !fs.existsSync(path.join(UPLOAD_DIR, dec))) throw httpErr(400, 'الملف مش موجود، ارفعه تاني');
  return { name: clean(f.name, 100) || dec, url: f.url, size: Number(f.size) || 0 };
}
function unlinkUpload(file) {
  try {
    if (!file || !file.url) return;
    const dec = decodeURIComponent(file.url.slice(9));
    if (path.basename(dec) === dec) fs.unlinkSync(path.join(UPLOAD_DIR, dec));
  } catch {}
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { tooBig = true; chunks.length = 0; return; }
      if (!tooBig) chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(httpErr(413, 'حجم الملف أكبر من المسموح'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpErr(400, 'بيانات غير صالحة')); }
    });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': MIME.json, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ================= عرض البيانات ================= */
function sheetView(s, st) {
  const sub = db.submissions.find(x => x.sheetId === s.id && x.studentId === st.id);
  const g = db.grades.find(x => x.sheetId === s.id && x.studentId === st.id);
  return {
    id: s.id, title: s.title, description: s.description, stage: s.stage, file: s.file, createdAt: s.createdAt,
    isNew: !(st.seenSheets || []).includes(s.id),
    status: sub ? sub.status : 'none',
    takenAt: sub ? sub.takenAt : null,
    submittedAt: sub ? sub.submittedAt || null : null,
    grade: g ? { score: g.score, max: g.max } : null
  };
}
function courseView(c, st) {
  return {
    id: c.id, title: c.title, description: c.description, stage: c.stage, createdAt: c.createdAt,
    lessonsCount: (c.lessons || []).length,
    isNew: !(st.seenCourses || []).includes(c.id),
    enrolled: (st.enrolled || []).includes(c.id),
    lessons: (st.enrolled || []).includes(c.id) ? c.lessons || [] : []
  };
}
const percent = g => Math.round((g.score / g.max) * 100);

/* ================= المساعد الذكي ================= */
function localAnswer(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some(x => t.includes(x));
  const wa = CONFIG.supportPhone;
  if (has('كود', 'نسيت', 'نسيان')) return `الكود بيظهر ليك مرة واحدة بعد التسجيل، احتفظ بيه (سكرين شوت أو نسخ). ولو نسيته كلّم الدعم على واتساب ${wa} وهنرجعهولك.`;
  if (has('سجل', 'تسجيل', 'حساب', 'اشترك', 'ادخل', 'دخول')) return 'من صفحة الدخول اختار "طالب جديد" واكتب اسمك ورقمك ومرحلتك، وهيجيلك كود خاص بيك. بعد كده بتدخل بالكود بس.';
  if (has('شيت', 'شيتات', 'واجب', 'تسليم', 'سلم')) return 'الشيتات الجديدة بتظهر في أول الرئيسية، وكل الشيتات تحتها. اضغط "فتح الشيت" وبعد ما تحلّ اضغط "تسليم الحل" وارفع صورة أو ملف. وصفحة "شيتاتي" فيها اللي استلمته وسلّمته.';
  if (has('درجه', 'درجة', 'درجات', 'نتيجه', 'نتيجة')) return 'صفحة "درجاتي" فيها درجاتك إنت بس مع المتوسط العام. الدرجة بتظهر بعد ما مستر إبراهيم يصحّح.';
  if (has('كورس', 'كورسات', 'محاضر', 'فيديو', 'شرح')) return 'كل الكورسات بتلاقيها تحت في الرئيسية، اضغط "اشترك في الكورس" وهتلاقيه في صفحة "كورساتي" بدروسه. وأي كورس جديد بيظهر عليه علامة "جديد".';
  if (has('واتس', 'دعم', 'تواصل', 'رقم', 'مشكل', 'مشكلة')) return `تقدر تكلّمنا على واتساب على الرقم ${wa} من صفحة "تواصل" أو من زرار الدعم تحت.`;
  if (has('مرحبا', 'اهلا', 'أهلا', 'سلام', 'هاي')) return 'أهلاً بيك! أنا مساعد منصة مستر إبراهيم التمام. اسألني عن الشيتات أو الدرجات أو الكورسات أو إزاي تستخدم المنصة.';
  return `ممكن توضّح سؤالك أكتر؟ أقدر أساعدك في استخدام المنصة (التسجيل، الشيتات، الدرجات، الكورسات). ولو محتاج مساعدة تانية كلّم الدعم على واتساب ${wa}.`;
}

function callClaude(system, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: CONFIG.aiModel, max_tokens: 700, system, messages });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': CONFIG.anthropicKey,
        'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(body)
      }
    }, r => {
      let data = '';
      r.on('data', c => (data += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (r.statusCode >= 400) return reject(new Error(j.error && j.error.message || 'AI error'));
          resolve((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim());
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ================= المسارات (API) ================= */
const routes = [];
const R = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

R('GET', '/api/config', () => ({
  stages: CONFIG.stages, teacherName: CONFIG.teacherName, supportPhone: CONFIG.supportPhone, aiEnabled: !!CONFIG.anthropicKey
}));

/* ---- الدخول والتسجيل ---- */
R('POST', '/api/register', ({ body, ip }) => {
  if (blocked('reg:' + ip, 30, 3600e3)) throw httpErr(429, 'محاولات كتير، جرب تاني بعد شوية');
  record('reg:' + ip);
  const name = clean(body.name, 60);
  const phone = String(body.phone || '').replace(/\D/g, '');
  const stage = body.stage;
  if (name.length < 3) throw httpErr(400, 'اكتب اسمك بالكامل');
  if (phone.length < 10 || phone.length > 15) throw httpErr(400, 'رقم الموبايل غير صحيح');
  if (!CONFIG.stages.includes(stage)) throw httpErr(400, 'اختار مرحلتك الدراسية');
  if (db.students.some(s => s.phone === phone)) throw httpErr(409, 'الرقم ده مسجّل قبل كده، ادخل بالكود بتاعك. ولو نسيته كلّم الدعم.');
  const student = {
    id: uid(), name, phone, stage, code: newCode(), createdAt: Date.now(),
    // المحتوى الموجود وقت التسجيل مش بيتحسب "جديد"
    seenSheets: db.sheets.filter(s => s.stage === stage).map(s => s.id),
    seenCourses: db.courses.filter(c => c.stage === stage).map(c => c.id),
    enrolled: []
  };
  db.students.push(student);
  const token = newSession('student', student.id);
  save();
  return { token, role: 'student', student: pubStudent(student), firstTime: true };
});

R('POST', '/api/login', ({ body, ip }) => {
  if (blocked('login:' + ip, 15, 600e3)) throw httpErr(429, 'محاولات كتير غلط، استنى 10 دقايق وجرب تاني');
  const code = String(body.code || '').replace(/\D/g, '');
  const st = db.students.find(s => s.code === code);
  if (!st) { record('login:' + ip); throw httpErr(404, 'الكود غلط، راجعه وجرب تاني'); }
  return { token: newSession('student', st.id), role: 'student', student: pubStudent(st) };
});

R('POST', '/api/teacher/login', ({ body, ip }) => {
  if (blocked('tlogin:' + ip, 8, 600e3)) throw httpErr(429, 'محاولات كتير غلط، استنى 10 دقايق');
  if (!safeEq(body.username, CONFIG.teacherUser) || !safeEq(body.password, CONFIG.teacherPass)) {
    record('tlogin:' + ip);
    throw httpErr(401, 'اسم المستخدم أو كلمة السر غلط');
  }
  return { token: newSession('teacher', 'teacher'), role: 'teacher', teacher: { name: CONFIG.teacherName } };
});

R('GET', '/api/me', ({ req }) => {
  const a = need(req);
  return a.role === 'student' ? { role: 'student', student: pubStudent(a.user) } : { role: 'teacher', teacher: a.user };
});
R('POST', '/api/logout', ({ req }) => {
  const a = auth(req);
  if (a) { delete db.sessions[a.token]; save(); }
  return { ok: true };
});

/* ---- رفع الملفات ---- */
R('POST', '/api/upload', ({ req, body }) => {
  const a = need(req);
  const name = String(body.name || 'file');
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw httpErr(400, 'نوع الملف مش مدعوم (المسموح: PDF, Word, PowerPoint, Excel, صور, ZIP)');
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length) throw httpErr(400, 'الملف فاضي');
  const max = (a.role === 'teacher' ? CONFIG.maxUploadMB : 15) * 1024 * 1024;
  if (buf.length > max) throw httpErr(413, `حجم الملف أكبر من ${Math.round(max / 1048576)} ميجا`);
  const base = path.basename(name, '.' + ext).replace(/[^\w\u0600-\u06FF\- ]/g, '_').trim().slice(0, 60) || 'file';
  const fname = crypto.randomBytes(8).toString('hex') + '-' + base + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
  return { name: base + '.' + ext, url: '/uploads/' + encodeURIComponent(fname), size: buf.length };
});

/* ---- الشيتات ---- */
R('GET', '/api/sheets', ({ req, query }) => {
  const a = need(req);
  if (a.role === 'student') {
    return { sheets: db.sheets.filter(s => s.stage === a.user.stage).sort(byNew).map(s => sheetView(s, a.user)) };
  }
  const list = db.sheets.filter(s => !query.stage || s.stage === query.stage).sort(byNew).map(s => ({
    ...s,
    opened: db.submissions.filter(x => x.sheetId === s.id).length,
    submitted: db.submissions.filter(x => x.sheetId === s.id && x.status === 'submitted').length
  }));
  return { sheets: list };
});

R('POST', '/api/sheets', ({ req, body }) => {
  need(req, 'teacher');
  const title = clean(body.title, 120);
  if (title.length < 2) throw httpErr(400, 'اكتب عنوان الشيت');
  if (!CONFIG.stages.includes(body.stage)) throw httpErr(400, 'اختار المرحلة اللي هتضيف فيها الشيت');
  const sheet = {
    id: uid(), title, description: clean(body.description, 600), stage: body.stage,
    file: validFile(body.file), createdAt: Date.now()
  };
  db.sheets.push(sheet);
  save();
  return { sheet };
});

R('DELETE', '/api/sheets/:id', ({ req, params }) => {
  need(req, 'teacher');
  const i = db.sheets.findIndex(s => s.id === params.id);
  if (i < 0) throw httpErr(404, 'الشيت مش موجود');
  const [sheet] = db.sheets.splice(i, 1);
  unlinkUpload(sheet.file);
  db.submissions = db.submissions.filter(x => {
    if (x.sheetId === sheet.id) { unlinkUpload(x.file); return false; }
    return true;
  });
  save();
  return { ok: true };
});

R('POST', '/api/sheets/:id/open', ({ req, params }) => {
  const a = need(req, 'student');
  const s = db.sheets.find(x => x.id === params.id && x.stage === a.user.stage);
  if (!s) throw httpErr(404, 'الشيت مش موجود');
  a.user.seenSheets = a.user.seenSheets || [];
  if (!a.user.seenSheets.includes(s.id)) a.user.seenSheets.push(s.id);
  if (!db.submissions.some(x => x.sheetId === s.id && x.studentId === a.user.id)) {
    db.submissions.push({ id: uid(), sheetId: s.id, studentId: a.user.id, status: 'taken', takenAt: Date.now() });
  }
  save();
  return { ok: true };
});

R('POST', '/api/sheets/:id/submit', ({ req, params, body }) => {
  const a = need(req, 'student');
  const s = db.sheets.find(x => x.id === params.id && x.stage === a.user.stage);
  if (!s) throw httpErr(404, 'الشيت مش موجود');
  const file = validFile(body.file);
  a.user.seenSheets = a.user.seenSheets || [];
  if (!a.user.seenSheets.includes(s.id)) a.user.seenSheets.push(s.id);
  let sub = db.submissions.find(x => x.sheetId === s.id && x.studentId === a.user.id);
  if (!sub) { sub = { id: uid(), sheetId: s.id, studentId: a.user.id, takenAt: Date.now() }; db.submissions.push(sub); }
  if (sub.file && sub.file.url !== file.url) unlinkUpload(sub.file);
  sub.status = 'submitted';
  sub.file = file;
  sub.submittedAt = Date.now();
  save();
  return { ok: true };
});

/* ---- الكورسات ---- */
R('GET', '/api/courses', ({ req, query }) => {
  const a = need(req);
  if (a.role === 'student') {
    return { courses: db.courses.filter(c => c.stage === a.user.stage).sort(byNew).map(c => courseView(c, a.user)) };
  }
  return { courses: db.courses.filter(c => !query.stage || c.stage === query.stage).sort(byNew) };
});

R('POST', '/api/courses', ({ req, body }) => {
  need(req, 'teacher');
  const title = clean(body.title, 120);
  if (title.length < 2) throw httpErr(400, 'اكتب اسم الكورس');
  if (!CONFIG.stages.includes(body.stage)) throw httpErr(400, 'اختار المرحلة اللي هتضيف فيها الكورس');
  const lessons = (Array.isArray(body.lessons) ? body.lessons : []).slice(0, 150).map(l => {
    const url = clean(l.url, 500);
    if (url && !/^https?:\/\//i.test(url)) throw httpErr(400, 'رابط الدرس لازم يبدأ بـ http أو https');
    return { title: clean(l.title, 120), url };
  }).filter(l => l.title);
  const course = { id: uid(), title, description: clean(body.description, 600), stage: body.stage, lessons, createdAt: Date.now() };
  db.courses.push(course);
  save();
  return { course };
});

R('DELETE', '/api/courses/:id', ({ req, params }) => {
  need(req, 'teacher');
  const i = db.courses.findIndex(c => c.id === params.id);
  if (i < 0) throw httpErr(404, 'الكورس مش موجود');
  db.courses.splice(i, 1);
  db.students.forEach(s => { s.enrolled = (s.enrolled || []).filter(x => x !== params.id); });
  save();
  return { ok: true };
});

R('POST', '/api/courses/:id/seen', ({ req, params }) => {
  const a = need(req, 'student');
  a.user.seenCourses = a.user.seenCourses || [];
  if (!a.user.seenCourses.includes(params.id)) a.user.seenCourses.push(params.id);
  save();
  return { ok: true };
});

R('POST', '/api/courses/:id/enroll', ({ req, params }) => {
  const a = need(req, 'student');
  const c = db.courses.find(x => x.id === params.id && x.stage === a.user.stage);
  if (!c) throw httpErr(404, 'الكورس مش موجود');
  a.user.enrolled = a.user.enrolled || [];
  a.user.seenCourses = a.user.seenCourses || [];
  if (!a.user.enrolled.includes(c.id)) a.user.enrolled.push(c.id);
  if (!a.user.seenCourses.includes(c.id)) a.user.seenCourses.push(c.id);
  save();
  return { ok: true };
});

/* ---- ملخص الطالب (للإشعارات) ---- */
R('GET', '/api/summary', ({ req }) => {
  const a = need(req, 'student');
  const st = a.user;
  const newSheets = db.sheets.filter(s => s.stage === st.stage && !(st.seenSheets || []).includes(s.id));
  const newCourses = db.courses.filter(c => c.stage === st.stage && !(st.seenCourses || []).includes(c.id));
  return {
    newSheets: newSheets.length, newCourses: newCourses.length,
    newCourseTitles: newCourses.slice(0, 3).map(c => c.title)
  };
});

R('GET', '/api/my/sheets', ({ req }) => {
  const a = need(req, 'student');
  const out = [];
  for (const sub of db.submissions.filter(x => x.studentId === a.user.id)) {
    const s = db.sheets.find(x => x.id === sub.sheetId);
    if (s) out.push({ ...sheetView(s, a.user), mySubmissionFile: sub.file || null });
  }
  out.sort((x, y) => (y.submittedAt || y.takenAt || 0) - (x.submittedAt || x.takenAt || 0));
  return { sheets: out };
});

R('GET', '/api/my/grades', ({ req }) => {
  const a = need(req, 'student');
  const grades = db.grades.filter(g => g.studentId === a.user.id).sort((x, y) => y.updatedAt - x.updatedAt)
    .map(g => ({ ...g, percent: percent(g) }));
  const average = grades.length ? Math.round(grades.reduce((n, g) => n + g.percent, 0) / grades.length) : null;
  return { grades, average };
});

/* ---- أدوات المدرس ---- */
R('GET', '/api/teacher/stats', ({ req }) => {
  need(req, 'teacher');
  const stages = CONFIG.stages.map(stage => ({
    stage,
    students: db.students.filter(s => s.stage === stage).length,
    sheets: db.sheets.filter(s => s.stage === stage).length,
    courses: db.courses.filter(c => c.stage === stage).length,
    pending: db.submissions.filter(x => x.status === 'submitted' &&
      (db.sheets.find(s => s.id === x.sheetId) || {}).stage === stage &&
      !db.grades.some(g => g.sheetId === x.sheetId && g.studentId === x.studentId)).length
  }));
  return {
    stages,
    totals: {
      students: db.students.length, sheets: db.sheets.length, courses: db.courses.length,
      submissions: db.submissions.filter(x => x.status === 'submitted').length
    }
  };
});

R('GET', '/api/teacher/students', ({ req, query }) => {
  need(req, 'teacher');
  const list = db.students.filter(s => !query.stage || s.stage === query.stage)
    .sort(byNew).map(s => ({
      ...pubStudent(s),
      submitted: db.submissions.filter(x => x.studentId === s.id && x.status === 'submitted').length,
      enrolled: (s.enrolled || []).length
    }));
  return { students: list };
});

R('DELETE', '/api/teacher/students/:id', ({ req, params }) => {
  need(req, 'teacher');
  const i = db.students.findIndex(s => s.id === params.id);
  if (i < 0) throw httpErr(404, 'الطالب مش موجود');
  db.students.splice(i, 1);
  db.submissions = db.submissions.filter(x => { if (x.studentId === params.id) { unlinkUpload(x.file); return false; } return true; });
  db.grades = db.grades.filter(g => g.studentId !== params.id);
  for (const [t, s] of Object.entries(db.sessions)) if (s.id === params.id) delete db.sessions[t];
  save();
  return { ok: true };
});

R('GET', '/api/teacher/submissions', ({ req, query }) => {
  need(req, 'teacher');
  const out = [];
  for (const sub of db.submissions) {
    const sheet = db.sheets.find(s => s.id === sub.sheetId);
    const stu = db.students.find(s => s.id === sub.studentId);
    if (!sheet || !stu) continue;
    if (query.stage && sheet.stage !== query.stage) continue;
    const g = db.grades.find(x => x.sheetId === sheet.id && x.studentId === stu.id);
    out.push({
      id: sub.id, status: sub.status, takenAt: sub.takenAt, submittedAt: sub.submittedAt || null, file: sub.file || null,
      student: { id: stu.id, name: stu.name, stage: stu.stage }, sheet: { id: sheet.id, title: sheet.title, stage: sheet.stage },
      grade: g ? { id: g.id, score: g.score, max: g.max } : null
    });
  }
  out.sort((a, b) => (b.submittedAt || b.takenAt || 0) - (a.submittedAt || a.takenAt || 0));
  return { submissions: out };
});

function gradeFields(body) {
  const score = Number(body.score);
  const max = body.max === undefined || body.max === '' ? 100 : Number(body.max);
  if (!Number.isFinite(max) || max <= 0 || max > 1000) throw httpErr(400, 'الدرجة النهائية غير صحيحة');
  if (!Number.isFinite(score) || score < 0 || score > max) throw httpErr(400, 'الدرجة لازم تكون بين صفر والدرجة النهائية');
  return { score, max, note: clean(body.note, 300) };
}

R('GET', '/api/teacher/grades', ({ req, query }) => {
  need(req, 'teacher');
  const out = db.grades.map(g => {
    const s = db.students.find(x => x.id === g.studentId);
    return s ? { ...g, percent: percent(g), student: { id: s.id, name: s.name, stage: s.stage, phone: s.phone, code: s.code } } : null;
  }).filter(Boolean).filter(g => !query.stage || g.student.stage === query.stage)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { grades: out };
});

R('POST', '/api/teacher/grades', ({ req, body }) => {
  need(req, 'teacher');
  const stu = db.students.find(x => x.id === body.studentId);
  if (!stu) throw httpErr(400, 'اختار الطالب');
  const f = gradeFields(body);
  let sheet = null;
  if (body.sheetId) {
    sheet = db.sheets.find(s => s.id === body.sheetId);
    if (!sheet) throw httpErr(400, 'الشيت مش موجود');
  }
  const title = clean(body.title, 100) || (sheet && sheet.title) || '';
  if (!title) throw httpErr(400, 'اكتب عنوان الدرجة (اختبار / شيت ...)');
  let g = sheet && db.grades.find(x => x.sheetId === sheet.id && x.studentId === stu.id);
  if (g) Object.assign(g, f, { title, updatedAt: Date.now() });
  else {
    g = { id: uid(), studentId: stu.id, sheetId: sheet ? sheet.id : null, title, ...f, createdAt: Date.now(), updatedAt: Date.now() };
    db.grades.push(g);
  }
  save();
  return { grade: g };
});

R('PUT', '/api/teacher/grades/:id', ({ req, params, body }) => {
  need(req, 'teacher');
  const g = db.grades.find(x => x.id === params.id);
  if (!g) throw httpErr(404, 'الدرجة مش موجودة');
  const title = clean(body.title, 100) || g.title;
  Object.assign(g, gradeFields(body), { title, updatedAt: Date.now() });
  save();
  return { grade: g };
});

R('DELETE', '/api/teacher/grades/:id', ({ req, params }) => {
  need(req, 'teacher');
  const i = db.grades.findIndex(x => x.id === params.id);
  if (i < 0) throw httpErr(404, 'الدرجة مش موجودة');
  db.grades.splice(i, 1);
  save();
  return { ok: true };
});

/* ---- المساعد الذكي ---- */
R('POST', '/api/ai', async ({ req, body, ip }) => {
  if (blocked('ai:' + ip, 25, 60e3)) throw httpErr(429, 'استنى شوية وابعت تاني');
  record('ai:' + ip);
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-10)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content, 1500) }))
    .filter(m => m.content);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw httpErr(400, 'اكتب سؤالك');
  const last = msgs[msgs.length - 1].content;
  if (!CONFIG.anthropicKey) return { reply: localAnswer(last), mode: 'local' };
  const a = auth(req);
  const who = a && a.role === 'student' ? `الطالب اسمه ${a.user.name} وفي ${a.user.stage}.` : '';
  const system = [
    `أنت مساعد منصة ${CONFIG.teacherName} التعليمية (تاريخ ودراسات اجتماعية للمرحلتين الإعدادية والثانوية في مصر).`,
    'اتكلم بلهجة مصرية بسيطة ومحترمة وبإجابات قصيرة ومرتبة.',
    'ساعد الطالب في استخدام المنصة: التسجيل بيدّي كود خاص بيدخل بيه بعد كده، وفي الرئيسية الشيتات الجديدة وكل الشيتات والكورسات، وصفحة شيتاتي (اللي استلمها وسلّمها)، وصفحة درجاتي (درجاته هو بس)، وصفحة كورساتي، وصفحة تواصل.',
    'وساعد في فهم دروس التاريخ والدراسات الاجتماعية بشكل مبسّط ودقيق، ولو مش متأكد قول كده بدل ما تخترع معلومة.',
    'متخترعش درجات أو مواعيد أو بيانات عن المنصة مش عندك. ولو المشكلة محتاجة تدخل بشري قوله يكلّم الدعم على واتساب ' + CONFIG.supportPhone + '.',
    who
  ].filter(Boolean).join('\n');
  try {
    return { reply: (await callClaude(system, msgs)) || localAnswer(last), mode: 'ai' };
  } catch (e) {
    console.error('AI error:', e.message);
    return { reply: localAnswer(last), mode: 'local' };
  }
});

/* ================= الملفات الثابتة ================= */
function serveStatic(req, res, pathname) {
  let base = PUBLIC, rel = pathname;
  const isUpload = pathname.startsWith('/uploads/');
  if (isUpload) { base = UPLOAD_DIR; rel = pathname.slice(9); }
  else if (pathname === '/') rel = '/index.html';
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!isUpload && !path.extname(pathname)) return serveStatic(req, res, '/'); // fallback
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('غير موجود');
    }
    const ext = path.extname(file).slice(1).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' };
    if (isUpload) {
      const orig = path.basename(file).replace(/^[0-9a-f]{16}-/, '');
      const inline = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      headers['Content-Disposition'] = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(orig)}`;
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

/* ================= السيرفر ================= */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(req, res, pathname);
    }
    const route = routes.find(r => r.method === req.method && r.re.test(pathname));
    if (!route) throw httpErr(404, 'المسار غير موجود');
    const params = (pathname.match(route.re) || {}).groups || {};
    const ip = req.socket.remoteAddress || 'x';
    let body = {};
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      if (pathname === '/api/upload') need(req); // لازم يكون مسجل قبل قراءة الملف
      body = await readJson(req, pathname === '/api/upload' ? 45 * 1024 * 1024 : 1024 * 1024);
    }
    const out = await route.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, ip });
    sendJson(res, 200, out === undefined ? { ok: true } : out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'حصل خطأ في السيرفر' : e.message });
  }
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('\n  منصة ' + CONFIG.teacherName + ' شغالة ✔\n');
  console.log('  على الكمبيوتر:   http://localhost:' + CONFIG.port);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log('  على الموبايل:    http://' + i.address + ':' + CONFIG.port + '   (نفس شبكة الواي فاي)');
    }
  }
  console.log('\n  حساب المدرس:  ' + CONFIG.teacherUser + '  /  ' + CONFIG.teacherPass + '\n');
});
