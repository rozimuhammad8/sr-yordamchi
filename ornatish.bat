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

echo Tesseract OCR (dalolatnomalarni o'qish uchun) o'rnatilmoqda...
if not exist "C:\Program Files\Tesseract-OCR\tesseract.exe" (
    winget install --id UB-Mannheim.TesseractOCR -e --silent --accept-package-agreements --accept-source-agreements
)
if not exist tessdata mkdir tessdata
copy /y "C:\Program Files\Tesseract-OCR\tessdata\osd.traineddata" tessdata\ >nul 2>nul
for %%L in (uzb_cyrl rus) do (
    if not exist tessdata\%%L.traineddata (
        echo   %%L tili yuklanmoqda...
        curl -sSL -C - --retry 5 -o tessdata\%%L.traineddata https://github.com/tesseract-ocr/tessdata_best/raw/main/%%L.traineddata
    )
)

echo Ma'lumotlar bazasi tayyorlanmoqda...
python manage.py migrate
echo.
echo Tayyor. Endi "ishga_tushirish.bat" ni oching.
pause
