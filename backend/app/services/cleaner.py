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
