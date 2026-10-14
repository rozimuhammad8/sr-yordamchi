"""SR yordamchi — sr.ihma.uz ga dalolatnomalarni kiritish uchun lokal Django ilova (port 5300)."""
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# yangi kompyuterda .secret_key bo'lmasa, birinchi ishga tushishda yaratiladi
_key_file = BASE_DIR / ".secret_key"
if not _key_file.exists():
    _key_file.write_text(secrets.token_urlsafe(40))
SECRET_KEY = _key_file.read_text().strip()
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "kiritish",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sr_yordamchi.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    },
]

WSGI_APPLICATION = "sr_yordamchi.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# sr.ihma.uz 1 MB gacha PDF qabul qiladi; biz biroz zaxira bilan qabul qilib, o'zimiz tekshiramiz
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
