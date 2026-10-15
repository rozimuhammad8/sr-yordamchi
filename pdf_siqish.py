"""Skaner qilingan PDF'ni sr.ihma.uz chegarasiga (1 MB) sig'adigan qilib siqish.

Dalolatnomalar (CamScanner va h.k.) har bir sahifasi bitta rasm bo'lgan PDF: rasmlar kichraytirilib,
JPEG sifatida qayta saqlanadi. Fayl chegaraga sig'guncha bosqichma-bosqich kuchliroq siqiladi.

Ishlatish:
    python pdf_siqish.py "PDFs/aa.pdf" ["PDFs/bb.pdf" ...]    (yoki papka: python pdf_siqish.py PDFs)

Asl fayl o'chirilmaydi: yonidagi asl/ papkasiga ko'chiriladi, siqilgani o'z nomida qoladi.
"""
import io
import os
import shutil
import sys

from PIL import Image
from pypdf import PdfReader, PdfWriter

CHEGARA = 950 * 1024  # sr.ihma.uz 1 MB gacha qabul qiladi — ozgina zaxira bilan
# (rasmning eng uzun tomoni, piksel; JPEG sifati) — matn o'qiladigan darajada qoladi
BOSQICHLAR = [(2200, 80), (1900, 72), (1700, 65), (1500, 58), (1300, 50), (1100, 45)]


def _bir_bosqich(data, max_px, sifat):
    w = PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    for page in w.pages:
        for img in page.images:
            im = img.image
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            im.thumbnail((max_px, max_px), Image.LANCZOS)
            img.replace(im, quality=sifat, optimize=True)
    w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def siqish(data, chegara=CHEGARA):
    """PDF baytlarini qaytaradi: chegaraga sig'sa — o'zi, aks holda siqilgani (eng kichigi)."""
    if len(data) <= chegara:
        return data
    eng_kichik = data
    for max_px, sifat in BOSQICHLAR:
        out = _bir_bosqich(data, max_px, sifat)
        if len(out) < len(eng_kichik):
            eng_kichik = out
        if len(out) <= chegara:
            break
    return eng_kichik


def fayl_siqish(path):
    with open(path, "rb") as f:
        data = f.read()
    kb = lambda n: f"{n / 1024:.0f} KB"
    if len(data) <= CHEGARA:
        print(f"  [joyida] {path} — {kb(len(data))}, siqish shart emas")
        return
    out = siqish(data)
    if len(out) >= len(data):
        print(f"  [o'zgarmadi] {path} — {kb(len(data))}, kichraytirib bo'lmadi")
        return
    asl_dir = os.path.join(os.path.dirname(path) or ".", "asl")
    os.makedirs(asl_dir, exist_ok=True)
    asl = os.path.join(asl_dir, os.path.basename(path))
    if not os.path.exists(asl):  # qayta ishga tushirilsa, birinchi asl nusxa saqlanib qoladi
        shutil.copy2(path, asl)
    with open(path, "wb") as f:
        f.write(out)
    ogoh = "" if len(out) <= CHEGARA else "  — DIQQAT: hali ham 1 MB dan katta"
    print(f"  [siqildi] {path}: {kb(len(data))} -> {kb(len(out))}{ogoh}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for arg in sys.argv[1:]:
        if os.path.isdir(arg):
            for name in sorted(os.listdir(arg)):
                if name.lower().endswith(".pdf"):
                    fayl_siqish(os.path.join(arg, name))
        else:
            fayl_siqish(arg)


if __name__ == "__main__":
    main()
