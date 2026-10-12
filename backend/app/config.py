import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    DATABASE_PATH: str = "data/local/daleel.db"
    CORPUS_DIR: str = "data/corpus"
    REQUEST_TIMEOUT_SECONDS: int = 45

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def absolute_db_path(self) -> str:
        if os.path.isabs(self.DATABASE_PATH):
            return self.DATABASE_PATH
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(root_dir, self.DATABASE_PATH)

    @property
    def absolute_corpus_dir(self) -> str:
        if os.path.isabs(self.CORPUS_DIR):
            return self.CORPUS_DIR
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(root_dir, self.CORPUS_DIR)


settings = Settings()
