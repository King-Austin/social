import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

PORT = int(os.getenv("PORT", "8055"))
HOST = os.getenv("HOST", "0.0.0.0")

# Maximum age of downloaded files before cleanup (in minutes)
CLEANUP_FILE_AGE_MINUTES = int(os.getenv("CLEANUP_FILE_AGE_MINUTES", "45"))
# Cleanup check interval (in seconds)
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "300"))

# Allowed CORS origins (comma-separated or * for public Vercel frontend)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Optional cookies file for authenticated extractions (e.g. YouTube, Instagram, etc.)
COOKIES_FILE = BASE_DIR / "cookies.txt"
