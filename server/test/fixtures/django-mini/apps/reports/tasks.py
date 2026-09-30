from celery import shared_task

from apps.tools.phone import normalize_phone


@shared_task
def send_weekly_report():
    return normalize_phone("+1 555 0100")


@shared_task(name="reports.cleanup")
def cleanup():
    return None
