from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    HomePage, LoginPage, RegisterPage,
    health, me, RegisterView, AppointmentViewSet
)
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

router = DefaultRouter()
router.register(r"appointments", AppointmentViewSet, basename="appointment")

urlpatterns = [
    # Frontend
    path("", HomePage.as_view(), name="home"),
    path("login/", LoginPage.as_view(), name="login"),
    path("register/", RegisterPage.as_view(), name="register_page"),

    # Admin
    path("admin/", admin.site.urls),

    # API
    path("api/health/", health),
    path("api/me/", me),
    path("api/auth/register/", RegisterView.as_view(), name="api_register"),
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include(router.urls)),
]
