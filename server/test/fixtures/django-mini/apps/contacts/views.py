from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.tools import phone

from .models import Contact
from .serializers import ContactSerializer


def contact_list(request):
    return render(request, "contacts/list.html", {"contacts": Contact.objects.all()})


@api_view(["GET", "POST"])
def contact_lookup(request):
    return Response({"phone": phone.normalize_phone(request.GET.get("q"))})


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer

    @action(detail=False, methods=["post"], url_path="import_csv")
    def import_csv(self, request):
        rows = [phone.normalize_phone(r) for r in request.data.get("phones", [])]
        return Response({"imported": len(rows)})
