# نشر Ludo Party مجانا باستخدام GitHub + Render

> GitHub يحفظ المشروع، لكنه لا يشغّل Socket.IO/WebSocket على GitHub Pages. لذلك سنرفع الملفات إلى GitHub ثم نستضيف سيرفر اللعبة على Render Free.

## 1) رفع المشروع إلى GitHub (من الهاتف)
1. افتح https://github.com وسجل الدخول.
2. اضغط + ثم New repository.
3. اكتب اسم المستودع: `ludo-party` واختر Public، ثم Create repository.
4. من صفحة المستودع اضغط `Add file` ثم `Upload files`.
5. فك ضغط ZIP على الهاتف، وارفع محتويات مجلد `ludo-party` (تأكد أن `package.json` و`server.js` في جذر المستودع، وليس داخل مجلد إضافي).
6. اضغط `Commit changes`.

## 2) نشره على Render مجانا
1. افتح https://render.com وسجل الدخول، ويفضل باستخدام GitHub.
2. وافق على ربط Render بـ GitHub.
3. اختر `New` ثم `Blueprint` (أو Web Service إذا لم يظهر Blueprint).
4. اختر مستودع `ludo-party`.
5. إذا استخدمت Blueprint، سيقرأ Render ملف `render.yaml` ويعرض الخدمة. اضغط Apply/Deploy.
6. إذا اخترت Web Service يدويًا: Build Command = `npm install` وStart Command = `npm start`، واختر Free.
7. انتظر اكتمال النشر ثم افتح الرابط الذي ينتهي بـ `onrender.com`.

## 3) اللعب
- افتح رابط Render على هاتفك.
- أنشئ غرفة/اختر رمز غرفة وشارك الرابط ورمز الغرفة مع صديقك.
- يفتح صديقك الرابط من هاتفه ويدخل الغرفة نفسها.

## تنبيهات
- الخدمة المجانية قد تتوقف بعد فترة خمول وتحتاج نحو دقيقة لتعود.
- لا تستخدم GitHub Pages لتشغيل هذا المشروع الحالي؛ فهو يتطلب سيرفر Node وSocket.IO.
- هذه نسخة أولية، اختبرها مع صديق قبل اعتمادها. قواعد اللعبة قد تحتاج تحسينًا وتطويرًا.
