// server.js - SOMA simple backend (JSON storage + Telegram notifications)
// يعتمد على Node.js
// تأكد من تثبيت الحزم: express body-parser bcrypt jsonwebtoken node-fetch fs-extra dotenv
// مثال: npm i express body-parser bcrypt jsonwebtoken node-fetch fs-extra dotenv

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch'); // إذا كان node 18+ يمكن استخدام fetch الأصلي
const fs = require('fs-extra');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// ---------- إعداد المتغيرات (احفظها في Render كـ Environment Variables) ----------
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const BOT_TOKEN = process.env.BOT_TOKEN || '';     // ضع توكن بوت BotFather في Render
const CHAT_ID = process.env.CHAT_ID || '';         // ضع chat id في Render
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass'; // ضعها في Render

// ---------- ملفات البيانات (JSON) ----------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeJsonSync(USERS_FILE, {});
if (!fs.existsSync(ORDERS_FILE)) fs.writeJsonSync(ORDERS_FILE, []);

// ---------- مساعدات ----------
async function readUsers(){ return fs.readJson(USERS_FILE); }
async function writeUsers(obj){ return fs.writeJson(USERS_FILE, obj, { spaces: 2 }); }
async function readOrders(){ return fs.readJson(ORDERS_FILE); }
async function writeOrders(arr){ return fs.writeJson(ORDERS_FILE, arr, { spaces: 2 }); }

function generateSerial(){
  return Math.floor(100000 + Math.random()*900000).toString(); // 6 أرقام
}

async function sendTelegram(text){
  if(!BOT_TOKEN || !CHAT_ID){
    console.log('Telegram not configured. Message:', text);
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
    });
    const j = await res.json();
    if(!j.ok) console.warn('Telegram send failed', j);
  } catch(err){
    console.error('Telegram error', err);
  }
}

// ---------- Middleware للتحقق من التوكن ----------
function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'لا يوجد توكن' });
  const parts = auth.split(' ');
  if(parts.length !== 2) return res.status(401).json({ error: 'هيئة توكن خاطئة' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch(e){
    return res.status(401).json({ error: 'توكن غير صالح' });
  }
}

// ---------- Routes ----------

// اختبار السيرفر
app.get('/', (req,res) => res.send('SOMA Backend OK'));

// تسجيل مستخدم جديد
app.post('/api/register', async (req,res) => {
  const { username, password, display_name } = req.body;
  if(!username || !password || !display_name) return res.status(400).json({ error: 'اكمل الحقول' });

  const users = await readUsers();
  if(users[username]) return res.status(400).json({ error: 'اسم المستخدم موجود' });

  const hash = await bcrypt.hash(password, 10);
  const serial = generateSerial();
  users[username] = {
    username,
    password: hash,
    display_name,
    serial,
    balance: 0,
    isAdmin: false,
    created_at: new Date().toISOString()
  };
  await writeUsers(users);

  // إشعار للإدارة
  const msg = `🆕 مستخدم جديد\nالاسم: ${display_name}\nالمعرف: ${username}\nSerial: #${serial}`;
  sendTelegram(msg);

  const token = jwt.sign({ username, display_name, serial, isAdmin:false }, JWT_SECRET, { expiresIn: '30d' });
  return res.json({ ok: true, token, user: { username, display_name, serial, balance: 0 } });
});

// تسجيل دخول
app.post('/api/login', async (req,res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'اكمل الحقول' });
  const users = await readUsers();
  const u = users[username];
  if(!u) return res.status(400).json({ error: 'المستخدم غير موجود' });
  const ok = await bcrypt.compare(password, u.password);
  if(!ok) return res.status(400).json({ error: 'بيانات خاطئة' });
  const token = jwt.sign({ username: u.username, display_name: u.display_name, serial: u.serial, isAdmin: !!u.isAdmin }, JWT_SECRET, { expiresIn: '30d' });
  return res.json({ ok:true, token, user: { username: u.username, display_name: u.display_name, serial: u.serial, balance: u.balance } });
});

// جلب بيانات المستخدم الحالي
app.get('/api/me', authMiddleware, async (req,res) => {
  const users = await readUsers();
  const u = users[req.user.username];
  if(!u) return res.status(404).json({ error: 'غير موجود' });
  return res.json({ ok:true, user: { username: u.username, display_name: u.display_name, serial: u.serial, balance: u.balance, isAdmin: !!u.isAdmin } });
});

// إنشاء طلب (checkout) — يخصم الرصيد مباشرة إن كان كافٍ
app.post('/api/order', authMiddleware, async (req,res) => {
  const { items, total } = req.body; // items: مصفوفة أو وصف، total: رقم
  if(!items || typeof total !== 'number') return res.status(400).json({ error: 'البيانات ناقصة' });

  const users = await readUsers();
  const u = users[req.user.username];
  if(!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if(u.balance < total) return res.status(400).json({ error: 'الرصيد غير كافٍ' });

  u.balance = Number((u.balance - total).toFixed(6));
  await writeUsers(users);

  const orders = await readOrders();
  const id = 'ORD' + Date.now();
  const order = { id, username: u.username, display_name: u.display_name, serial: u.serial, items, total, status: 'paid', created_at: new Date().toISOString() };
  orders.push(order);
  await writeOrders(orders);

  // إشعار للتليجرام
  const message = `🛒 طلب جديد\n#${id}\nالمستخدم: ${u.display_name} (${u.username})\nSerial: #${u.serial}\nالمبلغ: ${total}\nالوقت: ${new Date().toLocaleString()}`;
  sendTelegram(message);

  return res.json({ ok:true, order });
});

// طلب إضافة رصيد (topup) — يُسجل كطلب ومطلوب تأكيد من الادمن لتحديث الرصيد
app.post('/api/topup', authMiddleware, async (req,res) => {
  const { amount, method } = req.body;
  if(!amount || amount <= 0) return res.status(400).json({ error: 'مبلغ غير صالح' });

  const users = await readUsers();
  const u = users[req.user.username];
  if(!u) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const orders = await readOrders();
  const id = 'TOP' + Date.now();
  const order = { id, type: 'topup', username: u.username, display_name: u.display_name, serial: u.serial, amount, method: method || 'manual', status: 'pending', created_at: new Date().toISOString() };
  orders.push(order);
  await writeOrders(orders);

  // إشعار للتليجرام لادارة: طلب اضافة رصيد
  const message = `💳 طلب إضافة رصيد\n#${id}\nالمستخدم: ${u.display_name} (${u.username})\nSerial: #${u.serial}\nالمبلغ: ${amount}\nالطريقة: ${order.method}\nالوقت: ${new Date().toLocaleString()}`;
  sendTelegram(message);

  return res.json({ ok:true, id });
});

// ---------- نقاط إدارة (Admin) ----------

// حماية بسيطة: طلب جسم يتضمن admin_password أو استخدام متغير ENV ADMIN_PASSWORD
function checkAdminPass(req, res){
  const pass = req.headers['x-admin-pass'] || req.body.admin_password || '';
  if(pass !== ADMIN_PASSWORD) { res.status(403).json({ error: 'كلمة مرور الادمن خاطئة' }); return false; }
  return true;
}

// جلب كل المستخدمين (محمي)
app.get('/api/admin/users', async (req,res) => {
  // استخدم x-admin-pass header أو body.admin_password
  const ok = checkAdminPass(req, res);
  if(!ok) return;
  const users = await readUsers();
  return res.json({ ok:true, users });
});

// جلب كل الطلبات
app.get('/api/admin/orders', async (req,res) => {
  const ok = checkAdminPass(req, res);
  if(!ok) return;
  const orders = await readOrders();
  return res.json({ ok:true, orders });
});

// تأكيد طلب اضافة رصيد: يتم تعديل رصيد المستخدم وتحديث حالة الطلب
app.post('/api/admin/confirm-topup', async (req,res) => {
  const ok = checkAdminPass(req, res);
  if(!ok) return;
  const { order_id } = req.body;
  if(!order_id) return res.status(400).json({ error: 'حدد رقم الطلب' });

  const orders = await readOrders();
  const o = orders.find(x => x.id === order_id && x.type === 'topup');
  if(!o) return res.status(404).json({ error: 'الطلب غير موجود' });
  if(o.status === 'completed') return res.status(400).json({ error: 'الطلب مؤكد سابقاً' });

  // تعديل رصيد المستخدم
  const users = await readUsers();
  if(!users[o.username]) return res.status(404).json({ error: 'المستخدم غير موجود' });
  users[o.username].balance = Number((users[o.username].balance + Number(o.amount)).toFixed(6));
  await writeUsers(users);

  // تحديث حالة الطلب
  o.status = 'completed';
  await writeOrders(orders);

  // إشعار للتليجرام
  sendTelegram(`✅ تم تأكيد شحن رصيد\n#${o.id}\nالمستخدم: ${o.display_name} (${o.username})\nالمبلغ: ${o.amount}\nالرصيد الجديد: ${users[o.username].balance}`);

  return res.json({ ok:true });
});

// تعديل رصيد يدوي (اضافه/خصم)
app.post('/api/admin/adjust-balance', async (req,res) => {
  const ok = checkAdminPass(req, res);
  if(!ok) return;
  const { username, amount } = req.body;
  if(!username || typeof amount === 'undefined') return res.status(400).json({ error: 'البيانات ناقصة' });
  const users = await readUsers();
  if(!users[username]) return res.status(404).json({ error: 'المستخدم غير موجود' });
  users[username].balance = Number((users[username].balance + Number(amount)).toFixed(6));
  await writeUsers(users);
  sendTelegram(`🔧 تعديل رصيد يدوي\nالمستخدم: ${users[username].display_name} (${username})\nالتغيير: ${amount}\nالرصيد الجديد: ${users[username].balance}`);
  return res.json({ ok:true, new_balance: users[username].balance });
});

// ---------- تشغيل السيرفر ----------
app.listen(PORT, () => console.log(`SOMA server running on port ${PORT}`));
