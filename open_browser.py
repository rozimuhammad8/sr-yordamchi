"""Chromium'ni kengaytma bilan ochadi va sr.ihma.uz API so'rovlarini yozib oladi.

1-tab: sr.ihma.uz, 2-tab: SR yordamchi Django sahifasi (http://127.0.0.1:5300/).
Har bir so'rov yuborilishi va javobi kelishi bilan darhol `yozuvlar/api_<vaqt>.jsonl` ga yoziladi,
shuning uchun brauzer to'satdan yopilsa ham yozuvlar yo'qolmaydi.
Brauzer profili `.brauzer_profil/` da: keyingi safar login saqlangan bo'lishi mumkin.
"""
import json
import os
from datetime import datetime

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
EXT_DIR = os.path.join(HERE, "extension")
PROFILE_DIR = os.path.join(HERE, ".brauzer_profil")
OUT_DIR = os.path.join(HERE, "yozuvlar")
START_URL = "https://sr.ihma.uz"
APP_URL = "http://127.0.0.1:5300/"
MAX_BODY = 50_000
API_TYPES = {"xhr", "fetch", "document", "other"}


def now():
    return datetime.now().isoformat(timespec="milliseconds")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log = open(os.path.join(OUT_DIR, f"api_{stamp}.jsonl"), "w", encoding="utf-8")

    def write(entry):
        log.write(json.dumps(entry, ensure_ascii=False) + "\n")
        log.flush()
        os.fsync(log.fileno())

    def wanted(req):
        return req.resource_type in API_TYPES and req.url.startswith("https://") and "/cdn-cgi/" not in req.url

    def on_request(req):
        # javobni kutmasdan, so'rov ketishi bilan yoziladi
        if not wanted(req):
            return
        entry = {"bosqich": "sorov", "id": id(req), "vaqt": now(), "method": req.method,
                 "url": req.url, "type": req.resource_type, "request_headers": req.headers}
        post = req.post_data_buffer
        if post:
            if "multipart" in req.headers.get("content-type", ""):
                # fayl yuklash: binar qismini tashlab, maydon nomlarini saqlaymiz
                entry["post_multipart_head"] = post[:3000].decode("utf-8", "replace")
                entry["post_size"] = len(post)
            else:
                entry["post_data"] = post.decode("utf-8", "replace")[:MAX_BODY]
        write(entry)

    def on_failed(req):
        if wanted(req):
            write({"bosqich": "xato", "id": id(req), "vaqt": now(), "method": req.method,
                   "url": req.url, "xato": req.failure})

    def on_response(response):
        req = response.request
        if not wanted(req):
            return
        entry = {"bosqich": "javob", "id": id(req), "vaqt": now(), "method": req.method,
                 "url": req.url, "status": response.status}
        try:
            entry["request_headers"] = req.all_headers()  # cookie va authorization bilan to'liq
            entry["response_headers"] = response.all_headers()
        except Exception:
            entry["response_headers"] = response.headers
        try:
            ctype = response.headers.get("content-type", "")
            if "json" in ctype or "text" in ctype:
                entry["response_body"] = response.text()[:MAX_BODY]
        except Exception as e:  # redirect va h.k. uchun body bo'lmaydi
            entry["response_body_error"] = str(e)
        write(entry)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            PROFILE_DIR,
            channel="chromium",
            headless=False,
            no_viewport=True,
            ignore_default_args=["--enable-automation"],
            args=[
                f"--disable-extensions-except={EXT_DIR}",
                f"--load-extension={EXT_DIR}",
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
            ],
        )
        context.on("request", on_request)
        context.on("requestfailed", on_failed)
        context.on("response", on_response)
        sr = context.pages[0] if context.pages else context.new_page()
        sr.goto(START_URL)

        app = context.new_page()
        app.goto(APP_URL)
        sr.bring_to_front()
        print("Brauzer ochildi", flush=True)
        context.wait_for_event("close", timeout=0)
    log.close()
    print("Brauzer yopildi, yozuvlar saqlandi:", OUT_DIR)


if __name__ == "__main__":
    main()
