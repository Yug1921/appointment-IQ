from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_key: str
    openrouter_api_key: str
    resend_api_key: str
    frontend_url: str = "http://localhost:3000"
    app_name: str = "AppointmentIQ"
    slot_duration_default: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings():
    return Settings()
