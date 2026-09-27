import os
import time
import asyncio
import logging
from pathlib import Path
from app.config import DOWNLOADS_DIR, CLEANUP_FILE_AGE_MINUTES, CLEANUP_INTERVAL_SECONDS

logger = logging.getLogger("cleaner")

def cleanup_old_files():
    """Removes downloaded files older than CLEANUP_FILE_AGE_MINUTES."""
    try:
        now = time.time()
        max_age_seconds = CLEANUP_FILE_AGE_MINUTES * 60
        removed_count = 0
        freed_bytes = 0

        for file_path in DOWNLOADS_DIR.glob("*"):
            if file_path.is_file():
                try:
                    stat = file_path.stat()
                    file_age = now - stat.st_mtime
                    if file_age > max_age_seconds:
                        freed_bytes += stat.st_size
                        file_path.unlink(missing_ok=True)
                        removed_count += 1
                except Exception as file_err:
                    logger.warning(f"Failed to check/delete {file_path}: {file_err}")

        if removed_count > 0:
            logger.info(f"Cleaned up {removed_count} old file(s), freed {freed_bytes / (1024 * 1024):.2f} MB")

        # Also prune expired in-memory task metadata to keep RAM usage permanently flat
        try:
            from app.services.ytdlp_service import TASKS, TASK_LISTENERS
            expired_task_ids = [
                tid for tid, tdata in list(TASKS.items())
                if now - tdata.get("updated_at", tdata.get("created_at", now)) > max_age_seconds
            ]
            for tid in expired_task_ids:
                TASKS.pop(tid, None)
                TASK_LISTENERS.pop(tid, None)
            if expired_task_ids:
                logger.info(f"Pruned {len(expired_task_ids)} expired in-memory task record(s)")
        except Exception as task_err:
            logger.warning(f"Notice pruning task memory: {task_err}")
    except Exception as e:
        logger.error(f"Error during cleanup cycle: {e}")

async def start_periodic_cleanup():
    """Background task running continuously."""
    logger.info("Starting background download cleanup task...")
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            cleanup_old_files()
        except asyncio.CancelledError:
            logger.info("Cleanup task cancelled.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in cleanup loop: {e}")
