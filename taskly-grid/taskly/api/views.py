from datetime import datetime, timedelta
from django.views.generic import TemplateView
from django.utils.timezone import make_aware, get_current_timezone

from rest_framework import viewsets, permissions, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Appointment
from .serializers import AppointmentSerializer, RegisterSerializer


# ---------- Seiten (Templates) ----------
class HomePage(TemplateView):
    template_name = "index.html"

class LoginPage(TemplateView):
    template_name = "login.html"

class RegisterPage(TemplateView):
    template_name = "register.html"


# ---------- API-Helper ----------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(_request):
    return Response({"status": "ok"})

@api_view(["GET"])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.get_username(), "email": u.email})


# ---------- Registrierung per API ----------
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


# ---------- Permissions ----------
class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user_id", None) == request.user.id


# ---------- Appointment CRUD ----------
class AppointmentViewSet(viewsets.ModelViewSet):
    """
    /api/appointments/
      GET   ?date=YYYY-MM-DD&category=orange&priority=3&done=true
      POST  { title, note, start, end, category, priority, done }
      PATCH /{id}/
      DELETE/{id}/
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        qs = Appointment.objects.filter(user=self.request.user)

        # Tag-Filter (überlappend mit start/end)
        date_str = self.request.query_params.get("date")
        if date_str:
            tz = get_current_timezone()
            start_day = make_aware(datetime.strptime(date_str, "%Y-%m-%d"), tz)
            end_day = start_day + timedelta(days=1)
            qs = qs.filter(start__lt=end_day, end__gte=start_day)

        # Kategorie (category oder color)
        category = self.request.query_params.get("category") or self.request.query_params.get("color")
        if category:
            qs = qs.filter(category=category)

        # Priorität
        prio = self.request.query_params.get("priority")
        if prio in {"1", "2", "3"}:
            qs = qs.filter(priority=int(prio))

        # Done
        done = self.request.query_params.get("done")
        if done in {"true", "false"}:
            qs = qs.filter(done=(done == "true"))

        return qs.order_by("start")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
