from django.contrib import admin
from django.urls import include, path

from apps.history.views import HistoryListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("apps.contacts.urls")),
    path("api/history/", HistoryListView.as_view(), name="history"),
]
