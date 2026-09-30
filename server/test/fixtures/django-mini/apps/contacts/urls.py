from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"contacts", views.ContactViewSet, basename="contact")

urlpatterns = [
    path("", views.contact_list, name="contact-list"),
    path("lookup/", views.contact_lookup, name="contact-lookup"),
    path("api/", include(router.urls)),
]
