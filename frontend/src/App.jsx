import React, { useState, useEffect, useRef } from 'react'
import {
  Download,
  Video,
  Music,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Play,
  X,
  Share2,
  Folder,
  LayoutGrid,
  Trash2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Sliders,
  Check,
  Smartphone,
  ExternalLink,
  ShieldCheck
} from 'lucide-react'

import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Haptic feedback helper
export const triggerHaptic = async (type = 'light') => {
  try {
    if (Capacitor.isNativePlatform()) {
      if (type === 'light') await Haptics.impact({ style: ImpactStyle.Light })
      else if (type === 'medium') await Haptics.impact({ style: ImpactStyle.Medium })
      else if (type === 'heavy') await Haptics.impact({ style: ImpactStyle.Heavy })
      else if (type === 'selection') await Haptics.selectionChanged()
      else if (type === 'success') await Haptics.notification({ type: NotificationType.Success })
      else if (type === 'error') await Haptics.notification({ type: NotificationType.Error })
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'light') navigator.vibrate(12)
      else if (type === 'medium') navigator.vibrate(25)
      else if (type === 'heavy') navigator.vibrate(40)
      else if (type === 'selection') navigator.vibrate(10)
      else if (type === 'success') navigator.vibrate([15, 40, 20])
      else if (type === 'error') navigator.vibrate([35, 30, 35])
    }
  } catch {
    // Non-critical fallback
  }
}

// 1-Click Platform Test Samples
const SAMPLES = [
  {
    name: 'TikTok',
    url: 'https://vt.tiktok.com/ZSb28AUs8/',
    platform: 'TikTok'
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'YouTube'
  },
  {
    name: 'Twitter (X)',
    url: 'https://x.com/LisPower1/status/1001551623938805763',
    platform: 'Twitter / X'
  },
  {
    name: 'SoundCloud',
    url: 'https://soundcloud.com/octobersveryown/drake-back-to-back-freestyle',
    platform: 'SoundCloud'
  }
]

// Default seed history for instant legibility
const INITIAL_DEMO_HISTORY = [
  {
    id: 'demo_1',
    title: 'Viral Travel Reel - Cinematic Kyoto Mountains',
    thumbnail: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=300&q=80',
    platform: 'Instagram',
    duration: '0:32',
    filesize: '14.5 MB',
    ext: 'mp4',
    download_url: '',
    timestamp: Date.now() - 3600000
  },
  {
    id: 'demo_2',
    title: 'Ambient Chill Lofi Beats - Rain in Tokyo',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80',
    platform: 'SoundCloud',
    duration: '3:45',
    filesize: '8.1 MB',
    ext: 'mp3',
    download_url: '',
    timestamp: Date.now() - 7200000
  }
]

// APK Download link (Customizable or default to domain APK path)
const APK_DOWNLOAD_URL = 'https://social.nworahebuka.com.ng/SocialDL.apk'

export default function App() {
  // Navigation State: 'saver' | 'library' | 'apps' | 'settings'
  const [activeNav, setActiveNav] = useState('saver')

  // Search & Download States
  const [url, setUrl] = useState('')
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [mediaInfo, setMediaInfo] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('video') // 'video' | 'audio'

  // Download Job tracking
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [jobState, setJobState] = useState(null)
  const eventSourceRef = useRef(null)

  // System & Health Telemetry
  const [health, setHealth] = useState(null)
  const [cookiesInfo, setCookiesInfo] = useState(null)
  const [customBackendUrl, setCustomBackendUrl] = useState(
    () => localStorage.getItem('socialdl_backend_url') || ''
  )
  const [cookiesInput, setCookiesInput] = useState('')
  const [savingCookies, setSavingCookies] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [downloadingToDevice, setDownloadingToDevice] = useState(false)

  // Downloaded Library History
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('socialdl_history')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Failed to parse history:', e)
    }
    return INITIAL_DEMO_HISTORY
  })
  const [libraryFilter, setLibraryFilter] = useState('all') // 'all' | 'video' | 'audio'

  // Mobile Hardware Back Button
  const [backPressedOnce, setBackPressedOnce] = useState(false)
  const [showExitToast, setShowExitToast] = useState(false)
  const backPressTimerRef = useRef(null)

  // State ref for hardware back button handler
  const stateRef = useRef({ activeNav, mediaInfo, jobState, backPressedOnce })
  useEffect(() => {
    stateRef.current = { activeNav, mediaInfo, jobState, backPressedOnce }
  }, [activeNav, mediaInfo, jobState, backPressedOnce])

  // Save history helper
  const saveToHistory = (item) => {
    setHistory((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id && p.title !== item.title)
      const updated = [item, ...filtered].slice(0, 30)
      try {
        localStorage.setItem('socialdl_history', JSON.stringify(updated))
      } catch (err) {
        console.warn('Could not save history to localStorage', err)
      }
      return updated
    })
  }

  // Clear history
  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear your download history?')) {
      triggerHaptic('medium')
      setHistory([])
      localStorage.removeItem('socialdl_history')
    }
  }

  // Mobile Hardware Back Button Listener
  useEffect(() => {
    let backListener = null

    const setupBackButton = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          backListener = await CapApp.addListener('backButton', async () => {
            const { activeNav: curNav, mediaInfo: hasMedia, backPressedOnce: pressedOnce } = stateRef.current

            // 1. If inside Library, Apps, or Settings, return to Saver Home
            if (curNav !== 'saver') {
              await triggerHaptic('light')
              setActiveNav('saver')
              return
            }

            // 2. If on Saver screen with media card open, close card back to clean input
            if (hasMedia) {
              await triggerHaptic('light')
              setMediaInfo(null)
              return
            }

            // 3. If on clean Saver screen, require double back tap within 2s to exit
            if (pressedOnce) {
              await triggerHaptic('medium')
              CapApp.exitApp()
            } else {
              await triggerHaptic('light')
              setBackPressedOnce(true)
              setShowExitToast(true)

              if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current)
              backPressTimerRef.current = setTimeout(() => {
                setBackPressedOnce(false)
                setShowExitToast(false)
              }, 2000)
            }
          })
        }
      } catch (err) {
        console.warn('Hardware back listener notice:', err)
      }
    }

    setupBackButton()

    return () => {
      if (backListener) backListener.remove()
      if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current)
    }
  }, [])

  // Resolve Base API URL
  const getApiUrl = () => {
    if (customBackendUrl.trim()) {
      return customBackendUrl.trim().replace(/\/+$/, '')
    }
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    }
    return ''
  }

  // Native Mobile Download & Share Handler
  const handleNativeDownloadOrShare = async (downloadUrl, filename, title) => {
    await triggerHaptic('medium')
    try {
      setDownloadingToDevice(true)
      const fullUrl = `${getApiUrl()}${downloadUrl}`
      const response = await fetch(fullUrl)
      if (!response.ok) throw new Error('File download from server failed.')
      const blob = await response.blob()

      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        try {
          const base64data = reader.result.split(',')[1]
          const cleanName = filename ? filename.replace(/^[a-f0-9-]+_/, '') : `SocialDL_${Date.now()}.mp4`

          const savedFile = await Filesystem.writeFile({
            path: cleanName,
            data: base64data,
            directory: Directory.Cache
          })

          await triggerHaptic('success')
          await Share.share({
            title: title || 'SocialDL Media',
            text: 'Downloaded with SocialDL',
            url: savedFile.uri,
            dialogTitle: 'Save or Share Video'
          })
        } catch (shareErr) {
          console.error('File share error:', shareErr)
          await triggerHaptic('error')
        } finally {
          setDownloadingToDevice(false)
        }
      }
    } catch (err) {
      setDownloadingToDevice(false)
      await triggerHaptic('error')
      alert(`Could not save file to mobile device: ${err.message}`)
    }
  }

  // Fetch Telemetry Info
  const fetchTelemetry = async () => {
    try {
      const baseUrl = getApiUrl()
      const [healthRes, cookiesRes] = await Promise.all([
        fetch(`${baseUrl}/api/health`).then((r) => r.json()).catch(() => null),
        fetch(`${baseUrl}/api/cookies`).then((r) => r.json()).catch(() => null)
      ])
      if (healthRes && healthRes.status === 'healthy') {
        setHealth(healthRes)
      }
      if (cookiesRes) {
        setCookiesInfo(cookiesRes)
      }
    } catch {
      // Background silence
    }
  }

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(fetchTelemetry, 25000)
    return () => clearInterval(interval)
  }, [customBackendUrl])

  // 1-Tap Paste from Clipboard
  const handlePasteFromClipboard = async () => {
    await triggerHaptic('light')
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text && text.trim()) {
          setUrl(text.trim())
          await triggerHaptic('success')
          handleInspectUrl(text.trim())
          return
        }
      }
    } catch (e) {
      console.warn('Clipboard read notice:', e)
    }

    const fallbackVal = prompt('Paste video link here:')
    if (fallbackVal && fallbackVal.trim()) {
      setUrl(fallbackVal.trim())
      handleInspectUrl(fallbackVal.trim())
    }
  }

  // Inspect URL / Fetch Media
  const handleInspectUrl = async (targetUrl = url) => {
    await triggerHaptic('medium')
    const finalUrl = (targetUrl || '').trim()
    if (!finalUrl) {
      await triggerHaptic('error')
      setError('Please paste a video link first.')
      return
    }

    setLoadingInfo(true)
    setError(null)
    setMediaInfo(null)
    setActiveTaskId(null)
    setJobState(null)

    try {
      const baseUrl = getApiUrl()
      const res = await fetch(`${baseUrl}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Could not analyze video from this link.')
      }

      setMediaInfo(data.data)
      await triggerHaptic('success')
      if (data.data.video_formats && data.data.video_formats.length > 0) {
        setActiveTab('video')
      } else {
        setActiveTab('audio')
      }
    } catch (err) {
      await triggerHaptic('error')
      setError(err.message)
    } finally {
      setLoadingInfo(false)
    }
  }

  // Start Download Job
  const handleStartDownload = async (formatId, isAudio, bitrate = 192) => {
    if (!mediaInfo) return
    await triggerHaptic('heavy')
    setError(null)

    try {
      const baseUrl = getApiUrl()
      const res = await fetch(`${baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mediaInfo.webpage_url || url,
          format_id: formatId,
          is_audio: isAudio,
          audio_bitrate: bitrate
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Download request failed to start.')
      }

      const taskId = data.task_id
      setActiveTaskId(taskId)
      setJobState({
        id: taskId,
        status: 'queued',
        progress: 0,
        speed: '0 B/s',
        eta: 'Starting...',
        filename: null,
        filesize_formatted: 'Calculating...'
      })

      connectToJobSSE(taskId)
    } catch (err) {
      await triggerHaptic('error')
      setError(err.message)
    }
  }

  // Connect to SSE Stream
  const connectToJobSSE = (taskId) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const baseUrl = getApiUrl()
    const es = new EventSource(`${baseUrl}/api/tasks/${taskId}/events`)
    eventSourceRef.current = es

    es.onmessage = async (event) => {
      try {
        const update = JSON.parse(event.data)
        setJobState(update)

        if (update.status === 'completed') {
          await triggerHaptic('success')
          es.close()
          fetchTelemetry()

          // Add to local history
          saveToHistory({
            id: taskId,
            title: update.title || mediaInfo?.title || 'Downloaded Video',
            thumbnail: mediaInfo?.thumbnail || '',
            platform: mediaInfo?.platform || 'Video',
            duration: mediaInfo?.duration_formatted || '',
            filesize: update.filesize_formatted || 'Completed',
            ext: update.filename?.split('.').pop() || 'mp4',
            download_url: update.download_url,
            filename: update.filename,
            timestamp: Date.now()
          })
        } else if (update.status === 'failed') {
          await triggerHaptic('error')
          es.close()
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err)
      }
    }

    es.onerror = () => {
      pollJobStatus(taskId)
      es.close()
    }
  }

  // Fallback Polling
  const pollJobStatus = async (taskId) => {
    const baseUrl = getApiUrl()
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/tasks/${taskId}`)
        if (res.ok) {
          const data = await res.json()
          setJobState(data.task)
          if (data.task.status === 'completed' || data.task.status === 'failed') {
            clearInterval(pollTimer)
            if (data.task.status === 'completed') {
              saveToHistory({
                id: taskId,
                title: data.task.title || mediaInfo?.title || 'Downloaded Video',
                thumbnail: mediaInfo?.thumbnail || '',
                platform: mediaInfo?.platform || 'Video',
                duration: mediaInfo?.duration_formatted || '',
                filesize: data.task.filesize_formatted || 'Completed',
                ext: data.task.filename?.split('.').pop() || 'mp4',
                download_url: data.task.download_url,
                filename: data.task.filename,
                timestamp: Date.now()
              })
            }
          }
        }
      } catch {
        clearInterval(pollTimer)
      }
    }, 1500)
  }

  // Save backend URL setting
  const handleSaveBackendUrl = (newUrl) => {
    setCustomBackendUrl(newUrl)
    localStorage.setItem('socialdl_backend_url', newUrl)
  }

  // Save cookies
  const handleSaveCookies = async () => {
    if (!cookiesInput.trim()) return
    setSavingCookies(true)
    try {
      const baseUrl = getApiUrl()
      const res = await fetch(`${baseUrl}/api/cookies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies_content: cookiesInput })
      })
      if (res.ok) {
        setCookiesInput('')
        fetchTelemetry()
        alert('Cookies configured successfully!')
      } else {
        alert('Failed to save cookies.')
      }
    } catch (err) {
      alert(`Error saving cookies: ${err.message}`)
    } finally {
      setSavingCookies(false)
    }
  }

  // Delete cookies
  const handleDeleteCookies = async () => {
    if (!confirm('Remove saved cookies?')) return
    try {
      const baseUrl = getApiUrl()
      await fetch(`${baseUrl}/api/cookies`, { method: 'DELETE' })
      fetchTelemetry()
    } catch (err) {
      console.error(err)
    }
  }

  // Filtered History for Library Tab
  const filteredHistory = history.filter((item) => {
    if (libraryFilter === 'video') return item.ext === 'mp4' || item.ext === 'webm' || !item.ext
    if (libraryFilter === 'audio') return item.ext === 'mp3' || item.ext === 'm4a'
    return true
  })

  return (
    <div className="app-shell">
      {/* Top Application Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon-box">
            <Sparkles size={22} />
          </div>
          <div className="brand-text-name">
            Social<span>DL</span>
          </div>
        </div>

        <div className="header-actions">
          <a
            href={APK_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-apk-header"
            title="Download SocialDL APK for Android"
          >
            <Smartphone size={14} />
            Download APK
          </a>
          <div className="status-indicator">
            <span className="status-dot" />
            <span>{health ? 'Online' : 'Checking'}</span>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="scroll-body">
        {/* ============================================================== */}
        {/* TAB 1: SAVER (HOME) */}
        {/* ============================================================== */}
        {activeNav === 'saver' && (
          <>
            {/* Accessible Clear Hero */}
            <div className="hero-box">
              <h1>
                Save Any Video & Music. <br />
                <span>Zero Limits. High Quality.</span>
              </h1>
              <p>
                Download clean videos and audio directly to your phone from TikTok, YouTube,
                Instagram, and X.
              </p>
            </div>

            {/* Input & Action Form Card (Clean Spacing, Zero Overlap) */}
            <div className="form-card">
              <label className="form-label">
                <span>Video or Audio Link</span>
              </label>

              {/* URL Input Box with Integrated Paste Button */}
              <div className="url-input-container">
                <input
                  type="url"
                  className="url-input"
                  placeholder="Paste TikTok, YouTube, or X link..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInspectUrl()}
                />
                {url ? (
                  <button
                    className="btn-clear-url"
                    onClick={() => {
                      setUrl('')
                      setMediaInfo(null)
                    }}
                    title="Clear link"
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <button
                    className="btn-paste-action"
                    onClick={handlePasteFromClipboard}
                    title="Paste link from clipboard"
                  >
                    <ClipboardPaste size={14} />
                    PASTE
                  </button>
                )}
              </div>

              {/* High-Visibility Accessible Orange Download Button */}
              <button
                className="btn-download-primary"
                onClick={() => {
                  if (mediaInfo) {
                    const topFmt = mediaInfo.video_formats?.[0]
                    if (topFmt) handleStartDownload(topFmt.format_id, false)
                  } else {
                    handleInspectUrl()
                  }
                }}
                disabled={loadingInfo || (!url.trim() && !mediaInfo)}
              >
                {loadingInfo ? (
                  <>
                    <RefreshCw size={20} className="spin-indicator" />
                    Finding Media...
                  </>
                ) : (
                  <>
                    <Download size={22} />
                    DOWNLOAD NOW
                  </>
                )}
              </button>

              {/* Quick Sample Test Chips (Generously spaced below button) */}
              <div className="samples-wrapper">
                <span className="samples-header-text">Try sample links:</span>
                <div className="samples-row">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.name}
                      className="sample-pill-btn"
                      onClick={() => {
                        triggerHaptic('light')
                        setUrl(s.url)
                        handleInspectUrl(s.url)
                      }}
                    >
                      <Play size={12} fill="currentColor" />
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dedicated Android APK Download Banner */}
            <div className="apk-banner-card">
              <div className="apk-banner-text">
                <h3>📱 Prefer using an App?</h3>
                <p>Install SocialDL for Android for the fastest 1-tap download experience.</p>
              </div>
              <a
                href={APK_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-apk-install"
              >
                <Smartphone size={16} />
                Get APK
              </a>
            </div>

            {/* Error Notification */}
            {error && (
              <div
                style={{
                  background: 'var(--error-bg)',
                  border: '1px solid var(--error-border)',
                  color: 'var(--error)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <AlertCircle size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Notice:</strong> {error}
                </div>
              </div>
            )}

            {/* Active Download Progress Card */}
            {jobState && (
              <div className="active-job-box">
                <div className="job-header-row">
                  <div className="job-title-group">
                    {jobState.status === 'completed' ? (
                      <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
                    ) : jobState.status === 'failed' ? (
                      <AlertCircle size={24} style={{ color: 'var(--error)' }} />
                    ) : (
                      <RefreshCw size={20} className="spin-indicator" style={{ color: 'var(--accent-orange)' }} />
                    )}
                    <span className="job-status-heading">
                      {jobState.status === 'queued' && 'Starting download...'}
                      {jobState.status === 'downloading' && `Downloading (${jobState.progress}%)`}
                      {jobState.status === 'processing' && 'Finishing audio & video...'}
                      {jobState.status === 'completed' && 'Media Ready!'}
                      {jobState.status === 'failed' && 'Download interrupted'}
                    </span>
                  </div>
                  <div className="job-meta-metrics">
                    {jobState.speed && <span>⚡ {jobState.speed}</span>}
                  </div>
                </div>

                <div className="job-progress-bg">
                  <div
                    className="job-progress-bar"
                    style={{
                      width: `${jobState.progress || (jobState.status === 'completed' ? 100 : 8)}%`,
                      background:
                        jobState.status === 'completed'
                          ? 'var(--success)'
                          : 'var(--accent-orange)'
                    }}
                  />
                </div>

                {jobState.status === 'completed' && jobState.download_url && (
                  <div style={{ marginTop: '4px' }}>
                    {Capacitor.isNativePlatform() ? (
                      <button
                        onClick={() =>
                          handleNativeDownloadOrShare(
                            jobState.download_url,
                            jobState.filename,
                            jobState.title
                          )
                        }
                        disabled={downloadingToDevice}
                        className="btn-save-ready"
                      >
                        {downloadingToDevice ? (
                          <>
                            <RefreshCw size={18} className="spin-indicator" />
                            Saving to Device...
                          </>
                        ) : (
                          <>
                            <Share2 size={18} />
                            Save to Device / Share
                          </>
                        )}
                      </button>
                    ) : (
                      <a
                        href={`${getApiUrl()}${jobState.download_url}`}
                        download
                        className="btn-save-ready"
                        onClick={() => triggerHaptic('medium')}
                      >
                        <Download size={18} />
                        Download File ({jobState.filesize_formatted || 'Save'})
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Inspect Media Details & Cupertino Format Switcher */}
            {mediaInfo && (
              <div className="media-inspect-box">
                <div className="inspect-header-grid">
                  <div className="inspect-thumbnail-box">
                    {mediaInfo.thumbnail ? (
                      <img src={mediaInfo.thumbnail} alt={mediaInfo.title} />
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff'
                        }}
                      >
                        <Video size={24} />
                      </div>
                    )}
                    {mediaInfo.duration_formatted && (
                      <span className="inspect-duration-pill">{mediaInfo.duration_formatted}</span>
                    )}
                  </div>
                  <div className="inspect-info-col">
                    <h3 className="inspect-media-title">{mediaInfo.title}</h3>
                    <div className="inspect-author-name">
                      {mediaInfo.channel || mediaInfo.platform}
                    </div>
                  </div>
                </div>

                {/* High Contrast Segmented Format Toggle */}
                <div className="segmented-toggle">
                  <button
                    className={`segmented-toggle-btn ${activeTab === 'video' ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection')
                      setActiveTab('video')
                    }}
                  >
                    <Video size={16} />
                    Video (HD)
                  </button>
                  <button
                    className={`segmented-toggle-btn ${activeTab === 'audio' ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection')
                      setActiveTab('audio')
                    }}
                  >
                    <Music size={16} />
                    Audio (MP3)
                  </button>
                </div>

                {/* Format Options Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeTab === 'video' &&
                    mediaInfo.video_formats?.map((fmt) => (
                      <div key={fmt.format_id} className="format-item-row">
                        <div>
                          <div className="format-title-line">
                            {fmt.resolution}
                            <span className="format-tag-badge">
                              {fmt.ext?.toUpperCase() || 'MP4'}
                            </span>
                          </div>
                          <div className="format-meta-line">
                            {fmt.filesize_formatted} {fmt.fps ? `• ${fmt.fps}fps` : ''}
                          </div>
                        </div>
                        <button
                          className="btn-format-download"
                          onClick={() => handleStartDownload(fmt.format_id, false)}
                          disabled={jobState && jobState.status === 'downloading'}
                        >
                          <Download size={14} />
                          Save
                        </button>
                      </div>
                    ))}

                  {activeTab === 'audio' &&
                    mediaInfo.audio_formats?.map((fmt) => (
                      <div key={fmt.format_id} className="format-item-row">
                        <div>
                          <div className="format-title-line">
                            {fmt.ext.toUpperCase()} Audio
                            <span className="format-tag-badge">Lossless</span>
                          </div>
                          <div className="format-meta-line">{fmt.label}</div>
                        </div>
                        <button
                          className="btn-format-download"
                          onClick={() => handleStartDownload(fmt.format_id, true, fmt.bitrate)}
                          disabled={jobState && jobState.status === 'downloading'}
                        >
                          <Download size={14} />
                          Extract
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recent Downloads Section */}
            <div className="section-title-row">
              <span className="section-title">Recent Downloads</span>
              {history.length > 0 && (
                <button
                  className="section-action-link"
                  onClick={() => {
                    triggerHaptic('light')
                    setActiveNav('library')
                  }}
                >
                  See All ({history.length})
                </button>
              )}
            </div>

            <div className="recent-items-list">
              {history.slice(0, 3).map((item) => (
                <div key={item.id} className="recent-item-card">
                  <div className="recent-thumb">
                    <img
                      src={
                        item.thumbnail ||
                        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80'
                      }
                      alt={item.title}
                    />
                    <div className="recent-play-badge">
                      <Play size={14} fill="currentColor" />
                    </div>
                  </div>

                  <div className="recent-text-details">
                    <div className="recent-title-text">{item.title}</div>
                    <div className="recent-meta-text">
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--accent-orange)',
                          textTransform: 'uppercase'
                        }}
                      >
                        {item.ext}
                      </span>
                      <span>• {item.filesize || 'Saved'}</span>
                      {item.duration && <span>• {item.duration}</span>}
                    </div>
                  </div>

                  {item.download_url ? (
                    <button
                      className="recent-circle-btn"
                      onClick={() =>
                        Capacitor.isNativePlatform()
                          ? handleNativeDownloadOrShare(
                              item.download_url,
                              item.filename,
                              item.title
                            )
                          : window.open(`${getApiUrl()}${item.download_url}`)
                      }
                      title="Save / Share"
                    >
                      <Share2 size={16} />
                    </button>
                  ) : (
                    <div
                      className="recent-circle-btn"
                      style={{ cursor: 'default', color: 'var(--success)' }}
                    >
                      <Check size={16} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer with King-Austin Credits & Domain */}
            <footer className="app-credits-footer">
              <div>
                SocialDL • Built with ❤️ by <strong>King-Austin</strong>
              </div>
              <div>
                Official Domain:{' '}
                <a
                  href="https://social.nworahebuka.com.ng"
                  target="_blank"
                  rel="noreferrer"
                >
                  social.nworahebuka.com.ng
                </a>
              </div>
            </footer>
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 2: LIBRARY */}
        {/* ============================================================== */}
        {activeNav === 'library' && (
          <>
            <div className="hero-box">
              <h1>Downloads Library</h1>
              <p>All videos and audio tracks stored on this device.</p>
            </div>

            {/* Filter Pills */}
            <div className="segmented-toggle">
              <button
                className={`segmented-toggle-btn ${libraryFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setLibraryFilter('all')
                }}
              >
                All ({history.length})
              </button>
              <button
                className={`segmented-toggle-btn ${libraryFilter === 'video' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setLibraryFilter('video')
                }}
              >
                Videos
              </button>
              <button
                className={`segmented-toggle-btn ${libraryFilter === 'audio' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setLibraryFilter('audio')
                }}
              >
                Audio
              </button>
            </div>

            {/* Items List */}
            {filteredHistory.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 1rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <Folder size={44} style={{ color: 'var(--border-focus)' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>No saved downloads yet</div>
                <button
                  className="btn-download-primary"
                  style={{ width: 'auto', padding: '10px 24px', fontSize: '0.95rem' }}
                  onClick={() => setActiveNav('saver')}
                >
                  Start Saving Videos
                </button>
              </div>
            ) : (
              <div className="recent-items-list">
                {filteredHistory.map((item) => (
                  <div key={item.id} className="recent-item-card">
                    <div className="recent-thumb">
                      <img
                        src={
                          item.thumbnail ||
                          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80'
                        }
                        alt={item.title}
                      />
                      <div className="recent-play-badge">
                        <Play size={14} fill="currentColor" />
                      </div>
                    </div>

                    <div className="recent-text-details">
                      <div className="recent-title-text">{item.title}</div>
                      <div className="recent-meta-text">
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--accent-orange)',
                            textTransform: 'uppercase'
                          }}
                        >
                          {item.ext}
                        </span>
                        <span>• {item.filesize}</span>
                        {item.duration && <span>• {item.duration}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {item.download_url && (
                        <button
                          className="recent-circle-btn"
                          onClick={() =>
                            Capacitor.isNativePlatform()
                              ? handleNativeDownloadOrShare(
                                  item.download_url,
                                  item.filename,
                                  item.title
                                )
                              : window.open(`${getApiUrl()}${item.download_url}`)
                          }
                          title="Share / Save"
                        >
                          <Share2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleClearHistory}
                  style={{
                    background: 'transparent',
                    border: '1px dashed var(--error)',
                    color: 'var(--error)',
                    padding: '12px',
                    borderRadius: '12px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Trash2 size={16} />
                  Clear Download History
                </button>
              </div>
            )}
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 3: APPS */}
        {/* ============================================================== */}
        {activeNav === 'apps' && (
          <>
            <div className="hero-box">
              <h1>Supported Platforms</h1>
              <p>Tap any platform to load a test link or paste your own URL.</p>
            </div>

            <div className="apps-grid-box">
              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setUrl('https://vt.tiktok.com/ZSb28AUs8/')
                  setActiveNav('saver')
                  handleInspectUrl('https://vt.tiktok.com/ZSb28AUs8/')
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>🎵</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>TikTok</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Clean 1080p vertical video with no watermark.
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
                  setActiveNav('saver')
                  handleInspectUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>▶️</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>YouTube</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  4K / 1080p 60fps video & 320kbps MP3 audio.
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setUrl('https://x.com/LisPower1/status/1001551623938805763')
                  setActiveNav('saver')
                  handleInspectUrl('https://x.com/LisPower1/status/1001551623938805763')
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>✖️</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Twitter / X</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Post videos, space clips, and animated GIFs.
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setUrl('https://soundcloud.com/octobersveryown/drake-back-to-back-freestyle')
                  setActiveNav('saver')
                  handleInspectUrl(
                    'https://soundcloud.com/octobersveryown/drake-back-to-back-freestyle'
                  )
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>🎧</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>SoundCloud</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Lossless audio downloads and full tracks.
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setActiveNav('saver')
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>📷</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Instagram</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Reels, stories, posts, and IGTV media.
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setActiveNav('saver')
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>💬</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Reddit</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Merged video with sound from viral posts.
                </div>
              </div>
            </div>
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 4: SETTINGS */}
        {/* ============================================================== */}
        {activeNav === 'settings' && (
          <>
            <div className="hero-box">
              <h1>Settings & About</h1>
              <p>App details, credits, and engine options.</p>
            </div>

            {/* Official Credits Card */}
            <div className="settings-card" style={{ borderLeft: '4px solid var(--accent-orange)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                About SocialDL
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Built by</span>
                <strong style={{ color: 'var(--accent-orange)' }}>King-Austin</strong>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Domain</span>
                <a
                  href="https://social.nworahebuka.com.ng"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)', fontWeight: 600 }}
                >
                  social.nworahebuka.com.ng
                </a>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Framework</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  React + Capacitor Mobile
                </span>
              </div>
            </div>

            {/* Mobile App APK Card */}
            <div className="apk-banner-card">
              <div className="apk-banner-text">
                <h3>📱 Download SocialDL APK</h3>
                <p>Install directly on Android for the smoothest mobile app experience.</p>
              </div>
              <a
                href={APK_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-apk-install"
              >
                <Download size={16} />
                Download APK
              </a>
            </div>

            {/* Status Information */}
            <div className="settings-card">
              <div className="settings-item-row">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Engine Connection
                </span>
                <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.88rem' }}>
                  Online & Ready 🟢
                </span>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Auto-Cleaner
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Cleans temp files every 45 mins
                </span>
              </div>
            </div>

            {/* Expandable Advanced Engine Drawer */}
            <button
              className="btn-toggle-advanced"
              onClick={() => {
                triggerHaptic('light')
                setShowAdvancedSettings(!showAdvancedSettings)
              }}
            >
              <Sliders size={16} />
              {showAdvancedSettings ? 'Hide Advanced Settings' : 'Advanced Diagnostics & Cookies'}
              {showAdvancedSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {showAdvancedSettings && (
              <div className="settings-card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Custom Backend Endpoint
                  </label>
                  <input
                    type="text"
                    value={customBackendUrl}
                    placeholder="http://YOUR_EC2_IP:8055 (or leave empty for default)"
                    onChange={(e) => handleSaveBackendUrl(e.target.value)}
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Used when frontend is deployed on Vercel to connect to the backend VPS.
                  </span>
                </div>

                {health && (
                  <div
                    style={{
                      padding: '10px',
                      background: 'var(--bg-subtle)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px'
                    }}
                  >
                    <div>
                      Free Disk: <strong>{health.storage.free_gb} GB</strong>
                    </div>
                    <div>
                      Engine: <strong>{health.ytdlp_version}</strong>
                    </div>
                    <div>
                      FFmpeg: <strong>{health.ffmpeg_installed ? 'Active ✅' : 'Missing ❌'}</strong>
                    </div>
                    <div>
                      Host: <strong>EC2 Cloud</strong>
                    </div>
                  </div>
                )}

                {/* Netscape Cookies Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      YouTube cookies.txt
                    </span>
                    {cookiesInfo?.configured ? (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        Active ({cookiesInfo.size_bytes}B)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>None</span>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Paste Netscape cookies.txt content here..."
                    value={cookiesInput}
                    onChange={(e) => setCookiesInput(e.target.value)}
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-format-download"
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                      onClick={handleSaveCookies}
                      disabled={savingCookies || !cookiesInput.trim()}
                    >
                      Save Cookies
                    </button>
                    {cookiesInfo?.configured && (
                      <button
                        onClick={handleDeleteCookies}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--error)',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Delete Cookies
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Light Glass Bottom Navigation Dock */}
      <nav className="bottom-nav-dock">
        <button
          className={`nav-tab-item ${activeNav === 'saver' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('saver')
          }}
        >
          <Download size={22} />
          <span className="nav-tab-label">Saver</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'library' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('library')
          }}
        >
          <Folder size={22} />
          <span className="nav-tab-label">Library</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'apps' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('apps')
          }}
        >
          <LayoutGrid size={22} />
          <span className="nav-tab-label">Apps</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('settings')
          }}
        >
          <Settings size={22} />
          <span className="nav-tab-label">Settings</span>
        </button>
      </nav>

      {/* Hardware Back Button Exit Notice */}
      {showExitToast && (
        <div className="exit-notice-toast">
          <AlertCircle size={16} style={{ color: 'var(--accent-orange)' }} />
          <span>Tap back again to exit SocialDL</span>
        </div>
      )}
    </div>
  )
}
