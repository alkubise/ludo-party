# Ludo Party — تشغيل من الهاتف (Android)

اللعبة Web وليست تطبيق APK. يمكن فتحها على الهاتف من Chrome.

## خيار 1: استضافة اللعبة من هاتف Android على شبكة Wi-Fi
1. ثبت Termux من F-Droid (لا تستخدم نسخة Play Store القديمة).
2. افتح Termux ونفذ:
   ```sh
   pkg update -y && pkg install nodejs -y
   ```
3. انقل مجلد `ludo-party` إلى الهاتف (مثلاً Download/ludo-party). في Termux:
   ```sh
   termux-setup-storage
   cd ~/storage/downloads/ludo-party
   npm install
   npm start
   ```
4. ابحث عن عنوان IP للهاتف المضيف من إعدادات Wi-Fi (تفاصيل الشبكة).
5. اللاعب المضيف يفتح `http://localhost:3000`، والصديق على نفس Wi-Fi يفتح `http://IP:3000`.

## خيار 2: رابط عام
ارفع المشروع إلى استضافة Node.js تدعم WebSocket/Socket.IO ثم أرسل رابطها، حتى يلعب الأصدقاء من شبكات مختلفة.

**ملاحظة:** هذا الإصدار الأولي؛ يحتاج اختبار لعب فعلي ومراجعة منطق قواعد اللودو قبل اعتباره إصداراً نهائياً.
