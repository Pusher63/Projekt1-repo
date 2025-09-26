from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Appointment(models.Model):
    # Kategorien wie im Frontend (orange/blue/green/red/purple)
    CATEGORY_CHOICES = [
        ("orange", "Haushalt"),
        ("blue", "Ordnung"),
        ("green", "Gesundheit"),
        ("red", "Studium"),
        ("purple", "Sonstiges"),
    ]

    PRIORITY_CHOICES = [
        (1, "Niedrig"),
        (2, "Normal"),
        (3, "Wichtig"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="appointments")

    title = models.CharField(max_length=200)
    note = models.TextField(blank=True)

    start = models.DateTimeField()
    end = models.DateTimeField()

    # NEU: Persistente Kategorie & Priorität + Done
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="orange")
    priority = models.PositiveSmallIntegerField(choices=PRIORITY_CHOICES, default=2)
    done = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start"]
        indexes = [
            models.Index(fields=["user", "start"]),
            models.Index(fields=["user", "category"]),
            models.Index(fields=["user", "priority"]),
            models.Index(fields=["user", "done"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.start} – {self.end})"
