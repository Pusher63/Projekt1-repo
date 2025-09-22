from rest_framework import generics, viewsets, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.views.generic import TemplateView
from .serializers import RegisterSerializer, AppointmentSerializer
from .models import Appointment

# ---------- Frontend Pages ----------
class HomePage(TemplateView):
    template_name = "index.html"

class LoginPage(TemplateView):
    template_name = "login.html"

class RegisterPage(TemplateView):
    template_name = "register.html"

# ---------- API ----------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
    return Response({"status": "ok"})

@api_view(["GET"])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "email": u.email})

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user_id", None) == getattr(request.user, "id", None)

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Appointment.objects.filter(user=self.request.user).order_by("start")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
