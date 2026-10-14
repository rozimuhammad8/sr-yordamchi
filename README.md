# SR yordamchi

sr.ihma.uz (Ijtimoiy reyestr) da ochilgan arizaga **xonadon manzilini (mahallasini) o'zgartirish** murojaatini dalolatnoma PDF'i bilan kiritish uchun lokal dastur.

- **Django ilova** (`http://127.0.0.1:5300`) — forma, sr.ihma.uz API'lariga so'rovlar, yuborilganlar tarixi.
- **Chrome kengaytmasi** (`extension/`) — sr.ihma.uz dan Auth token, Cloudflare token va ochiq ariza ID sini olib, sahifadagi maydonlarga qo'yadi.

PDF o'qilmaydi (OCR yo'q), faqat yuklanadi. Hujjatdagi ma'lumotlar qo'lda kiritiladi, har bir qadam foydalanuvchi tomonidan tasdiqlanadi.

## O'rnatish (Windows)

1. [Python 3.12](https://www.python.org/downloads/) ni o'rnating, **"Add python.exe to PATH"** ni belgilang.
2. `ornatish.bat` ni ishga tushiring (bir marta).
3. Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → `extension` papkasini tanlang.

## Ishlatish

1. `ishga_tushirish.bat` ni oching (oyna ochiq tursin).
2. Chrome'da sr.ihma.uz ga OneID orqali kiring va arizani oching (`/applications/<id>`).
3. `http://127.0.0.1:5300` da **"sr.ihma.uz dan olish"** → ariza ma'lumotlari yuklanadi.
4. Yangi mahalla, sabab, xabar beruvchi (pasport sr.ihma.uz dan to'ladi), telefon, izohni kiriting, PDF'ni (1 MB gacha) biriktiring → **Serverga yuborish**.

## Jarayon (sr.ihma.uz API)

`Application/Get` → `Household/Get`, `Household/GetChangeSelectLists` → `Reference/GetAll*` →
`Change/ResolvePersonByPassport` → `Storage/UploadTemp` → `Household/CreateChange` (`changeTypeId = 12`).
Batafsil: `kiritish/sr_client.py`.

## Qo'shimcha

- `open_browser.py` — kengaytma o'rnatilgan Chromium'ni ochib, sr.ihma.uz so'rovlarini `yozuvlar/` ga yozib oladi (API o'zgarsa o'rganish uchun). Kerak: `python -m playwright install chromium`.
- `build.py` — `fuqarolar.json` dan Excel ro'yxat va PDF nomlarini tayyorlash.

`yozuvlar/`, `db.sqlite3`, `media/`, `.secret_key`, `fuqarolar.json` da token va shaxsiy ma'lumotlar bo'ladi — ular repozitoriyga kiritilmaydi.
