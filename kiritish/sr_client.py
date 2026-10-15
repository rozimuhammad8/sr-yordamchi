"""sr.ihma.uz API mijozi.

API'lar 2026-10-15 dagi yozuv (yozuvlar/api_*.jsonl) va sayt JS kodidan aniqlangan.
Xonadon manzilini (mahallasini) o'zgartirish jarayoni, saytning o'zi qanday qilsa xuddi shunday:
    POST /Application/GetList {page, pageSize, search} -> arizalar ro'yxati (PINFL bo'yicha qidiruv)
    GET  /Application/Get?id=                  -> householdId, a'zolar, hozirgi manzil
    GET  /Household/GetChangeSelectLists        -> sabablar, xabar beruvchi turlari
    POST /Change/ResolvePersonByPassport        -> xabar beruvchining personId si (pasport bo'yicha tekshiruv)
    POST /Storage/UploadTemp  multipart {document: "change", file: PDF <= 1 MB} -> fileId
    POST /Household/CreateChange  changeTypeId=12 (HOUSEHOLD_RELOCATE) -> {id}

Avtorizatsiya: "Authorization" cookie'si = Bearer JWT (taxminan 8 soat amal qiladi).
"""
import uuid

import requests

BASE = "https://sr.ihma.uz/api"
CHANGE_TYPE_RELOCATE = 12
COMMUNICATION_PHONE = 1
MAX_PDF_BYTES = 1024 * 1024
DEFAULT_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")


class SrError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


class SrClient:
    def __init__(self, token, cf_clearance="", user_agent=""):
        token = (token or "").strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token:
            raise SrError("Auth token kiritilmagan", 401)
        self.http = requests.Session()
        self.http.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "uz",
            "Authorization": f"Bearer {token}",
            "User-Agent": user_agent or DEFAULT_UA,
            "Origin": "https://sr.ihma.uz",
            "Referer": "https://sr.ihma.uz/",
        })
        self.http.cookies.set("Authorization", token, domain="sr.ihma.uz")
        if cf_clearance:
            self.http.cookies.set("cf_clearance", cf_clearance.strip(), domain=".ihma.uz")

    def _call(self, method, path, **kwargs):
        try:
            r = self.http.request(method, BASE + path, headers={"X-Request-Id": str(uuid.uuid4())}, timeout=60, **kwargs)
        except requests.RequestException as e:
            raise SrError(f"sr.ihma.uz ga ulanib bo'lmadi: {e}") from e
        if r.status_code == 401:
            raise SrError("Token yaroqsiz yoki muddati tugagan. sr.ihma.uz ga qayta kiring va tokenlarni qayta oling.", 401)
        if r.status_code == 403 and "cloudflare" in r.headers.get("server", "") and "json" not in r.headers.get("content-type", ""):
            raise SrError("Cloudflare so'rovni to'xtatdi. sr.ihma.uz sahifasini yangilab, tokenlarni qayta oling.", 403)
        try:
            data = r.json() if r.content else None
        except ValueError:
            data = None
        if not r.ok:
            detail = ""
            if isinstance(data, dict):
                detail = data.get("message") or data.get("title") or data.get("detail") or ""
                errors = data.get("fieldErrors") or data.get("errors")
                if errors:
                    detail = f"{detail} {errors}".strip()
            raise SrError(f"{path} ({r.status_code}): {detail or r.text[:300]}", r.status_code)
        return data

    # --- o'qish ---
    def profile(self):
        return self._call("GET", "/User/GetProfileData")

    def application(self, application_id):
        return self._call("GET", "/Application/Get", params={"id": application_id})

    def search_applications(self, search, page=1, page_size=20):
        return self._call("POST", "/Application/GetList", json={"page": page, "pageSize": page_size, "search": search})

    def household(self, household_id):
        # a'zolarning pasport seriyasi/raqami shu yerda bor (Application/Get da yo'q)
        return self._call("GET", "/Household/Get", params={"id": household_id})

    def change_select_lists(self, household_id):
        return self._call("GET", "/Household/GetChangeSelectLists", params={"householdId": household_id})

    def regions(self):
        return self._call("GET", "/Reference/GetAllRegions")

    def districts(self, region_id):
        return self._call("GET", "/Reference/GetAllDistricts", params={"regionId": region_id})

    def localities(self, district_id):
        return self._call("GET", "/Reference/GetAllLocalities", params={"districtId": district_id, "limit": 1000})

    # --- yozish ---
    def resolve_person(self, pinfl, birth_date, passport_series, passport_no):
        return self._call("POST", "/Change/ResolvePersonByPassport", json={
            "pinfl": pinfl, "birthDate": birth_date,
            "passportSeries": passport_series, "passportNo": passport_no,
        })

    def upload_pdf(self, filename, content):
        if len(content) > MAX_PDF_BYTES:
            raise SrError(f"PDF hajmi {len(content) / 1048576:.2f} MB, sr.ihma.uz 1 MB gacha qabul qiladi", 400)
        return self._call("POST", "/Storage/UploadTemp", data={"document": "change"},
                          files={"file": (filename, content, "application/pdf")})

    def create_relocation(self, *, household_id, change_reason_id, new_locality_id, reporter_type_id,
                          reporter_person_id, reporter_phone, reported_on, note, temp_file_id):
        return self._call("POST", "/Household/CreateChange", json={
            "householdId": household_id,
            "changeTypeId": CHANGE_TYPE_RELOCATE,
            "changeReasonId": change_reason_id,
            "personId": None,
            "relationshipId": None,
            "maritalStatusId": None,
            "newLocalityId": new_locality_id,
            "reporterTypeId": reporter_type_id,
            "reporterPersonId": reporter_person_id,
            "reporterCommunicationModeId": COMMUNICATION_PHONE,
            "reporterPhone": reporter_phone,
            "reporterEmail": None,
            "reportedOn": reported_on,
            "note": note or None,
            "tempFileId": temp_file_id,
        })
