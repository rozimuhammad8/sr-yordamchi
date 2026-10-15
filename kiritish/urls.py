from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("ommaviy/", views.index, name="ommaviy"),  # o'sha sahifa, "Ommaviy" tabi ochiq holda
    path("api/tekshir/", views.tekshir),
    path("api/ariza/<int:ariza_id>/", views.ariza),
    path("api/ariza-qidir/", views.ariza_qidir),
    path("api/zip/", views.zip_yukla),
    path("api/zip/<str:zid>/<int:n>/", views.zip_oqi),
    path("api/zip/<str:zid>/natija/", views.zip_natija),
    path("api/viloyatlar/", views.viloyatlar),
    path("api/tumanlar/<int:viloyat_id>/", views.tumanlar),
    path("api/mahallalar/<int:tuman_id>/", views.mahallalar),
    path("api/tarix/", views.tarix),
    path("api/yuborish/", views.yuborish),
]
