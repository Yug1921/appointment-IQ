from supabase import create_client
from app.config import get_settings

_supabase_client = None
_supabase_service_client = None


def get_supabase():
    """Get the default Supabase client (anon key)."""
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase_client


def get_service_supabase():
    """Get the Supabase client with service role key (for admin operations)."""
    global _supabase_service_client
    if _supabase_service_client is None:
        settings = get_settings()
        _supabase_service_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _supabase_service_client
