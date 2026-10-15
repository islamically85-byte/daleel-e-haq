import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.db.connection import get_connection
from app.db.init_db import initialize_database
from app.evidence.hadith_importer import import_hadith_corpus, get_hadith_status
from app.evidence.quran_importer import import_quran_corpus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("daleel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Daleel-e-Haq database and corpus...")
    initialize_database()

    # Check if Quran corpus is already populated
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM quran_verses;")
        count = cursor.fetchone()[0]

    if count < 6236:
        logger.info(f"Populating canonical Quran corpus (currently {count} verses)...")
        try:
            import_quran_corpus()
            logger.info("Quran corpus successfully loaded (6,236 verses).")
        except Exception as e:
            logger.error(f"Failed to auto-import Quran corpus: {e}")
    else:
        logger.info("Canonical Quran corpus verified (6,236 verses ready).")

    # Check and populate verified Hadith corpus (Sahih Bukhari & Sahih Muslim)
    try:
        h_stat = get_hadith_status()
        if h_stat["approved_records"] == 0:
            logger.info("Populating canonical verified Hadith corpus (Sahih al-Bukhari & Sahih Muslim)...")
            h_count = import_hadith_corpus()
            logger.info(f"Canonical Hadith corpus successfully loaded ({h_count} approved narrations).")
        else:
            logger.info(f"Canonical Hadith corpus verified ({h_stat['approved_records']} approved records ready).")
    except Exception as e:
        logger.error(f"Failed to auto-import Hadith corpus: {e}")

    yield

    logger.info("Shutting down Daleel-e-Haq backend.")


app = FastAPI(
    title="Daleel-e-Haq (دلیلِ حق) API",
    description="Evidence of Truth: Verified Quran & Hadith Research and Debate Assistant Backend",
    version="1.0.0-phase1",
    lifespan=lifespan
)

# Security Response Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "microphone=(self)"
    return response

# CORS configuration for local React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {
        "app": "Daleel-e-Haq (دلیلِ حق)",
        "meaning": "Evidence of Truth",
        "tagline": "Evidence Before Assertion",
        "developer": "Zevrako",
        "phase": 1,
        "mode": "Online AI Mode",
        "documentation": "/docs",
        "status": "active"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
