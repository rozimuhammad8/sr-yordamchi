import io
import json
import re
import shutil
import time
import uuid
import zipfile
from datetime import date
from functools import wraps
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from build import enrich, safe_filename, write_excel
from pdf_siqish import siqish

from . import dalolatnoma
from .models import Yuborish
from .sr_client import MAX_PDF_BYTES, SrClient, SrError


def api(view):
    """JSON javob qaytaradi; sr.ihma.uz va tekshiruv xatolarini {"xato": ...} ko'rinishiga keltiradi."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        try:
            return JsonResponse(view(request, *args, **kwargs), safe=False)
        except SrError as e:
            return JsonResponse({"xato": str(e)}, status=e.status if 400 <= e.status < 600 else 502)
        except ValueError as e:
            return JsonResponse({"xato": str(e)}, status=400)
    return wrapper


def client(request):
    # tokenlar sahifadagi maydonlardan (kengaytma to'ldiradi) sarlavha orqali keladi
    return SrClient(request.headers.get("X-SR-Token", ""), request.headers.get("X-SR-CF", ""),
                    request.headers.get("X-SR-UA", ""))


def format_phone(raw):
    d = re.sub(r"\D", "", raw or "")
    if len(d) == 9:
        d = "998" + d
    if len(d) != 12:
        raise ValueError("Telefon raqami noto'g'ri (masalan: +998 90 123 45 67)")
    return f"+{d[:3]} {d[3:5]} {d[5:8]} {d[8:10]} {d[10:12]}"


def pinfl_birth_date(pinfl):
    century = {"1": 1800, "2": 1800, "3": 1900, "4": 1900, "5": 2000, "6": 2000}.get(pinfl[:1])
    if not re.fullmatch(r"\d{14}", pinfl or "") or not century:
        return ""
    return f"{century + int(pinfl[5:7])}-{pinfl[3:5]}-{pinfl[1:3]}"


def manzil(address):
    return ", ".join(x for x in [address.get("locality"), address.get("district")] if x)


@ensure_csrf_cookie
def index(request):
    return render(request, "kiritish/index.html")


@require_GET
@api
def tekshir(request):
    p = client(request).profile()
    return {"fullName": p.get("fullName"), "userName": p.get("userName")}


@require_GET
@api
def ariza(request, ariza_id):
    c = client(request)
    a = c.application(ariza_id)
    lists = c.change_select_lists(a["householdId"])
    # pasport seriyasi/raqami faqat xonadon a'zolarida bor — personId bo'yicha qo'shamiz
    pasportlar = {
        m.get("personId"): {"passportSeries": m.get("passportSeries") or "", "passportNo": m.get("passportNo") or ""}
        for m in c.household(a["householdId"]).get("members", [])
    }
    oldingi = Yuborish.objects.filter(xonadon_id=a["householdId"], holat=Yuborish.YUBORILDI).first()
    return {
        "ariza": {
            "id": a["id"],
            "externalNo": a.get("externalNo"),
            "status": a.get("status"),
            "householdId": a["householdId"],
            "address": a.get("address") or {},
            "applicantName": a.get("applicantName"),
            "applicantPinFL": a.get("applicantPinFL"),
            "applicantMobileNumber": a.get("applicantMobileNumber"),
            "members": [
                {**{k: m.get(k) for k in ("personId", "pinFL", "fullName", "dateOfBirth", "relationship", "isApplicant")},
                 **pasportlar.get(m.get("personId"), {"passportSeries": "", "passportNo": ""})}
                for m in a.get("members", []) if m.get("isActive")
            ],
        },
        "royxatlar": {
            "sabablar": [x for x in lists.get("changeReasons", []) if x.get("isActive")],
            "xabar_beruvchi_turlari": [x for x in lists.get("reporterTypes", []) if x.get("isActive")],
        },
        "oldingi": {"sana": timezone.localtime(oldingi.yaratilgan).strftime("%d.%m.%Y %H:%M"), "ozgartirish_id": oldingi.ozgartirish_id}
        if oldingi else None,
    }


def _royxat(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("items", "data", "list", "rows", "result", "results", "records"):
            if k in data:
                return _royxat(data[k])
    return []


@require_GET
@api
def ariza_qidir(request):
    pinfl = request.GET.get("pinfl", "").strip()
    if not re.fullmatch(r"\d{14}", pinfl):
        raise ValueError("PINFL 14 ta raqam bo'lishi kerak")
    natija = []
    for x in _royxat(client(request).search_applications(pinfl)):
        if not isinstance(x, dict) or not (x.get("id") or x.get("applicationId")):
            continue
        natija.append({
            "id": x.get("id") or x.get("applicationId"),
            "raqam": x.get("externalNo") or x.get("number") or "",
            "arizachi": x.get("applicantName") or x.get("fullName") or "",
            "pinfl": x.get("applicantPinFL") or x.get("pinfl") or x.get("pinFL") or "",
            "holat": x.get("statusName") or x.get("status") or "",
            "sana": str(x.get("createdOn") or x.get("createdAt") or x.get("submittedOn") or "")[:10],
        })
    return natija


# ---------- ommaviy: ZIP (dalolatnoma PDF'lari) -> OCR -> ro'yxat ----------
# media/zip/<id>/asl/NNN.pdf — ZIP'dagi asl fayllar; tayyor/<F.I.Sh>.pdf — to'g'rilangan, siqilgan, nomlangan;
# NNN.json — o'qilgan ma'lumot. 7 kundan eski yuklamalar o'chiriladi.
ZIP_MAX_PDF = 300


def _zip_nomi(info):
    nom = info.filename
    if not info.flag_bits & 0x800:  # Windows "Сжатая папка" nomlarni cp866 da yozadi
        try:
            nom = nom.encode("cp437").decode("cp866")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return nom.replace("\\", "/").rsplit("/", 1)[-1]


def _zip_papka(zid):
    papka = Path(settings.MEDIA_ROOT) / "zip" / zid
    if not re.fullmatch(r"[0-9a-f]{32}", zid) or not papka.is_dir():
        raise ValueError("ZIP topilmadi — qaytadan yuklang")
    return papka


def _eskilarni_tozala():
    ildiz = Path(settings.MEDIA_ROOT) / "zip"
    for p in ildiz.glob("*") if ildiz.is_dir() else []:
        if p.is_dir() and time.time() - p.stat().st_mtime > 7 * 86400:
            shutil.rmtree(p, ignore_errors=True)


@require_POST
@api
def zip_yukla(request):
    f = request.FILES.get("zip")
    if not f or not f.name.lower().endswith(".zip"):
        raise ValueError("ZIP fayl tanlang")
    _eskilarni_tozala()
    zid = uuid.uuid4().hex
    papka = Path(settings.MEDIA_ROOT) / "zip" / zid
    (papka / "asl").mkdir(parents=True)
    fayllar = []
    try:
        with zipfile.ZipFile(f) as z:
            for info in z.infolist():
                nom = _zip_nomi(info)
                if (info.is_dir() or not nom.lower().endswith(".pdf") or nom.startswith("._")
                        or "__MACOSX" in info.filename or info.file_size > 30 * 1024 * 1024):
                    continue
                n = len(fayllar)
                (papka / "asl" / f"{n:03d}.pdf").write_bytes(z.read(info))
                fayllar.append({"n": n, "nom": nom, "hajm": info.file_size})
                if len(fayllar) >= ZIP_MAX_PDF:
                    break
    except zipfile.BadZipFile:
        shutil.rmtree(papka, ignore_errors=True)
        raise ValueError("ZIP fayl buzilgan yoki ZIP emas")
    if not fayllar:
        shutil.rmtree(papka, ignore_errors=True)
        raise ValueError("ZIP ichida PDF topilmadi")
    (papka / "fayllar.json").write_text(json.dumps(fayllar, ensure_ascii=False), encoding="utf-8")
    return {"id": zid, "fayllar": fayllar}


@require_POST
@api
def zip_oqi(request, zid, n):
    papka = _zip_papka(zid)
    fayllar = json.loads((papka / "fayllar.json").read_text(encoding="utf-8"))
    fayl = next((x for x in fayllar if x["n"] == n), None)
    if not fayl:
        raise ValueError("PDF topilmadi")
    data = (papka / "asl" / f"{n:03d}.pdf").read_bytes()
    try:
        r = dalolatnoma.oqish(data)
    except dalolatnoma.OcrXato as e:
        raise ValueError(str(e))
    except Exception as e:  # buzilgan PDF — qator baribir chiqsin, qo'lda to'ldiriladi
        r = {"fish": "", "burchaklar": [], "izoh": f"PDF o'qilmadi: {e}"}

    # to'g'rilangan, 1 MB ga siqilgan PDF fuqaro ismi bilan
    try:
        pdf = siqish(dalolatnoma.tikla(data, r.get("burchaklar") or []))
    except Exception:
        pdf = data
    tayyor = papka / "tayyor"
    tayyor.mkdir(exist_ok=True)
    asos = safe_filename(r.get("fish") or "") or Path(fayl["nom"]).stem
    nom, k = f"{asos}.pdf", 2
    while (tayyor / nom).exists():
        nom, k = f"{asos} ({k}).pdf", k + 1
    (tayyor / nom).write_bytes(pdf)

    hoz = r.get("hozirgi_mahalla", "")
    if hoz and r.get("hozirgi_tuman"):
        hoz += f" ({r['hozirgi_tuman']})"
    qator = {
        "fish": r.get("fish", ""), "pinfl": r.get("pinfl", ""), "pasport": r.get("pasport", ""),
        "tugilgan_sana": r.get("tugilgan_sana", ""), "dalolatnoma_sanasi": r.get("dalolatnoma_sanasi", ""),
        "hozirgi_mahalla": hoz, "yangi_tuman": r.get("yangi_tuman", ""), "yangi_mahalla": r.get("yangi_mahalla", ""),
        "yangi_manzil": ", ".join(x for x in (r.get("yangi_tuman"), r.get("yangi_mahalla"), r.get("yangi_kocha")) if x),
        "telefon": r.get("telefon", ""), "izoh": r.get("izoh", ""), "muammo": "",
        "asl_nom": fayl["nom"], "pdf": nom, "hajm": len(pdf),
        "pdf_url": f"{settings.MEDIA_URL}zip/{zid}/tayyor/{nom}",
    }
    (papka / f"{n:03d}.json").write_text(json.dumps(qator, ensure_ascii=False), encoding="utf-8")
    return qator


@require_GET
def zip_natija(request, zid):
    """Qayta nomlangan PDF'lar + fuqarolar_royxati.xlsx — bitta ZIP."""
    try:
        papka = _zip_papka(zid)
    except ValueError as e:
        return JsonResponse({"xato": str(e)}, status=404)
    qatorlar = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(papka.glob("[0-9][0-9][0-9].json"))]
    for q in qatorlar:
        q["pdf_joyi"] = q["pdf"]
    enrich(qatorlar)
    xlsx = io.BytesIO()
    write_excel(xlsx, qatorlar)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("fuqarolar_royxati.xlsx", xlsx.getvalue())
        for p in sorted((papka / "tayyor").glob("*.pdf")):
            z.write(p, p.name)
    javob = HttpResponse(buf.getvalue(), content_type="application/zip")
    javob["Content-Disposition"] = f'attachment; filename="dalolatnomalar_{timezone.localtime():%d.%m.%Y_%H%M}.zip"'
    return javob


@require_GET
@api
def viloyatlar(request):
    return client(request).regions()


@require_GET
@api
def tumanlar(request, viloyat_id):
    return client(request).districts(viloyat_id)


@require_GET
@api
def mahallalar(request, tuman_id):
    return client(request).localities(tuman_id)


@require_GET
@api
def tarix(request):
    return [
        {
            "vaqt": timezone.localtime(y.yaratilgan).strftime("%d.%m.%Y %H:%M"),
            "fish": y.fish, "eski": y.eski_manzil, "yangi": y.yangi_manzil, "holat": y.holat,
            "ozgartirish_id": y.ozgartirish_id, "xato": y.xato, "pdf": y.pdf.url if y.pdf else "",
        }
        for y in Yuborish.objects.all()[:100]
    ]


@require_POST
@api
def yuborish(request):
    f, pdf = request.POST, request.FILES.get("pdf")

    # --- tekshiruv ---
    xatolar = []
    def raqam(nom, matn):
        v = f.get(nom, "").strip()
        if not v.isdigit():
            xatolar.append(matn)
            return 0
        return int(v)

    ariza_id = raqam("ariza_id", "ariza ID kiritilmagan")
    mahalla_id = raqam("yangi_mahalla_id", "yangi mahalla tanlanmagan")
    sabab_id = raqam("sabab_id", "o'zgartirish sababi tanlanmagan")
    turi_id = raqam("xabar_beruvchi_turi_id", "xabar beruvchi turi tanlanmagan")
    xabar_beruvchi = f.get("xabar_beruvchi", "").strip()
    if not xabar_beruvchi:
        xatolar.append("xabar beruvchi tanlanmagan")
    seriya = f.get("pasport_seriya", "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", seriya):
        xatolar.append("pasport seriyasi 2 ta lotin harfi bo'lishi kerak")
    pas_raqam = f.get("pasport_raqam", "").strip()
    if not re.fullmatch(r"\d{7}", pas_raqam):
        xatolar.append("pasport raqami 7 ta raqam bo'lishi kerak")
    try:
        telefon = format_phone(f.get("telefon", ""))
    except ValueError as e:
        xatolar.append(str(e))
    try:
        sana = date.fromisoformat(f.get("murojaat_sanasi", ""))
    except ValueError:
        xatolar.append("murojaat sanasi noto'g'ri")
    if not pdf:
        xatolar.append("PDF biriktirilmagan")
    elif not pdf.name.lower().endswith(".pdf"):
        xatolar.append("faqat PDF fayl qabul qilinadi")
    elif pdf.size > MAX_PDF_BYTES:
        xatolar.append(f"PDF hajmi {pdf.size / 1048576:.2f} MB, sr.ihma.uz 1 MB gacha qabul qiladi")
    if xatolar:
        raise ValueError("To'g'rilang:\n• " + "\n• ".join(xatolar))

    c = client(request)
    a = c.application(ariza_id)  # yangi holatini olamiz
    address = a.get("address") or {}
    if mahalla_id == address.get("localityId"):
        raise ValueError("Yangi mahalla hozirgi mahalla bilan bir xil — sr.ihma.uz buni qabul qilmaydi")

    members = [m for m in a.get("members", []) if m.get("isActive")]
    if xabar_beruvchi == "boshqa":
        rep_pinfl = f.get("boshqa_pinfl", "").strip()
        if not re.fullmatch(r"\d{14}", rep_pinfl):
            raise ValueError("Xabar beruvchining PINFL'i 14 ta raqam bo'lishi kerak")
        rep_birth, rep_name = pinfl_birth_date(rep_pinfl), f"PINFL {rep_pinfl}"
    else:
        m = next((m for m in members if str(m.get("personId")) == xabar_beruvchi), None)
        if not m:
            raise ValueError("Xabar beruvchi arizadagi a'zolar orasida topilmadi")
        rep_pinfl, rep_birth, rep_name = m["pinFL"], (m.get("dateOfBirth") or "")[:10], m["fullName"]

    content = pdf.read()
    yozuv = Yuborish(
        ariza_id=ariza_id, xonadon_id=a["householdId"], fish=a.get("applicantName") or "",
        pinfl=a.get("applicantPinFL") or "", eski_manzil=manzil(address),
        yangi_manzil=f.get("yangi_manzil_nomi", "").strip() or str(mahalla_id), yangi_mahalla_id=mahalla_id,
        sabab=f.get("sabab_nomi", "").strip(), xabar_beruvchi=rep_name, telefon=telefon,
        murojaat_sanasi=sana, izoh=f.get("izoh", "").strip(),
    )
    yozuv.pdf.save(pdf.name, ContentFile(content), save=False)

    # --- sr.ihma.uz ga yuborish ---
    try:
        person = c.resolve_person(rep_pinfl, rep_birth or pinfl_birth_date(rep_pinfl), seriya, pas_raqam)
        if not person or not person.get("personId"):
            raise SrError("Pasport ma'lumotlari bo'yicha shaxs topilmadi", 400)
        up = c.upload_pdf(pdf.name, content)
        res = c.create_relocation(
            household_id=a["householdId"], change_reason_id=sabab_id, new_locality_id=mahalla_id,
            reporter_type_id=turi_id, reporter_person_id=person["personId"], reporter_phone=telefon,
            reported_on=sana.isoformat(), note=yozuv.izoh, temp_file_id=up["fileId"],
        )
    except SrError as e:
        yozuv.holat, yozuv.xato = Yuborish.XATO, str(e)
        yozuv.save()
        raise
    yozuv.holat, yozuv.ozgartirish_id = Yuborish.YUBORILDI, res.get("id")
    yozuv.save()
    return {"ozgartirish_id": res.get("id"), "xabar_beruvchi": f"{person.get('surname', '')} {person.get('firstName', '')}".strip()}
