from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Appointment(models.Model):
    PRIORITY_LOW = 1
    PRIORITY_NORMAL = 2
    PRIORITY_HIGH = 3
    PRIORITY_CHOICES = (
        (PRIORITY_LOW, "Niedrig"),
        (PRIORITY_NORMAL, "Normal"),
        (PRIORITY_HIGH, "Wichtig"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="appointments")
    title = models.CharField(max_length=200)
    start = models.DateTimeField()
    end = models.DateTimeField()

    note = models.TextField(blank=True)

    done = models.BooleanField(default=False)
    color = models.CharField(max_length=20, default="orange")
    priority = models.PositiveSmallIntegerField(choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start"]

    def __str__(self):
        return f"{self.title} ({self.start} – {self.end})"
