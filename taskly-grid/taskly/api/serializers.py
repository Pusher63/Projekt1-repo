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
    # Alias: akzeptiere "color" vom Frontend als "category"
    color = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Appointment
        fields = [
            "id",
            "title",
            "note",
            "start",
            "end",
            "category",
            "priority",
            "done",
            "created_at",
            "updated_at",
            "color",  # write-only alias
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start", getattr(self.instance, "start", None))
        end = attrs.get("end", getattr(self.instance, "end", None))
        if start and end and end < start:
            raise serializers.ValidationError("Ende muss nach Start liegen.")
        return attrs

    def _merge_color_alias(self, attrs):
        color = attrs.pop("color", None)
        if color and not attrs.get("category"):
            attrs["category"] = color
        return attrs

    def create(self, validated_data):
        return super().create(self._merge_color_alias(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._merge_color_alias(validated_data))
