from rest_framework import viewsets, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.views.generic import TemplateView
from .serializers import RegisterSerializer, AppointmentSerializer
from .models import Appointment
from django.contrib.auth import get_user_model

# ---------- Frontend Pages ----------
class HomePage(TemplateView):
    template_name = "index.html"

class LoginPage(TemplateView):
    template_name = "login.html"

class RegisterPage(TemplateView):
    template_name = "register.html"

# ---------- Health / Auth Helper ----------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
    return Response({"status": "ok"})

@api_view(["GET"])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "email": getattr(u, "email", "")})

from rest_framework import generics

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

# ---------- Permissions ----------
class IsOwner(permissions.BasePermission):
    """
    Erlaubt den Zugriff nur auf Objekte des eingeloggten Users.
    """
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user_id", None) == getattr(request.user, "id", None)

# ---------- Appointments ----------
class AppointmentViewSet(viewsets.ModelViewSet):
    """
    /api/appointments/      GET, POST
    /api/appointments/{id}/ GET, PATCH, DELETE
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    lookup_field = "pk"

    def get_queryset(self):
        # Nur eigene Einträge
        return Appointment.objects.filter(user=self.request.user).order_by("start")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # WICHTIG: explizite destroy-Implementierung mit Owner-Check
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()                 # holt nur aus get_queryset() -> bereits auf User gefiltert
        self.check_object_permissions(request, instance)
        instance.delete()
        return Response(status=204)
