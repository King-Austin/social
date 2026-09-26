import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import ALLOWED_ORIGINS, PORT
from app.routes.media import router as media_router
from app.services.cleaner import start_periodic_cleanup

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: trigger periodic cleanup task
    cleanup_task = asyncio.create_task(start_periodic_cleanup())
    yield
    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="yt-dlp Self-Hosted Cloud API",
    description="High-performance backend API powering seamless video and audio extraction and downloading.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - enabling seamless connection from Vercel deployments and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in ALLOWED_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Range", "Accept-Ranges"]
)

app.include_router(media_router)

@app.get("/")
def root():
    return {
        "service": "Self-Hosted yt-dlp Backend API",
        "status": "operational",
        "docs_url": "/docs",
        "api_endpoints": {
            "health": "GET /api/health",
            "media_info": "POST /api/info",
            "start_download": "POST /api/download",
            "task_status": "GET /api/tasks/{task_id}",
            "task_events_sse": "GET /api/tasks/{task_id}/events",
            "download_file": "GET /api/tasks/{task_id}/file"
        }
    }
