@echo off
chcp 65001 >nul
rem SR yordamchi: yangi kompyuterda BIR MARTA ishga tushiriladi
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python topilmadi. python.org dan Python 3.12 ni o'rnating va "Add python.exe to PATH" ni belgilang.
    pause
    exit /b 1
)

echo Kutubxonalar o'rnatilmoqda...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Kutubxonalarni o'rnatishda xato. Internetni tekshiring.
    pause
    exit /b 1
)

echo Ma'lumotlar bazasi tayyorlanmoqda...
python manage.py migrate
echo.
echo Tayyor. Endi "ishga_tushirish.bat" ni oching.
pause
