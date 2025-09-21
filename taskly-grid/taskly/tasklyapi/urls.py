from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from api.views import ping

router = DefaultRouter()
# router.register(... )  # falls du ViewSets hast

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/ping/", ping),
    path("api/", include(router.urls)),
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
]
