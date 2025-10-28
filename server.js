// server.js
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// اقرأ التوكن والآيدي من متغيرات البيئة
const BOT_TOKEN = process.env.BOT_TOKEN || "8320518414:AAGdxd980hx5Snp7L5Q-ZQrXe89O98zF5Fc";
const CHAT_ID = process.env.CHAT_ID || "8320518414";

// دالة ترسل رسالة لتليجرام
async function sendTelegramMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("BOT_TOKEN or CHAT_ID missing");
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    });
  } catch (err) {
    console.error("Telegram send error:", err.response ? err.response.data : err.message);
  }
}

// صفحة فورم بسيطة لتجربة الطلب
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// استقبال طلب الشحن من الفورم
app.post("/order", async (req, res) => {
  const { name, userId, amount, note, appName } = req.body;
  const message = `
✨ طلب جديد من المتجر:
- التطبيق: ${appName || "غير محدد"}
- الاسم: ${name || "-"}
- ID المستخدم: ${userId || "-"}
- المبلغ: ${amount || "-"}
- ملاحظة: ${note || "-"}

`;
  await sendTelegramMessage(message);
  return res.send("تم إرسال الطلب، شكراً!");
});

// شغّل السيرفر على البورت الذي يحدده Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
