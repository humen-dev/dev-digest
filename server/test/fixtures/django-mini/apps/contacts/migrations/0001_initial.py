from django.db import migrations

from apps.tools.phone import normalize_phone


def forwards(apps, schema_editor):
    normalize_phone("")


class Migration(migrations.Migration):
    dependencies = []
    operations = [migrations.RunPython(forwards)]
