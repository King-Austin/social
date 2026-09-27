# Implementation Plan: Self-Hosted yt-dlp on EC2 + Vercel Web + Capacitor Mobile

## Status: Phases 1–3 Complete ✅ | Phases 4–7 Ready for Rollout 🚀

---

### Phase 1: EC2 Safety & Engine Deployment (Completed)
- [x] Inspected existing active processes and ports on the EC2 VPS (`80`, `443`, `5432`, `8000`, `8080`).
- [x] Confirmed zero disruption to existing running workloads (PID 3096083 on port 8000, PostgreSQL on 5432).
- [x] Assigned isolated port `8055` for backend and `5173` for frontend dev server.
- [x] Installed `ffmpeg` 7:6.1.1 and `curl-cffi` for browser TLS impersonation.
- [x] Built FastAPI + `yt-dlp` (v2026.08.19) backend with SSE progress streaming and automated 45-minute file cleaner.
- [x] Tested and verified all target platforms:
  - **YouTube**: Verified with Android/iOS fallback engine (MP4 & MP3 transcode).
  - **TikTok**: Verified with Chrome impersonation (`vt.tiktok.com` 1080p vertical video).
  - **Twitter / X**: Verified with tweet video extraction and streaming.

---

### Phase 2: Frontend Foundation (Completed)
- [x] Created `/home/ubuntu/social/frontend/` with Vite + React.
- [x] Built dark glassmorphic responsive UI with live telemetry pill, format tabs, and 1-click test chips.
- [x] Created `vercel.json` with SPA routing rules.
- [x] Built and verified production bundle (`dist/` generated in 1.93s).

---

### Phase 3: Critical Prerequisite — EC2 HTTPS / SSL Gateway
> **Why this is required:** Vercel apps run on HTTPS (`https://your-app.vercel.app`). Mobile app stores (Apple App Store / Google Play) also enforce secure traffic. If the EC2 backend is on HTTP (`http://34.244.99.37:8055`), modern browsers and mobile WebViews **block all API requests due to Mixed Content errors**.

- [ ] **Option A: Domain + Nginx Reverse Proxy (Most Recommended)**
  - [ ] Point a subdomain (e.g., `api.yourdomain.com`) via DNS A Record to `34.244.99.37`.
  - [ ] Add an Nginx server block proxying `api.yourdomain.com` to `http://127.0.0.1:8055`.
  - [ ] Run `sudo certbot --nginx -d api.yourdomain.com` for free auto-renewing SSL.
- [ ] **Option B: Cloudflare Zero-Trust Tunnel (Zero Open Ports)**
  - [ ] Run `cloudflared tunnel` on EC2 pointing `https://api.yourdomain.com` to `localhost:8055`.
  - [ ] No inbound ports needed; automatic SSL handled by Cloudflare edge.

---

### Phase 4: Vercel Web Deployment Checklist
- [ ] Initialize Git repository in the frontend directory (or monorepo):
  ```bash
  cd /home/ubuntu/social/frontend
  git init
  git add .
  git commit -m "feat: SocialDL frontend ready for Vercel and Capacitor"
  ```
- [ ] Push to GitHub / GitLab.
- [ ] Link project in Vercel Dashboard:
  - **Framework Preset**: `Vite`
  - **Root Directory**: `frontend` (or `./` if pushed as standalone repo)
  - **Build Command**: `npm run build`
  - **Output Directory**: `dist`
- [ ] Add Vercel Environment Variable:
  - `VITE_API_URL` = `https://api.yourdomain.com` (your secure EC2 API endpoint).
- [ ] Deploy and verify:
  - Check that metadata extraction, format selection, and SSE real-time download tracking work seamlessly over HTTPS.

---

### Phase 5: Capacitor Mobile App Integration (Completed & Verified ✅)

#### 1. Setup & Installation
- [x] Installed `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`.
- [x] Installed `@capacitor/haptics` for tactile vibration feedback.
- [x] Installed `@capacitor/filesystem` and `@capacitor/share` for native file saving.
- [x] Created `capacitor.config.json` with app ID `com.socialdl.app`.

#### 2. Native Haptic Feedback Mappings (`triggerHaptic`)
- [x] **Light Impact (`ImpactStyle.Light`)**: Triggered on sample chip selection and modal open/close.
- [x] **Selection Tick (`Haptics.selectionChanged`)**: Triggered when switching between Video (MP4) and Audio (MP3) format tabs.
- [x] **Medium Impact (`ImpactStyle.Medium`)**: Triggered when clicking "Fetch Media" and starting file transfer.
- [x] **Heavy Impact (`ImpactStyle.Heavy`)**: Triggered when initiating a download transcode task.
- [x] **Success Pattern (`NotificationType.Success`)**: Distinct double-vibration fired when background media download finishes.
- [x] **Error Pattern (`NotificationType.Error`)**: Distinct triple-vibration fired if extraction or network fails.
- [x] **Web Fallback**: Automatically degrades to `navigator.vibrate` when accessed via web browsers on mobile phones.

#### 3. Native File Download & Share Sheet Adapter
- [x] Auto-detects native environment via `Capacitor.isNativePlatform()`.
- [x] On mobile, downloads file blob directly into device `Directory.Cache`.
- [x] Prompts user with native OS **Share Sheet** (Save to Camera Roll / Files / WhatsApp / Google Drive).
- [x] On desktop / Vercel web, seamlessly retains standard browser `<a download>` behavior.
- [x] Verified production build (`npm run build` completed in 1.03s).

---

### Phase 6: Capacitor Live-Reload for Mobile Development
- [ ] Configure `capacitor.config.json` for instant mobile testing against local EC2 dev server:
  ```json
  {
    "appId": "com.socialdl.app",
    "appName": "SocialDL",
    "webDir": "dist",
    "server": {
      "url": "http://34.244.99.37:5173",
      "cleartext": true
    }
  }
  ```
- [ ] Run on physical device / emulator to test live code changes with zero rebuild time.

---

### Phase 8: Mobile-First iPhone Revamp
- [x] Implemented mobile-first centered viewport (`max-width: 440px`).
- [x] Integrated tactile haptics on tabs, download triggers, and format selection.
- [x] Added hierarchical mobile back button listener (modal -> tabs -> double-tap to exit).

---

### Phase 9: High-Contrast Light Theme & Accessible Orange Revamp (Completed ✅)
- [x] Shifted to clean white/light theme (`#FFFFFF` background, deep `#0F172A` text) for high visibility and elder-friendly legibility.
- [x] Normal warm orange branding (`#EA580C`) replacing neon orange.
- [x] Removed simulated phone hardware engravings (no fake notch, clock, or thick bezels).
- [x] Expanded centered canvas from 440px to **`520px`** for a more spacious, accessible feel.
- [x] Resolved layout collision and overlapping between input, download button, and sample chips.
- [x] Integrated dedicated **"Download App (APK)"** buttons in header, home banner, and Settings tab.
- [x] Integrated author credits: **Built by King-Austin** and domain **`social.nworahebuka.com.ng`**.
- [x] Verified production build (`npm run build` completed cleanly in 909ms).

---

### Phase 10: Sticky Bottom Dock, Hamburger Sidebar Drawer & URL Validation (Completed ✅)
- [x] **Sticky Bottom Navigation Panel**:
  - Made `.bottom-nav-dock` flush and sticky to the base of the viewport (`position: sticky; bottom: 0; min-height: 58px`) regardless of scroll direction.
  - Removed all curved borders (`border-radius: 0 !important`) for a crisp, seamless dock appearance.
  - Tested across varying mobile viewports (iPhone SE 375x667, compact Android 360px, modern iPhones 390px+).
- [x] **Header Clean Up & Hamburger Sidebar Drawer**:
  - Removed sparkle icon from header; preserved clean title `SocialDL` with APK badge and engine status indicator.
  - Added 3-line hamburger menu button (`Menu` icon) opening a slide-out navigation drawer.
  - Sidebar provides unified access to all tabs (`Saver`, `Downloads Library`, `Supported Apps`, `About & Credits`), APK download button, and author credits (**Built with ❤️ by King-Austin** | `social.nworahebuka.com.ng`).
  - Integrated with hardware back button listener so pressing back on Android closes the sidebar drawer first.
- [x] **Platform Button Logic (No Hardcoded URLs / No Auto-Download)**:
  - Clicking platform chips (TikTok, YouTube, X, Instagram) now selects/highlights the platform and sets contextual placeholder/focus without injecting dummy URLs or triggering automatic API requests.
  - Waits for user to paste their own video URL.
  - Automatically syncs highlighted platform pill when user pastes or types a matching URL.
- [x] **Strict Client-Side URL Validation**:
  - Validates that user input starts with `http://` or `https://` with a valid web host.
  - Validates that link belongs to supported video platforms (TikTok, YouTube, Twitter/X, Instagram) before querying the backend.
  - Provides clear, accessible error feedback on invalid or malformed links.
- [x] Production build verified (`npm run build` completed cleanly in 860ms).

---

### Phase 11: Verification & Launch Checklist
- [ ] Vercel web app loads with 0 Mixed Content errors in browser DevTools console.
- [ ] YouTube, TikTok, and Twitter (X) video links extract and download properly on Vercel.
- [ ] Capacitor Android APK builds and installs on phone.
- [ ] Mobile app prompts native download/save dialog when video is ready.
- [ ] EC2 auto-cleaner continues purging files older than 45 minutes to keep VPS disk space healthy.


