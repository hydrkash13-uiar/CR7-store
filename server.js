const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// بيانات التليجرام
const BOT_TOKEN = "8355867373:AAHe4EfRfGt2cErNzuCdl_BgN8IVJlUbw_M";
const CHAT_ID = "8202412204";

// استقبال الطلب من نموذج المتجر
app.post("/order", async (req, res) => {
  try {
    const { name, number, product, price, paymentMethod } = req.body;

    // نص الرسالة
    const message = `
📦 *طلب جديد من المتجر*  
👤 الاسم: ${name}
📱 الرقم: ${number}
🛒 المنتج: ${product}
💰 السعر: ${price}
💳 طريقة الدفع: ${paymentMethod}
    `;

    // إرسال الرسالة إلى التليجرام
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });

    res.status(200).send({ success: true, message: "تم إرسال الطلب بنجاح" });
  } catch (error) {
    console.error("خطأ أثناء إرسال الطلب:", error);
    res.status(500).send({ success: false, message: "حدث خطأ" });
  }
});

// لتجربة السيرفر
app.get("/", (req, res) => {
  res.send("🚀 المتجر متصل بالتليجرام بنجاح!");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
