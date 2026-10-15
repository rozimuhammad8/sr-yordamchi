"""Skaner qilingan dalolatnoma PDF'idan fuqaro ma'lumotlarini olish (Tesseract OCR, lokal).

    oqish(pdf_baytlari) -> {"fish", "pinfl", "tugilgan_sana", "dalolatnoma_sanasi", "hozirgi_mahalla",
                            "hozirgi_tuman", "yangi_viloyat", "yangi_tuman", "yangi_mahalla", "yangi_kocha",
                            "telefon", "izoh", "matn"}

Kerak: Tesseract (UB-Mannheim) va loyihadagi tessdata/ (uzb_cyrl, rus, osd, eng).
Topilmagan maydon "" bo'ladi; shubhali joylar "izoh" ga yoziladi — natija jadvalda tekshiriladi.
"""
import io
import os
import re
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESSDATA = os.path.join(BASE, "tessdata")
TESSERACT = (os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
             or r"C:\Program Files\Tesseract-OCR\tesseract.exe")
TILLAR = "uzb_cyrl+rus"


class OcrXato(Exception):
    pass


# ---------- PDF -> rasm -> matn ----------

def _rasmlar(data):
    """Har bir sahifadagi eng katta rasm (skaner), sahifa /Rotate i hisobga olingan holda."""
    from pypdf import PdfReader

    rasmlar = []
    for page in PdfReader(io.BytesIO(data)).pages:
        imgs = [im.image for im in page.images]
        if not imgs:
            continue
        img = max(imgs, key=lambda i: i.size[0] * i.size[1])
        if page.rotation:
            img = img.rotate(-page.rotation, expand=True)
        rasmlar.append(img.convert("L"))
    return rasmlar


def _ocr(img, til=TILLAR, psm=6):
    import pytesseract

    if not os.path.exists(TESSERACT):
        raise OcrXato("Tesseract o'rnatilmagan (C:\\Program Files\\Tesseract-OCR)")
    pytesseract.pytesseract.tesseract_cmd = TESSERACT
    os.environ["TESSDATA_PREFIX"] = TESSDATA
    return pytesseract.image_to_string(img, lang=til, config=f"--psm {psm}")


def _ball(matn):
    """Matn qanchalik "o'qiladigan": tanish so'zlar (kirill yoki lotin) va so'zlar soni."""
    k = matn.lower()
    tanish = sum(k.count(s) for s in ("далолатнома", "мфй", "туман", "раиси", "йилда", "ёрдамчиси", "яша",
                                      "dalolatnoma", "mfy", "tuman", "raisi", "yilda", "yordamchisi", "yasha"))
    return tanish * 50 + len(re.findall(r"[а-яёўқғҳ]{3,}|[a-z]{3,}", k))


def _tik_matn(img):
    """Sahifa yonboshlab/teskari skanerlangan bo'lsa — to'rt tomonini sinab, eng yaxshi o'qilganini oladi.
    Lotinda yozilgan hujjat kirillga o'giriladi (kirill modeli lotinni ham yaxshi o'qiydi)."""
    if min(img.size) < 1400:
        # qattiq siqilgan skaner (~70 DPI): 2 barobar kattalashtirish OCR xatolarini keskin kamaytiradi
        from PIL import Image
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    matn, burchak = _ocr(img), 0
    if not (re.search(r"далолатнома|dalolatnoma", matn.lower()) and _ball(matn) > 300):
        kichik = img.copy()
        kichik.thumbnail((1400, 1400))
        eng = (_ball(_ocr(kichik)), 0)
        for b in (90, 180, 270):
            ball = _ball(_ocr(kichik.rotate(b, expand=True)))
            if ball > eng[0]:
                eng = (ball, b)
        burchak = eng[1]
        if burchak:
            matn = _ocr(img.rotate(burchak, expand=True))
    if len(re.findall(r"[a-zA-Z]", matn)) > len(re.findall(r"[а-яА-ЯёўқғҳЁЎҚҒҲ]", matn)):
        matn = kirillga(matn)
    return matn, burchak


# o'zbek lotin -> kirill (lotinda yozilgan dalolatnomalar ham bir xil qoidalar bilan ajratilishi uchun)
_LK = [("o'", "ў"), ("g'", "ғ"), ("sh", "ш"), ("ch", "ч"), ("yo", "ё"), ("yu", "ю"), ("ya", "я"), ("ye", "е"),
       ("iye", "ие"), ("ts", "ц")]
_LK1 = dict(zip("abdefghijklmnopqrstuvxyz", "абдефгҳижклмнопқрстувхйз"))


def kirillga(matn):
    matn = re.sub(r"[ʻʼ‘’`´]", "'", matn)
    out, i = [], 0
    while i < len(matn):
        c = matn[i]
        low = matn[i:i + 3].lower()
        for lat, kir in sorted(_LK, key=lambda x: -len(x[0])):
            if low.startswith(lat):
                out.append(kir.upper() if c.isupper() else kir)
                i += len(lat)
                break
        else:
            k = _LK1.get(c.lower())
            if c.lower() == "e" and (i == 0 or not matn[i - 1].isalpha()):
                k = "э"  # so'z boshida: Ergashev -> Эргашев
            out.append((k.upper() if c.isupper() else k) if k else c)
            i += 1
    return "".join(out)


def ocr_matn(data):
    """(matn, burchaklar): har bir sahifa uchun rasm necha gradus (soat miliga teskari) burildi."""
    rasmlar = _rasmlar(data)
    if not rasmlar:
        raise OcrXato("PDF ichida skaner rasmi topilmadi")
    natija = [_tik_matn(img) for img in rasmlar]
    return "\n".join(m for m, _ in natija), [b for _, b in natija]


# ---------- matndan maydonlar ----------

SANA = r"(\d{1,2})\s*[.,/]\s*(\d{1,2})\s*[.,/]\s*(\d{4})"
TUGILGAN = r"\s*[-.]?\s*-?\s*й\.?\s*и?лда\s+ту[ғг]"
KB = "А-ЯЁЎҚҒҲ"
ISM = rf"[{KB}][а-яёўқғҳ]+(?:-[{KB}а-яёўқғҳ]+)?"
FAMILIYA = rf"[{KB}][а-яёўқғҳ]+(?:ов|ова|ев|ева|ёв|ёва|ин|ина)"
OTASI = r"(?:қизи|кизи|ўғли|ўгли|угли)"
# MFY nomidan oldin turishi mumkin bo'lgan, nomga kirmaydigan so'zlar
STOP = {"туман", "тумани", "шахар", "шаҳар", "шахри", "шаҳри", "вилояти", "фуқаро", "фукаро", "оилавий",
        "кўра", "куни", "даха", "даҳа", "кичик", "ва", "ҳудудида", "худудида", "манзили", "й", "йил", "йилда",
        "хозирда", "ҳозирда", "эса", "аризачи", "фукоро"}
# ism deb olinmaydigan so'zlar (imzo chekuvchilarning lavozimlari)
LAVOZIM = {"профилактика", "хоким", "ҳоким", "ёшлар", "ижтимоий", "хотин", "раиси", "инспектори", "етакчиси",
           "ёрдамчиси", "фаоли", "ходим", "ходими", "банк", "агенти", "маҳалла", "махалла", "катта", "майор"}
# yangi manzildan OLDIN keladigan iboralar: "асил яшаш манзили <yangi>", "хозирда <yangi>"
OLDIN = r"асил\s+яшаш\W+(?:\S{1,2}\s+)?манзили|[хҳ]озирда|[хҳ]озирги\s+кунда"
# yangi manzildan KEYIN keladigan iboralar: "<yangi> да яшаётганлиги", "<yangi> га кўчиб кетганлиги"
KEYIN = (r"[кқ][ўу]чиб\s+кетган|яшаб\s+келаёт|яшаётган|доимий\s+яшаш|истиқомат\s+қилади|истикомат\s+килади"
         r"|яшашлиги")
UMUMIY = r"яшаш\W+(?:\S{1,2}\s+)?манзили"


def kalit(s):
    """Solishtirish uchun: kichik harf, ҳ/қ/ғ/ў/ё farqlari va tinish belgilari olib tashlanadi."""
    s = str(s or "").lower()
    for a, b in (("ҳ", "х"), ("қ", "к"), ("ғ", "г"), ("ў", "у"), ("ё", "е"), ("ъ", "")):
        s = s.replace(a, b)
    return re.sub(r"[^a-zа-я0-9]+", "", s)


def _tozala(matn):
    # "ДАЛОЛАТНОМА" dan oldingi blank sarlavhasi va imzolar qismi kerak emas
    m = re.search(r"Д\s*А\s*Л\s*О\s*Л\s*А\s*Т\s*Н\s*О\s*М\s*А", matn)
    if m:
        matn = matn[m.start():]
    m = re.search(r"(?:Ю[ҳқк]*оридагиларни|Ушбу\s+ма[ъ]?лумотни|Ушбуни\s+т[ўу][ғг]ри|Ушбу\s+далолатнома\s+т[ўу]?[ғг]ри"
                  r"|Далолатномани\s+т[ўу][ғг]ри)", matn)
    if m:
        matn = matn[:m.start()]
    matn = re.sub(r"\s+", " ", matn)
    # muhr/chiziq qoldiqlari: "Алиева | Нигора", "Андижон | ^^ | тумани"
    matn = re.sub(r"(?:\s[|\\^~_]+)+(?=\s)", "", matn)
    # "АЛИЕВА НИГОРА ОДИЛЖОН ҚИЗИ" -> "Алиева Нигора Одилжон қизи"
    matn = re.sub(rf"\b[{KB}]{{4,}}\b", lambda m: m.group().capitalize(), matn)
    matn = re.sub(r"\b(Қизи|Кизи|Ўғли|Угли)\b", lambda m: m.group().lower(), matn)
    matn = re.sub(r"ма[ҳх]алла\s+фу[қк]аролар\s+йи[ғг]ини", "МФЙ", matn, flags=re.I)
    # OCR "МФЙ" ni "МФИ", "MOH", "MODA", "мфй" deb o'qiydi
    matn = re.sub(r"(?<!\w)(?:МФ[ЙИ]|Мф[йи]|мф[йи]|MOIH|MOH|МОН|MODA|M[OО]Й|МОЙ)", "МФЙ", matn)
    return matn


def _mfylar(matn):
    """Matndagi har bir "... МФЙ" uchun (boshi, oxiri, nomi)."""
    natija = []
    for m in re.finditer(r"МФЙ", matn):
        sozlar = matn[:m.start()].split()[-4:]
        nom = []
        for j in range(len(sozlar) - 1, -1, -1):
            s = sozlar[j]
            toza = s.strip("\"“”«»'")
            if len(nom) == 3 or toza.lower().strip(",.:;") in STOP or re.search(r"[,;:]$|\.", toza):
                break
            nom.insert(0, toza)
            if j > 0 and re.fullmatch(FAMILIYA, sozlar[j - 1].strip(",.")):
                nom.pop(0)  # bu so'z — fuqaroning ismi ("Алиева Нигора Янги Андижон МФЙ")
                break
        hammasi = list(nom)
        while nom and not (nom[0][:1].isupper() or nom[0][:1].isdigit()):
            nom.pop(0)
        if not nom and hammasi:  # "хозирда чавкан дарё мфй да" — kichik harfda yozilgan nom
            nom = [s.capitalize() for s in hammasi[-2:]]
        nom = [s for s in nom if s]
        if nom:
            boshi = matn.rfind(nom[0], 0, m.start())
            natija.append((boshi if boshi >= 0 else m.start(), m.end(), " ".join(nom)))
    return natija


def _sana(m):
    d, mo, y = m.group(1), m.group(2), m.group(3)
    return f"{int(d):02d}.{int(mo):02d}.{y}"


def _tuman_oldidan(matn, gacha):
    """MFY nomidan oldingi 60 belgida "X тумани" / "X шаҳар" / "X вилояти"."""
    oyna = matn[max(0, gacha - 60):gacha]
    tuman, viloyat = "", ""
    for m in re.finditer(r"(" + ISM + r")\s+(тумани|туман|шаҳри|шахри|шаҳар|шахар)(?!\w)", oyna):
        tuman = f"{m.group(1)} " + ("тумани" if m.group(2).startswith("туман") else "шаҳар")
    for m in re.finditer(r"(" + ISM + r")\s+вилояти", oyna):
        viloyat = f"{m.group(1)} вилояти"
    return tuman, viloyat


def _kocha(matn, dan):
    """Yangi MFY nomidan keyingi ko'cha/uy (ixtiyoriy)."""
    qism = re.split(r"\s(?:яша|кўчиб|кучиб|ижтимоий|аниқ|аник|маълум|малум|доимий|истиқомат|истикомат)"
                    r"|\s\d+\s+йил|[.\"(]", matn[dan:dan + 70])[0]
    qism = re.sub(r"кўчасида(ги)?|кучасида(ги)?", "кўчаси", qism.strip(" ,"))
    qism = re.sub(r"(\d+)\s*[-–]?\s*уй(да|га)?", r"\1-уй", qism)
    return qism if re.search(r"кўча|куча|уй|дом|кв", qism) else ""


def _nomzodlar(matn):
    """Familiya + ism [+ ota ismi] [+ қизи/ўғли] ko'rinishidagi barcha ismlar."""
    natija = []
    for m in re.finditer(rf"({FAMILIYA})\s+({ISM})(?:\s+({ISM}))?(?:\s+({OTASI})(?!\w))?", matn):
        fam, ism, ota, suff = m.group(1), m.group(2), m.group(3), m.group(4)
        if ism.isupper() or fam.lower() in LAVOZIM or ism.lower() in LAVOZIM:
            continue
        oxiri = m.end()
        if ota and not suff:
            keyingi = matn[m.end(3):].split()[:1]
            # "Алиева Нигора Янги Андижон МФЙ" — 3-so'z MFY nomining boshi, ota ismi emas
            if ota.lower() in LAVOZIM or (keyingi and (re.match(rf"[{KB}]", keyingi[0]) or keyingi[0].startswith("МФЙ"))):
                ota, oxiri = None, m.end(2)
        natija.append({"boshi": m.start(), "oxiri": oxiri, "fam": fam, "ism": ism, "ota": ota, "suff": suff})
    return natija


def _shaxs(matn):
    """Ko'chirilayotgan fuqaroning F.I.Sh i va nomzod ma'lumoti."""
    nomzod = _nomzodlar(matn)
    if not nomzod:
        return "", None
    tanlangan = None
    # 1) "... инобатга олиб Алиева Нигорани ... кўчириш"
    m = re.search(rf"инобатга\s+олиб\s+({FAMILIYA})\s+({ISM})", matn)
    if m:
        ism = re.sub(r"ни$", "", m.group(2))
        tanlangan = next((c for c in nomzod if c["fam"] == m.group(1) and c["ism"].startswith(ism)), None)
    # 2) "... йилда туғилган [фуқаро] Алиева ...", "ушбу фуқаро Алиева ..."
    for oldi in (r"ту[ғг][иу]л[иг]?ан[.,]?\s+(?:фу[қк][ао]ро\s+)?", r"(?:фу[қк][ао]ро|аризачи)\s+"):
        if tanlangan:
            break
        for t in re.finditer(oldi, matn):
            tanlangan = next((c for c in nomzod if 0 <= c["boshi"] - t.end() <= 3), None)
            if tanlangan:
                break
    # 3) PINFL dan oldingi ism, aks holda birinchisi
    if not tanlangan:
        p = re.search(r"(?<!\d)\d{14}(?!\d)", matn)
        oldin = [c for c in nomzod if p and c["oxiri"] <= p.start()]
        tanlangan = oldin[-1] if oldin else nomzod[0]

    c = tanlangan
    qism = [c["fam"], c["ism"]] + ([c["ota"]] if c["ota"] else [])
    if c["suff"]:
        qism.append("қизи" if c["suff"].lower() in ("қизи", "кизи") else "ўғли")
    elif c["ota"] and not re.search(r"(вна|вич)$", c["ota"]):
        # OCR "кизи" ni o'qiy olmagan bo'lsa (masalan, '"KUBA'), familiyaga qarab qo'shiladi
        qism.append("қизи" if c["fam"].endswith("а") else "ўғли")
    return " ".join(qism), c


def _pinfl_tekshir(pinfl):
    """(to'g'rimi, tug'ilgan sana "dd.mm.yyyy")."""
    try:
        from build import pinfl_info
    except ImportError:
        return True, ""
    ok, _, born, _ = pinfl_info(pinfl)
    return ok, born


def _yangi_joy(matn, mfylar):
    """Yangi MFY: (nomi, boshi, oxiri) yoki None."""
    hoz = kalit(mfylar[0][2]) if mfylar else ""
    # 1) "асил яшаш манзили <yangi>", "хозирда <yangi>"
    for a in re.finditer(OLDIN, matn):
        x = next((x for x in mfylar if a.end() <= x[0] < a.end() + 100), None)
        if x:
            return x[2], x[0], x[1]
        # "хозирда Хўжаобод тумани Мустакиллик 30 йиллик яшаётганлиги" — "МФЙ" so'zi tushib qolgan
        s = re.match(rf"\s*(?:{ISM}\s+(?:тумани|туман|шаҳар|шахар|шаҳри|шахри)\s+)?"
                     rf"([{KB}][^\s,]*(?:\s+[^\s,]+){{0,2}}?)\s+(?:яша|истиқомат|истикомат)", matn[a.end():a.end() + 100])
        if s:
            nom = re.sub(r"(да|га)$", "", s.group(1))
            return nom, a.end() + s.start(1), a.end() + s.end(1)
    # 2) "<yangi> да яшаётганлиги / га кўчиб кетганлиги / доимий яшаши"
    for v in re.finditer(KEYIN, matn):
        oldin = [x for x in mfylar if x[1] <= v.start() and v.start() - x[1] < 120]
        if oldin:
            return oldin[-1][2], oldin[-1][0], oldin[-1][1]
    # 3) "яшаш манзили <yangi>", 4) hozirgisidan farqli birinchi MFY
    for a in re.finditer(UMUMIY, matn):
        x = next((x for x in mfylar if a.end() <= x[0] < a.end() + 100 and kalit(x[2]) != hoz), None)
        if x:
            return x[2], x[0], x[1]
    x = next((x for x in mfylar[1:] if kalit(x[2]) != hoz), None)
    return (x[2], x[0], x[1]) if x else None


def ajrat(matn):
    asl = matn
    # sana ba'zan "ДАЛОЛАТНОМА" sarlavhasidan oldin yoziladi ("22.09.2026 yil \n DALOLATNOMA")
    m = re.search(r"Д\s*А\s*Л\s*О\s*Л\s*А\s*Т\s*Н\s*О\s*М\s*А", matn)
    sarlavha_oldi = re.sub(r"\s+", " ", matn[max(0, m.start() - 120):m.start()]) if m else ""
    matn = _tozala(matn)
    r = dict.fromkeys(("fish", "pinfl", "pasport", "tugilgan_sana", "dalolatnoma_sanasi", "hozirgi_mahalla",
                       "hozirgi_tuman", "yangi_viloyat", "yangi_tuman", "yangi_mahalla", "yangi_kocha", "telefon"), "")
    izoh = []

    m = re.search(SANA, sarlavha_oldi)
    if m:
        r["dalolatnoma_sanasi"] = _sana(m)
    for m in re.finditer(SANA, matn):
        if r["dalolatnoma_sanasi"]:
            break
        if not re.match(TUGILGAN, matn[m.end():]):
            r["dalolatnoma_sanasi"] = _sana(m)
    m = re.search(SANA + TUGILGAN, matn)
    if m:
        r["tugilgan_sana"] = _sana(m)

    r["fish"], shaxs = _shaxs(matn)
    pinfllar = list(re.finditer(r"(?<!\d)\d{14}(?!\d)", matn))
    if shaxs:
        keyin = [p for p in pinfllar if 0 <= p.start() - shaxs["oxiri"] <= 80]
        if keyin:
            r["pinfl"] = keyin[0].group()
    if not r["pinfl"] and len(pinfllar) == 1:
        r["pinfl"] = pinfllar[0].group()
    if r["pinfl"]:
        ok, born = _pinfl_tekshir(r["pinfl"])
        if not ok:
            izoh.append("PINFL nazorat raqami mos emas — OCR xatosi bo'lishi mumkin")
        elif not r["tugilgan_sana"]:
            r["tugilgan_sana"] = born
        elif born and born != r["tugilgan_sana"]:
            izoh.append(f"PINFL'dagi sana ({born}) hujjatdagidan farq qiladi")

    m = re.search(r"(?<![\w])([A-ZА-Я]{2})\s?(\d{7})(?!\d)", matn)
    if m:
        seriya = m.group(1).translate(str.maketrans("АВЕКМНОРСТХ", "ABEKMHOPCTX"))
        r["pasport"] = f"{seriya} {m.group(2)}"
        if seriya not in ("AA", "AB", "AC", "AD", "AE", "AF", "FA", "FB", "FK"):
            izoh.append(f"pasport seriyasi shubhali ({seriya}) — OCR xatosi bo'lishi mumkin")

    mfylar = _mfylar(matn)
    if mfylar:
        r["hozirgi_mahalla"] = mfylar[0][2] + " МФЙ"
        r["hozirgi_tuman"] = _tuman_oldidan(matn, mfylar[0][0])[0]
        if not r["hozirgi_tuman"]:
            m = re.search(r"(" + ISM + r")\s+туман", matn)
            r["hozirgi_tuman"] = f"{m.group(1)} тумани" if m else ""

    yangi = _yangi_joy(matn, mfylar)
    if yangi:
        nom, boshi, oxiri = yangi
        r["yangi_mahalla"] = nom + " МФЙ"
        r["yangi_tuman"], r["yangi_viloyat"] = _tuman_oldidan(matn, boshi)
        r["yangi_kocha"] = _kocha(matn, oxiri)
    else:
        izoh.append("yangi mahalla aniqlanmadi")

    for m in re.finditer(r"\+?998[\d\s\-]{9,14}\d", matn):
        raqam = re.sub(r"\D", "", m.group())
        if len(raqam) == 12:
            r["telefon"] = "+" + raqam
            break
        izoh.append(f"telefon noto'g'ri: {m.group().strip()}")

    if not r["fish"]:
        izoh.append("F.I.Sh aniqlanmadi")
    if not r["dalolatnoma_sanasi"]:
        izoh.append("dalolatnoma sanasi o'qilmadi")
    if len(pinfllar) > 1:
        izoh.append(f"matnda {len(pinfllar)} ta PINFL bor")
    r["izoh"] = "; ".join(izoh)
    r["matn"] = asl
    return r


def oqish(data):
    matn, burchaklar = ocr_matn(data)
    r = ajrat(matn)
    r["burchaklar"] = burchaklar
    return r


def tikla(data, burchaklar):
    """PDF sahifalarini OCR aniqlagan burchakka burib qo'yadi (sr.ihma.uz da to'g'ri ko'rinsin)."""
    if not any(burchaklar):
        return data
    from pypdf import PdfReader, PdfWriter

    w = PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    for page, b in zip(w.pages, burchaklar):
        if b:
            page.rotate((360 - b) % 360)  # PIL soat miliga teskari, PDF /Rotate — soat mili bo'yicha
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()
