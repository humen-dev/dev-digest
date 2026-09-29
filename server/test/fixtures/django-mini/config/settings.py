from celery.schedules import crontab

ROOT_URLCONF = "config.urls"

CELERY_BEAT_SCHEDULE = {
    "weekly-report": {
        "task": "apps.reports.tasks.send_weekly_report",
        "schedule": crontab(minute=0, hour=7, day_of_week=1),
    },
    "cleanup": {
        "task": "apps.reports.tasks.cleanup",
        "schedule": 300,
    },
}
