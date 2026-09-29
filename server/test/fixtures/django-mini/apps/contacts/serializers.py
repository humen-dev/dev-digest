from rest_framework import serializers

from apps.tools.phone import normalize_phone

from .models import Contact


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"

    def validate_phone(self, value):
        return normalize_phone(value)
