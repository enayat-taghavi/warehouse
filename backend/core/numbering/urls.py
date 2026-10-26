from django.urls import path

from .views import IssuedListView, SeriesDetailView, SeriesListView

urlpatterns = [
    path('<int:company_id>/series/', SeriesListView.as_view(), name='numbering-series'),
    path('<int:company_id>/series/<str:series_key>/', SeriesDetailView.as_view(), name='numbering-series-detail'),
    path('<int:company_id>/issued/', IssuedListView.as_view(), name='numbering-issued'),
]
