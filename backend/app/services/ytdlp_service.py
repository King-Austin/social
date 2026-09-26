import os
import uuid
import time
import asyncio
import logging
from typing import Dict, Any, Optional, List
import yt_dlp
from app.config import DOWNLOADS_DIR, COOKIES_FILE

try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    CHROME_IMPERSONATE = ImpersonateTarget.from_str('chrome')
except Exception:
    CHROME_IMPERSONATE = None

logger = logging.getLogger("ytdlp_service")

# Global in-memory storage for active download tasks
# In production, this can be Redis or SQLite, but for this self-hosted VPS instance, in-memory with TTL is ultra-fast and lightweight.
TASKS: Dict[str, Dict[str, Any]] = {}
TASK_LISTENERS: Dict[str, List[asyncio.Queue]] = {}


def format_bytes(size: Optional[int]) -> str:
    if not size:
        return "Unknown size"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "0:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def extract_media_info(url: str) -> Dict[str, Any]:
    """Extracts metadata and filtered format options from the URL."""
    ydl_opts = {
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios']
            }
        }
    }
    if CHROME_IMPERSONATE:
        ydl_opts['impersonate'] = CHROME_IMPERSONATE
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0:
        ydl_opts['cookiefile'] = str(COOKIES_FILE)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info:
            raise ValueError("Unable to extract info from the provided URL.")

        raw_formats = info.get('formats', [])

        # Process video formats with distinct resolutions
        seen_res = set()
        video_options = []
        
        # Sort formats by resolution / tbr descending
        sorted_formats = sorted(
            [f for f in raw_formats if f.get('vcodec') != 'none'],
            key=lambda x: (x.get('height') or 0, x.get('tbr') or 0),
            reverse=True
        )

        for f in sorted_formats:
            height = f.get('height')
            if not height:
                continue
            res_label = f"{height}p"
            fps = f.get('fps')
            if fps and fps > 30:
                res_label += f"{fps}"
            
            # Keep only the best format per resolution
            if height not in seen_res:
                seen_res.add(height)
                filesize = f.get('filesize') or f.get('filesize_approx')
                video_options.append({
                    'format_id': f['format_id'],
                    'resolution': f"{height}p",
                    'height': height,
                    'ext': 'mp4', # standard container we merge into
                    'fps': fps,
                    'filesize': filesize,
                    'filesize_formatted': format_bytes(filesize),
                    'vcodec': f.get('vcodec', 'unknown'),
                    'acodec': f.get('acodec', 'none')
                })

        # Add best generic video option if none found
        if not video_options:
            video_options.append({
                'format_id': 'best',
                'resolution': 'Best Available',
                'height': 0,
                'ext': 'mp4',
                'filesize': None,
                'filesize_formatted': 'Best quality'
            })

        # Standard audio options
        audio_options = [
            {'format_id': 'audio_320', 'label': 'MP3 - 320 kbps (Ultra High)', 'ext': 'mp3', 'bitrate': 320},
            {'format_id': 'audio_192', 'label': 'MP3 - 192 kbps (High Quality)', 'ext': 'mp3', 'bitrate': 192},
            {'format_id': 'audio_128', 'label': 'MP3 - 128 kbps (Standard)', 'ext': 'mp3', 'bitrate': 128},
            {'format_id': 'audio_m4a', 'label': 'M4A (Original AAC Audio)', 'ext': 'm4a', 'bitrate': 0},
        ]

        return {
            'id': info.get('id'),
            'title': info.get('title', 'Unknown Title'),
            'description': (info.get('description') or '')[:300],
            'thumbnail': info.get('thumbnail') or (info.get('thumbnails', [{}])[-1].get('url') if info.get('thumbnails') else None),
            'duration': info.get('duration'),
            'duration_formatted': format_duration(info.get('duration')),
            'channel': info.get('uploader') or info.get('channel') or info.get('creator') or 'Unknown Creator',
            'channel_url': info.get('uploader_url') or info.get('channel_url'),
            'platform': info.get('extractor_key') or info.get('extractor', 'web'),
            'webpage_url': info.get('webpage_url', url),
            'video_formats': video_options[:8], # top 8 resolutions
            'audio_formats': audio_options,
        }


def notify_task_listeners(task_id: str, data: Dict[str, Any]):
    """Broadcasts event updates to any active SSE subscribers for this task."""
    queues = TASK_LISTENERS.get(task_id, [])
    for q in queues:
        try:
            q.put_nowait(data)
        except Exception:
            pass


def create_download_task(url: str, format_id: str, is_audio: bool, audio_bitrate: Optional[int] = 192) -> str:
    """Initializes a new download task and runs it in the background."""
    task_id = str(uuid.uuid4())
    
    TASKS[task_id] = {
        'id': task_id,
        'url': url,
        'format_id': format_id,
        'is_audio': is_audio,
        'status': 'queued',
        'progress': 0.0,
        'speed': '0 B/s',
        'eta': 'Calculating...',
        'filename': None,
        'filepath': None,
        'filesize': 0,
        'filesize_formatted': '0 B',
        'error': None,
        'created_at': time.time(),
        'updated_at': time.time()
    }
    
    TASK_LISTENERS[task_id] = []
    
    # Run the worker asynchronously
    asyncio.create_task(_run_download_worker(task_id, url, format_id, is_audio, audio_bitrate))
    return task_id


async def _run_download_worker(task_id: str, url: str, format_id: str, is_audio: bool, audio_bitrate: Optional[int]):
    loop = asyncio.get_running_loop()
    
    def progress_hook(d):
        task = TASKS.get(task_id)
        if not task:
            return
        
        status = d.get('status')
        if status == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            speed = d.get('speed')
            eta = d.get('eta')
            
            percent = (downloaded / total * 100) if total > 0 else 0.0
            task['status'] = 'downloading'
            task['progress'] = round(min(percent, 99.9), 1)
            task['speed'] = f"{format_bytes(int(speed))}/s" if speed else "Calculating..."
            task['eta'] = f"{eta}s" if eta else "..."
            task['filesize'] = total
            task['filesize_formatted'] = format_bytes(total)
            task['updated_at'] = time.time()
            
            loop.call_soon_threadsafe(notify_task_listeners, task_id, dict(task))
            
        elif status == 'finished':
            task['status'] = 'processing'
            task['progress'] = 99.9
            task['speed'] = 'Converting / Merging...'
            task['eta'] = 'Almost done'
            task['updated_at'] = time.time()
            loop.call_soon_threadsafe(notify_task_listeners, task_id, dict(task))

    def do_download():
        task = TASKS[task_id]
        out_template = str(DOWNLOADS_DIR / f"{task_id}_%(title).100s.%(ext)s")
        
        ydl_opts: Dict[str, Any] = {
            'outtmpl': out_template,
            'progress_hooks': [progress_hook],
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'restrictfilenames': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios']
                }
            }
        }
        if CHROME_IMPERSONATE:
            ydl_opts['impersonate'] = CHROME_IMPERSONATE

        if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0:
            ydl_opts['cookiefile'] = str(COOKIES_FILE)

        if is_audio:
            if format_id == 'audio_m4a':
                ydl_opts.update({
                    'format': 'bestaudio[ext=m4a]/bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'm4a',
                    }]
                })
            else:
                kbps = str(audio_bitrate or 192)
                ydl_opts.update({
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': kbps,
                    }]
                })
        else:
            # Video format: merge with best audio into MP4 container
            if format_id and format_id != 'best':
                ydl_opts['format'] = f"{format_id}+bestaudio/bestvideo+bestaudio/best"
            else:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
            
            ydl_opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            # Find the actual generated file on disk
            final_filename = ydl.prepare_filename(info)
            # In case postprocessors changed extension (e.g. to mp3 or mp4)
            expected_ext = 'mp3' if (is_audio and format_id != 'audio_m4a') else ('m4a' if (is_audio and format_id == 'audio_m4a') else 'mp4')
            base, _ = os.path.splitext(final_filename)
            candidate_files = list(DOWNLOADS_DIR.glob(f"{task_id}*"))
            
            final_path = None
            if candidate_files:
                # Pick the newest or matched extension
                for f in candidate_files:
                    if f.suffix.endswith(expected_ext):
                        final_path = str(f)
                        break
                if not final_path:
                    final_path = str(candidate_files[0])
            else:
                final_path = f"{base}.{expected_ext}"

            return final_path, info.get('title', 'media')

    try:
        task = TASKS[task_id]
        task['status'] = 'downloading'
        notify_task_listeners(task_id, dict(task))
        
        # Execute blocking yt-dlp in default executor thread
        final_path, title = await loop.run_in_executor(None, do_download)
        
        if os.path.exists(final_path):
            file_stat = os.stat(final_path)
            task['status'] = 'completed'
            task['progress'] = 100.0
            task['filepath'] = final_path
            task['filename'] = os.path.basename(final_path)
            task['filesize'] = file_stat.st_size
            task['filesize_formatted'] = format_bytes(file_stat.st_size)
            task['download_url'] = f"/api/tasks/{task_id}/file"
            task['speed'] = 'Done'
            task['eta'] = 'Completed'
            task['title'] = title
        else:
            raise FileNotFoundError(f"Resulting file not found at {final_path}")

    except Exception as e:
        logger.exception(f"Download failed for task {task_id}: {e}")
        task = TASKS[task_id]
        task['status'] = 'failed'
        task['error'] = str(e)
    finally:
        task['updated_at'] = time.time()
        notify_task_listeners(task_id, dict(task))


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    return TASKS.get(task_id)


def subscribe_to_task(task_id: str) -> Optional[asyncio.Queue]:
    if task_id not in TASKS:
        return None
    q = asyncio.Queue()
    TASK_LISTENERS.setdefault(task_id, []).append(q)
    return q


def unsubscribe_from_task(task_id: str, q: asyncio.Queue):
    if task_id in TASK_LISTENERS and q in TASK_LISTENERS[task_id]:
        TASK_LISTENERS[task_id].remove(q)
