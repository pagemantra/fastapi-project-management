from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Employee Work Tracking System"
    DEBUG: bool = True

    # MongoDB
    MONGODB_URL: str = "mongodb+srv://koyalamudikavyasri_db_user:projectmangement3@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement"
    DATABASE_NAME: str = "employee_tracking"

    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
