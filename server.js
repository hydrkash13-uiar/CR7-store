// SOMA Store Server
// يعمل على Node.js

const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const TelegramBot = require("node-telegram-bot-api");

// تحميل المتغيرات السرّية (من GitHub Secrets)
dotenv.config();

// إعداد التوكن من GitHub Secret
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

const app = express();
app.use(bodyParser.json());
app.use(express.static("public")); // ملفات HTML / CSS

// قاعدة بيانات بسيطة (مؤقتة في الذاكرة)
let users = {};
let orders = [];

// دالة لتوليد رقم تسلسلي عشوائي
function generateSerial() {
  return Math.floor(100000 + Math.random() * 900000);
}

// 🔹 تسجيل مستخدم جديد
app.post("/register", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "اسم المستخدم مطلوب" });

  const serial = generateSerial();
  users[username] = { balance: 0, serial };
  res.json({ message: "تم إنشاء الحساب بنجاح", serial });
});

// 🔹 عرض الرصيد
app.get("/balance/:username", (req, res) => {
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

  res.json({ username: req.params.username, balance: user.balance });
});

// 🔹 إضافة رصيد (من لوحة التحكم فقط)
app.post("/add-balance", (req, res) => {
  const { username, amount } = req.body;
  if (!users[username]) return res.status(404).json({ error: "المستخدم غير موجود" });

  users[username].balance += Number(amount);
  res.json({ message: "تمت إضافة الرصيد بنجاح", new_balance: users[username].balance });
});

// 🔹 إرسال الطلب
app.post("/order", (req, res) => {
  const { username, item, price } = req.body;
  if (!users[username]) return res.status(404).json({ error: "المستخدم غير موجود" });

  if (users[username].balance < price)
    return res.status(400).json({ error: "الرصيد غير كافٍ" });

  users[username].balance -= price;
  const order = { username, item, price, time: new Date().toISOString() };
  orders.push(order);

  // إرسال الطلب إلى التلجرام
  const chatId = process.env.ADMIN_CHAT_ID; // ضع هنا رقمك من userinfobot
  const message = `
📦 طلب جديد في متجر SOMA

👤 المستخدم: ${username}
🔢 الرقم التسلسلي: ${users[username].serial}
🛒 الطلب: ${item}
💰 السعر: ${price}$
🕒 الوقت: ${order.time}
  `;
  bot.sendMessage(chatId, message);

  res.json({ message: "تم إرسال الطلب بنجاح ✅", order });
});

// 🔹 عرض كل المستخدمين (للمتحكم فقط)
app.get("/admin/users", (req, res) => {
  res.json(users);
});

// 🔹 عرض الطلبات (للمتحكم فقط)
app.get("/admin/orders", (req, res) => {
  res.json(orders);
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SOMA Store Server running on port ${PORT}`);
});
