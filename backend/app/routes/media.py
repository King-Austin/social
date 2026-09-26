import os
import shutil
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, HttpUrl
import yt_dlp

from app.services.ytdlp_service import (
    extract_media_info,
    create_download_task,
    get_task,
    subscribe_to_task,
    unsubscribe_from_task,
    format_bytes
)
from app.config import DOWNLOADS_DIR, COOKIES_FILE

router = APIRouter(prefix="/api", tags=["Media"])


class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"
    is_audio: Optional[bool] = False
    audio_bitrate: Optional[int] = 192


@router.get("/health")
def health_check():
    """Health status and VPS resource telemetry."""
    # Disk space
    disk = shutil.disk_usage(DOWNLOADS_DIR)
    free_gb = disk.free / (1024 ** 3)
    total_gb = disk.total / (1024 ** 3)
    used_gb = disk.used / (1024 ** 3)
    
    # Check ffmpeg
    ffmpeg_available = shutil.which("ffmpeg") is not None
    
    # Active downloaded files count
    files_count = len(list(DOWNLOADS_DIR.glob("*")))
    
    return {
        "status": "healthy",
        "ytdlp_version": yt_dlp.version.__version__,
        "ffmpeg_installed": ffmpeg_available,
        "storage": {
            "free_gb": round(free_gb, 2),
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "percent_free": round((disk.free / disk.total) * 100, 1),
            "cached_media_files": files_count
        }
    }


@router.post("/info")
async def get_video_info(req: InfoRequest):
    """Fetches media metadata and available download options."""
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(None, extract_media_info, url)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch media info: {str(e)}")


@router.post("/download")
async def start_download(req: DownloadRequest):
    """Initiates an asynchronous download job on the EC2 VPS."""
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    
    try:
        task_id = create_download_task(
            url=url,
            format_id=req.format_id or "best",
            is_audio=req.is_audio or False,
            audio_bitrate=req.audio_bitrate or 192
        )
        return {
            "success": True,
            "task_id": task_id,
            "status": "queued",
            "message": "Task created successfully."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to schedule download: {str(e)}")


@router.get("/tasks/{task_id}")
def get_task_status(task_id: str):
    """Retrieves current download progress & status."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or expired.")
    
    # Do not leak internal file paths in JSON
    safe_task = {k: v for k, v in task.items() if k != 'filepath'}
    return {"success": True, "task": safe_task}


@router.get("/tasks/{task_id}/events")
async def stream_task_events(task_id: str):
    """Real-time SSE event stream for download progress."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    
    queue = subscribe_to_task(task_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task listener could not be registered.")

    async def event_generator():
        try:
            # Yield initial state
            safe_task = {k: v for k, v in task.items() if k != 'filepath'}
            yield f"data: {json.dumps(safe_task)}\n\n"
            
            # Stream subsequent updates
            while True:
                # If already completed or failed, we can terminate stream after sending
                if task.get('status') in ('completed', 'failed'):
                    break
                
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20.0)
                    safe_data = {k: v for k, v in data.items() if k != 'filepath'}
                    yield f"data: {json.dumps(safe_data)}\n\n"
                    if safe_data.get('status') in ('completed', 'failed'):
                        break
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield ": ping\n\n"
        finally:
            unsubscribe_from_task(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.api_route("/tasks/{task_id}/file", methods=["GET", "HEAD"])
def download_completed_file(task_id: str):
    """Serves the completed file from EC2 storage with resume/Range support."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or expired.")
    
    if task.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Task is in status: {task.get('status')}")
    
    filepath = task.get("filepath")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Downloaded media file has been removed or cleaned up.")
    
    filename = task.get("filename") or os.path.basename(filepath)
    # Sanitize download name: remove leading task UUID
    clean_filename = filename
    if "_" in filename:
        clean_filename = filename.split("_", 1)[1]

    media_type = "audio/mpeg" if filename.endswith(".mp3") else ("audio/mp4" if filename.endswith(".m4a") else "video/mp4")

    return FileResponse(
        path=filepath,
        filename=clean_filename,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'attachment; filename="{clean_filename}"'
        }
    )


class CookiesPayload(BaseModel):
    cookies_content: str


@router.get("/cookies")
def get_cookies_status():
    """Checks whether custom yt-dlp cookies (for YouTube/IG bot protection bypass) are active."""
    exists = COOKIES_FILE.exists()
    size = COOKIES_FILE.stat().st_size if exists else 0
    return {
        "configured": exists and size > 0,
        "size_bytes": size,
        "path": str(COOKIES_FILE) if exists else None
    }


@router.post("/cookies")
def set_cookies(payload: CookiesPayload):
    """Saves Netscape-format cookies.txt to unlock YouTube, Instagram, etc."""
    content = payload.cookies_content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Cookies content cannot be empty.")
    
    COOKIES_FILE.write_text(content, encoding="utf-8")
    return {"success": True, "message": "Cookies saved successfully.", "size_bytes": len(content)}


@router.delete("/cookies")
def delete_cookies():
    """Removes configured cookies file."""
    if COOKIES_FILE.exists():
        COOKIES_FILE.unlink(missing_ok=True)
    return {"success": True, "message": "Cookies deleted."}
