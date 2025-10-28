// server.js
const express = require("express");
const axios = require("axios");
const path = require("path");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // لملفات HTML

// 🔐 التوكن والآيدي ثابتين هنا:
const BOT_TOKEN = "8320518414:AAGdxd980hx5Snp7L5Q-ZQrXe89O98zF5Fc";
const CHAT_ID = "8202412204";

// 📨 دالة إرسال الرسائل إلى التليجرام
async function sendTelegramMessage(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    });
  } catch (err) {
    console.error("❌ خطأ في إرسال الرسالة:", err.response ? err.response.data : err.message);
  }
}

// 🏠 الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 📦 استقبال الطلبات من النموذج
app.post("/order", async (req, res) => {
  const { name, userId, amount, note, appName } = req.body;
  const message = `
🚀 <b>طلب جديد من متجر CR7</b>
━━━━━━━━━━━━━━━
💬 التطبيق: ${appName || "غير محدد"}
👤 الاسم: ${name || "-"}
🆔 ID المستخدم: ${userId || "-"}
💰 المبلغ: ${amount || "-"}
📝 ملاحظة: ${note || "-"}
━━━━━━━━━━━━━━━
📅 تم الإرسال من موقع المتجر الرسمي.
`;

  await sendTelegramMessage(message);
  res.send(`<h2 style="text-align:center; font-family:Arial;">✅ تم إرسال الطلب بنجاح! سيتم التواصل معك قريباً.</h2>`);
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server running on port " + PORT));
