# SocialDL: Self-Hosted Cloud yt-dlp Suite

A high-performance media extraction and downloading application designed for a decoupled architecture:
- **Backend**: Self-hosted on your EC2 VPS (FastAPI, yt-dlp 2026, FFmpeg, auto-cleanup engine on port `8055`)
- **Frontend**: Serverless, ultra-fast SPA (Vite + React) ready to deploy directly to **Vercel** with zero configuration.

---

## 🏗️ Architecture Overview

```
 ┌──────────────────────────────┐          ┌──────────────────────────────────┐
 │    Vercel Serverless UI      │          │       AWS EC2 VPS Instance       │
 │   (or http://localhost:5173) │          │                                  │
 │                              │          │  FastAPI Media Engine (Port 8055)│
 │  • Media inspection form     │◄────────►│  • yt-dlp metadata extractor    │
 │  • Quality / bitrate options │   REST   │  • FFmpeg audio/video merger     │
 │  • Real-time SSE progress bar│    &     │  • Async download job manager    │
 │  • One-click direct download │   SSE    │  • 45-min disk space auto-cleaner│
 └──────────────────────────────┘          └──────────────────────────────────┘
```

---

## 🚀 Running on EC2 (Already Active)

### 1. Backend Service
- **Directory**: `/home/ubuntu/social/backend`
- **Port**: `8055` (carefully isolated from your existing apps on ports 80, 443, 5432, 8000, 8080)
- **Start command**:
  ```bash
  /home/ubuntu/social/backend/run.sh
  ```
- **Endpoints**:
  - `GET /api/health` — VPS telemetry, disk storage (GB free), FFmpeg status, yt-dlp version
  - `POST /api/info` — Extracts title, thumbnail, duration, format options without downloading
  - `POST /api/download` — Schedules background download/transcode task
  - `GET /api/tasks/{task_id}/events` — Real-time Server-Sent Events (SSE) progress stream
  - `GET /api/tasks/{task_id}/file` — Direct file download stream
  - `GET /api/cookies` & `POST /api/cookies` — Netscape cookies manager to bypass bot protections

### 2. Frontend Development Server
- **Directory**: `/home/ubuntu/social/frontend`
- **Port**: `5173`
- **Start command**:
  ```bash
  cd /home/ubuntu/social/frontend
  npm run dev -- --host 0.0.0.0 --port 5173
  ```

---

## ⚡ Deploying the Frontend to Vercel

1. Push the `/home/ubuntu/social/frontend` folder to a GitHub repository (or deploy via Vercel CLI).
2. On Vercel:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend` (or repository root if pushed separately)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. **Environment Variable (Optional)**:
   - Add `VITE_API_URL` = `http://YOUR_EC2_PUBLIC_IP:8055`
   - *Note*: If you don't set it in Vercel, users can simply click the **⚙️ Settings** icon in the app header and paste your EC2 URL. It is persisted in `localStorage`.

---

## 🛡️ VPS Storage & Process Safety
1. **Periodic Cleanup Engine**: Every 5 minutes, the background cleaner scans the downloads directory and removes completed media older than 45 minutes, ensuring your EC2 disk space never runs out.
2. **Port Isolation**: Runs on port 8055 and 5173, guaranteeing zero interference with your existing PostgreSQL (5432) or Web/API services (80, 443, 8000, 8080).
