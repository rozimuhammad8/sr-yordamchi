@echo off
chcp 65001 >nul
rem SR yordamchi serverini ishga tushiradi va brauzerda ochadi. Ishlayotganda bu oynani yopmang.
cd /d "%~dp0"
title SR yordamchi - server (yopmang)

rem loyihaning virtual muhiti (.venv) bo'lsa — o'sha Python va kutubxonalar ishlatiladi
if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
) else (
    echo .venv topilmadi — tizimdagi Python ishlatiladi.
)

python manage.py migrate >nul
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:5300/"
echo SR yordamchi ishlayapti: http://127.0.0.1:5300/
echo To'xtatish uchun shu oynani yoping.
python manage.py runserver 127.0.0.1:5300 --noreload
pause
