// server.js
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// إعداد التوكن والآيدي الخاصين بالبوت
const BOT_TOKEN = "8320518414:AAGdxd980hx5Snp7L5Q-ZQrXe89O98zF5Fc";
const CHAT_ID = "8202412204"; // هذا هو ID حسابك اللي تصلك عليه الطلبات

// دالة ترسل رسالة لتليجرام
async function sendTelegramMessage(text) {
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

// استقبال طلبات الشحن من الفورم
app.post("/order", async (req, res) => {
  const { name, userId, amount, note, appName } = req.body;
  const message = `
🟡 <b>طلب شحن جديد من متجر CR7</b>

📱 التطبيق: ${appName || "-"}
👤 الاسم: ${name || "-"}
🆔 ID المستخدم: ${userId || "-"}
💵 المبلغ: ${amount || "-"}
📝 ملاحظات: ${note || "-"}

📩 تم الإرسال من الموقع ✅
`;
  await sendTelegramMessage(message);
  return res.send("✅ تم إرسال الطلب بنجاح، سيتم التواصل معك قريباً!");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));
