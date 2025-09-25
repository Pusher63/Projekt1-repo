from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Appointment

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    class Meta:
        model = User
        fields = ("id", "username", "email", "password")
    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )

class AppointmentSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Appointment
        fields = (
            "id", "user",
            "title", "start", "end",
            "note",
            "done", "color", "priority",
            "created_at", "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")
