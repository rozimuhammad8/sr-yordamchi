from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/tekshir/", views.tekshir),
    path("api/ariza/<int:ariza_id>/", views.ariza),
    path("api/viloyatlar/", views.viloyatlar),
    path("api/tumanlar/<int:viloyat_id>/", views.tumanlar),
    path("api/mahallalar/<int:tuman_id>/", views.mahallalar),
    path("api/tarix/", views.tarix),
    path("api/yuborish/", views.yuborish),
]
