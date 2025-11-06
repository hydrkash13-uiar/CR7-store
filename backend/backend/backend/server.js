// backend/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Load env
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

/* ========== DB ========== */
const db = new sqlite3.Database('./soma.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    display_name TEXT,
    serial TEXT,
    balance REAL DEFAULT 0,
    is_admin INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    items TEXT,
    total REAL,
    status TEXT,
    created_at TEXT
  )`);

  // create admin user if not exists
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || '1234';
  db.get(`SELECT id FROM users WHERE username = ?`, [adminUser], (err,row)=>{
    if(!row){
      bcrypt.hash(adminPass,10,(e,hash)=>{
        const id = nanoid(8);
        const serial = Math.floor(1000 + Math.random()*9000).toString();
        db.run(`INSERT INTO users (id,username,password,display_name,serial,balance,is_admin)
          VALUES (?,?,?,?,?,?,1)`, [id, adminUser, hash, 'مدير SOMA', serial, 1000]);
        console.log('Admin user created:', adminUser);
      });
    }
  });
});

/* ========== Helpers ========== */
function sendTelegram(text){
  if(!TELEGRAM_BOT || !TELEGRAM_CHAT) {
    console.log('Telegram not configured. Message:', text);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`;
  return fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text, parse_mode:'HTML' })
  }).then(r=>r.json()).then(res=>{
    if(!res.ok) console.warn('Telegram send failed', res);
    return res;
  }).catch(err=>console.error('TG Err', err));
}

function generateSerial(){
  return Math.floor(1000 + Math.random()*9000).toString();
}

function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'no token'});
  const token = auth.split(' ')[1];
  try{
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  }catch(e){
    return res.status(401).json({error:'invalid token'});
  }
}

/* ========== Routes ========== */

// register
app.post('/api/register', async (req,res)=>{
  const { username, password, display_name } = req.body;
  if(!username || !password || !display_name) return res.status(400).json({error:'missing'});
  db.get(`SELECT username FROM users WHERE username = ?`, [username], async (err,row)=>{
    if(row) return res.status(400).json({error:'exists'});
    const hash = await bcrypt.hash(password, 10);
    const id = nanoid(10);
    const serial = generateSerial();
    db.run(`INSERT INTO users (id,username,password,display_name,serial,balance) VALUES (?,?,?,?,?,?)`,
      [id, username, hash, display_name, serial, 0], function(err2){
        if(err2) return res.status(500).json({error:'db'});
        const token = jwt.sign({id,username,display_name,serial}, JWT_SECRET, {expiresIn:'30d'});
        sendTelegram(`🆕 مستخدم جديد\nالاسم: ${display_name}\nالمعرف: ${username}\nSerial: #${serial}`);
        return res.json({ok:true, token, user:{id,username,display_name,serial,balance:0}});
    });
  });
});

// login
app.post('/api/login', (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'missing'});
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err,user)=>{
    if(!user) return res.status(400).json({error:'no_user'});
    const ok = await bcrypt.compare(password, user.password);
    if(!ok) return res.status(400).json({error:'bad_pass'});
    const token = jwt.sign({id:user.id,username:user.username,display_name:user.display_name,serial:user.serial,is_admin: user.is_admin}, JWT_SECRET, {expiresIn:'30d'});
    res.json({ok:true, token, user:{id:user.id,username:user.username,display_name:user.display_name,serial:user.serial,balance:user.balance}});
  });
});

// get current user
app.get('/api/me', authMiddleware, (req,res)=>{
  db.get(`SELECT id,username,display_name,serial,balance,is_admin FROM users WHERE id = ?`, [req.user.id], (err,user)=>{
    if(!user) return res.status(404).json({error:'no_user'});
    res.json({ok:true, user});
  });
});

// create order (checkout)
app.post('/api/order', authMiddleware, (req,res)=>{
  const { items, total } = req.body;
  if(!items || !total) return res.status(400).json({error:'missing'});
  const id = 'ORD' + Date.now();
  const created_at = new Date().toISOString();
  db.run(`INSERT INTO orders (id,user_id,items,total,status,created_at) VALUES (?,?,?,?,?,?)`,
    [id, req.user.id, JSON.stringify(items), total, 'pending', created_at], function(err){
      if(err) return res.status(500).json({error:'db'});
      // notify telegram
      const msg = `🛒 طلب جديد\n#${id}\nالمستخدم: ${req.user.display_name} (${req.user.username})\nSerial: #${req.user.serial}\nالمبلغ: ${total}\nالوقت: ${new Date(created_at).toLocaleString()}`;
      sendTelegram(msg);
      res.json({ok:true, order:{id, items, total, status:'pending', created_at}});
  });
});

// top-up request (user asks to add balance)
app.post('/api/topup', authMiddleware, (req,res)=>{
  const { amount, method } = req.body;
  if(!amount) return res.status(400).json({error:'missing'});
  const id = 'TOPUP'+Date.now();
  const created_at = new Date().toISOString();
  db.run(`INSERT INTO orders (id,user_id,items,total,status,created_at) VALUES (?,?,?,?,?,?)`,
    [id, req.user.id, JSON.stringify([{name:'topup',method,amount}]), amount, 'topup_pending', created_at], function(err){
      if(err) return res.status(500).json({error:'db'});
      const msg = `💳 طلب اضافة رصيد\n#${id}\nالمستخدم: ${req.user.display_name} (${req.user.username})\nSerial: #${req.user.serial}\nالمبلغ: ${amount}\nالطريقة: ${method}`;
      sendTelegram(msg);
      res.json({ok:true, id});
  });
});

/* ========== Admin endpoints (protected by token + is_admin) ========== */
app.get('/api/admin/orders', authMiddleware, (req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({error:'forbidden'});
  db.all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`, [], (err,rows)=>{
    res.json({ok:true, orders:rows});
  });
});

app.get('/api/admin/users', authMiddleware, (req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({error:'forbidden'});
  db.all(`SELECT id,username,display_name,serial,balance,is_admin FROM users ORDER BY rowid DESC`, [], (err,rows)=>{
    res.json({ok:true, users:rows});
  });
});

// adjust balance
app.post('/api/admin/adjust-balance', authMiddleware, (req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({error:'forbidden'});
  const { user_id, amount } = req.body;
  if(!user_id || typeof amount !== 'number') return res.status(400).json({error:'missing'});
  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, user_id], function(err){
    if(err) return res.status(500).json({error:'db'});
    // fetch user
    db.get(`SELECT username,display_name,serial,balance FROM users WHERE id = ?`, [user_id], (e,u)=>{
      if(u) sendTelegram(`🔧 تعديل رصيد\nالمستخدم: ${u.display_name} (${u.username})\nSerial: #${u.serial}\nالمبلغ الجديد: ${u.balance}`);
    });
    res.json({ok:true});
  });
});

app.post('/api/admin/mark-order', authMiddleware, (req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({error:'forbidden'});
  const { order_id, status } = req.body;
  if(!order_id || !status) return res.status(400).json({error:'missing'});
  db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, order_id], function(err){
    if(err) return res.status(500).json({error:'db'});
    db.get(`SELECT * FROM orders WHERE id = ?`, [order_id], (e,o)=>{
      if(o) sendTelegram(`📌 تحديث طلب\n#${o.id}\nحالة جديدة: ${status}`);
    });
    res.json({ok:true});
  });
});

/* ========== start ========== */
app.listen(PORT, ()=> {
  console.log(`Server running on port ${PORT}`);
});
