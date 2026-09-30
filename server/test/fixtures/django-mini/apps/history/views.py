from rest_framework import generics
from rest_framework.response import Response


class HistoryListView(generics.ListAPIView):
    def get(self, request):
        return Response([])
