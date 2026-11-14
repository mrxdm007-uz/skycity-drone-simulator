# SKYCITY PRO — Email va parol orqali haqiqiy login

## Nima ishlatiladi?
O‘yin Supabase Auth orqali haqiqiy email/parol akkauntlaridan foydalanadi. Foydalanuvchi paroli Supabase Auth tomonidan xavfsiz tarzda boshqariladi; ilova parolni o‘z bazasida ochiq saqlamaydi.

## Supabase sozlamalari
1. Supabase Dashboard → Authentication → Providers bo‘limini oching.
2. Email provayderi yoqilganini tekshiring.
3. Authentication → URL Configuration bo‘limida Site URL qiymatiga Render saytingiz manzilini kiriting.
4. Email tasdiqlash yoqilgan bo‘lsa, yangi foydalanuvchi emailiga kelgan havolani bosishi kerak. Tasdiqlashni o‘chirib qo‘yishdan oldin akkaunt xavfsizligi va loyiha talablarini hisobga oling.
5. SQL Editor’da `supabase/migrations/001_skycity_pro.sql` faylini bir marta ishga tushiring.

## Akkaunt yaratish
- Ro‘yxatdan o‘tish bo‘limida email, noyob username va kamida 8 belgili parol kiriting.
- Agar email tasdiqlash yoqilgan bo‘lsa, xatdagi havolani tasdiqlang.
- So‘ng email va parol bilan kiring.

## Seans
Brauzer seansi Supabase client’da `persistSession: true` va `autoRefreshToken: true` bilan saqlanadi. Sahifani yangilaganda amaldagi seans tiklanadi. Chiqish tugmasi bosilsa seans tugaydi.

## Muhim kalitlar
- Frontend’da faqat Supabase Project URL va publishable key bo‘lishi mumkin.
- `SUPABASE_SERVICE_ROLE_KEY` faqat Render server Environment Variables ichida saqlansin.
- Service role key'ni frontend, ZIP ommaviy repozitoriyasi yoki chatga joylamang.

## Admin
O‘zingiz ro‘yxatdan o‘tgandan keyin Supabase SQL Editor’da faqat o‘z username'ingiz uchun quyidagini bajaring:
```sql
update public.profiles set role = 'admin' where username = 'SIZNING_USERNAME';
```
