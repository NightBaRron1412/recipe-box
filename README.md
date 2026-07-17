# 🍽️ كتاب الوصفات (Recipe Box)

معرض شخصي لحفظ وصفات الطبخ التي تشاهدها على انستغرام وفيسبوك وتيك توك.
أرسل الرابط إلى بوت تيليجرام، ويقوم الموقع تلقائيًا بجلب الصورة والوصف،
واستخراج المكونات والخطوات بالعربية عبر Gemini، ثم عرضها في معرض أنيق.

## المعمارية

```
الهاتف: مشاركة الريلز ← بوت تيليجرام
                │  (webhook)
                ▼
   Vercel  ──►  دالة /api/telegram
                 1. جلب الصورة + الوصف (OpenGraph)
                 2. Gemini يحوّل الوصف إلى مكونات + خطوات بالعربية
                 3. حفظ الصورة في Supabase Storage
                 4. إدراج صف في جدول recipes
                 5. رد على المستخدم في تيليجرام
                ▼
   Vercel  ──►  الصفحة الرئيسية = معرض الوصفات (قراءة من Supabase)
```

لا يعتمد على أي جهاز محلي — كل شيء يعمل على Vercel + Supabase (الطبقة المجانية).

## متغيرات البيئة

انظر `.env.example`. الأساسية:

| المتغير | الوصف |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توكن البوت من BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | سر عشوائي للتحقق من الـ webhook |
| `ALLOWED_TELEGRAM_USER_ID` | معرفك الرقمي لتقييد البوت عليك |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | للكتابة من الـ webhook (سري) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | لقراءة المعرض |
| `GEMINI_API_KEY` | لاستخراج الوصفة |
| `APP_BASE_URL` | رابط الموقع (يستخدم في رسائل تيليجرام) |

## التشغيل محليًا

```bash
npm install
npm run dev
```

## النشر

```bash
vercel                 # ربط المشروع
vercel env add ...     # إضافة المتغيرات، أو من لوحة Vercel
vercel --prod          # نشر
```

بعد النشر، اضبط الـ webhook لتيليجرام:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<APP>.vercel.app/api/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
