from django.db import models


class Yuborish(models.Model):
    """sr.ihma.uz ga yuborilgan (yoki yuborishda xato bergan) har bir murojaat."""

    YUBORILDI = "yuborildi"
    XATO = "xato"
    HOLATLAR = [(YUBORILDI, "Yuborildi"), (XATO, "Xato")]

    yaratilgan = models.DateTimeField(auto_now_add=True)
    ariza_id = models.BigIntegerField()
    xonadon_id = models.BigIntegerField()
    fish = models.CharField("Arizachi", max_length=200)
    pinfl = models.CharField(max_length=14, blank=True)
    eski_manzil = models.CharField(max_length=300)
    yangi_manzil = models.CharField(max_length=300)
    yangi_mahalla_id = models.BigIntegerField()
    sabab = models.CharField(max_length=100)
    xabar_beruvchi = models.CharField(max_length=200)
    telefon = models.CharField(max_length=30)
    murojaat_sanasi = models.DateField()
    izoh = models.TextField(blank=True)
    pdf = models.FileField(upload_to="dalolatnomalar/%Y/%m/")
    holat = models.CharField(max_length=20, choices=HOLATLAR)
    ozgartirish_id = models.BigIntegerField("sr.ihma.uz dagi o'zgartirish ID", null=True, blank=True)
    xato = models.TextField(blank=True)

    class Meta:
        ordering = ["-yaratilgan"]
        verbose_name = "Yuborish"
        verbose_name_plural = "Yuborishlar"

    def __str__(self):
        return f"{self.fish}: {self.eski_manzil} -> {self.yangi_manzil} ({self.holat})"
