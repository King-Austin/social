import React, { useState, useEffect, useRef } from 'react'
import {
  Download,
  Video,
  Music,
  Server,
  HardDrive,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Play,
  Film,
  Radio,
  FileCode,
  X,
  Copy,
  Check,
  Cpu,
  Share2
} from 'lucide-react'

import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Haptic feedback helper supporting both native Capacitor and mobile browser vibration
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
      else if (type === 'medium') navigator.vibrate(28)
      else if (type === 'heavy') navigator.vibrate(45)
      else if (type === 'selection') navigator.vibrate(8)
      else if (type === 'success') navigator.vibrate([15, 50, 20])
      else if (type === 'error') navigator.vibrate([40, 40, 40])
    }
  } catch {
    // Graceful no-op on non-supported platforms
  }
}

// Sample URLs for instant 1-click test
const SAMPLES = [
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'YouTube'
  },
  {
    name: 'TikTok',
    url: 'https://vt.tiktok.com/ZSb28AUs8/',
    platform: 'TikTok'
  },
  {
    name: 'Twitter (X)',
    url: 'https://x.com/LisPower1/status/1001551623938805763',
    platform: 'X / Twitter'
  },
  {
    name: 'SoundCloud (Audio)',
    url: 'https://soundcloud.com/octobersveryown/drake-back-to-back-freestyle',
    platform: 'SoundCloud'
  }
]

export default function App() {
  const [url, setUrl] = useState('')
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [mediaInfo, setMediaInfo] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('video')

  // Download Job tracking
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [jobState, setJobState] = useState(null)
  const eventSourceRef = useRef(null)

  // System & Health Telemetry
  const [health, setHealth] = useState(null)
  const [cookiesInfo, setCookiesInfo] = useState(null)

  // Settings & Configuration
  const [showSettings, setShowSettings] = useState(false)
  const [customBackendUrl, setCustomBackendUrl] = useState(
    () => localStorage.getItem('ytdlp_custom_backend') || ''
  )
  const [cookiesInput, setCookiesInput] = useState('')
  const [savingCookies, setSavingCookies] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [downloadingToDevice, setDownloadingToDevice] = useState(false)

  // Mobile Back Button Navigation Control
  const [backPressedOnce, setBackPressedOnce] = useState(false)
  const [showExitToast, setShowExitToast] = useState(false)
  const backPressTimerRef = useRef(null)

  // Keep latest UI state in ref for hardware back button handler
  const stateRef = useRef({ showSettings, mediaInfo, jobState, backPressedOnce })
  useEffect(() => {
    stateRef.current = { showSettings, mediaInfo, jobState, backPressedOnce }
  }, [showSettings, mediaInfo, jobState, backPressedOnce])

  // Hierarchical back button listener for mobile
  useEffect(() => {
    let backListener = null

    const setupBackButton = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          backListener = await CapApp.addListener('backButton', async ({ canGoBack }) => {
            const { showSettings: isSettingsOpen, mediaInfo: hasMedia, backPressedOnce: pressedOnce } = stateRef.current

            // 1. If Settings modal is open, close it
            if (isSettingsOpen) {
              await triggerHaptic('light')
              setShowSettings(false)
              return
            }

            // 2. If viewing a media result or active download card, step back to clean search
            if (hasMedia) {
              await triggerHaptic('light')
              setMediaInfo(null)
              return
            }

            // 3. If at root screen, require double back tap within 2s to exit
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
        console.warn('Could not register hardware back button listener:', err)
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
    // Default: relative proxy via Vite or current host
    return ''
  }

  // Native mobile download & share handler for Capacitor
  const handleNativeDownloadOrShare = async (downloadUrl, filename) => {
    await triggerHaptic('medium')
    try {
      setDownloadingToDevice(true)
      const fullUrl = `${getApiUrl()}${downloadUrl}`
      const response = await fetch(fullUrl)
      if (!response.ok) throw new Error('Failed to retrieve file from server.')
      const blob = await response.blob()

      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        try {
          const base64data = reader.result.split(',')[1]
          const cleanName = filename ? filename.replace(/^[a-f0-9-]+_/, '') : `media_${Date.now()}.mp4`

          const savedFile = await Filesystem.writeFile({
            path: cleanName,
            data: base64data,
            directory: Directory.Cache
          })

          await triggerHaptic('success')
          await Share.share({
            title: 'SocialDL Media',
            text: 'Downloaded via SocialDL',
            url: savedFile.uri,
            dialogTitle: 'Save or Share Media'
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

  // Fetch telemetry & cookies info
  const fetchTelemetry = async () => {
    try {
      const baseUrl = getApiUrl()
      const [healthRes, cookiesRes] = await Promise.all([
        fetch(`${baseUrl}/api/health`).then(r => r.json()).catch(() => null),
        fetch(`${baseUrl}/api/cookies`).then(r => r.json()).catch(() => null)
      ])
      if (healthRes && healthRes.status === 'healthy') {
        setHealth(healthRes)
      }
      if (cookiesRes) {
        setCookiesInfo(cookiesRes)
      }
    } catch {
      // Ignore background telemetry errors
    }
  }

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(fetchTelemetry, 15000)
    return () => clearInterval(interval)
  }, [customBackendUrl])

  // Extract metadata
  const handleInspectUrl = async (targetUrl = url) => {
    await triggerHaptic('medium')
    const finalUrl = (targetUrl || '').trim()
    if (!finalUrl) {
      await triggerHaptic('error')
      setError('Please provide a valid video or audio URL.')
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
        throw new Error(data.detail || 'Failed to inspect media.')
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

  // Trigger download job
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
        throw new Error(data.detail || 'Download request could not be queued.')
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

      // Establish real-time SSE connection
      connectToJobSSE(taskId)
    } catch (err) {
      setError(err.message)
    }
  }

  // SSE Real-time Progress Tracking
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
          fetchTelemetry() // update cached files count
        } else if (update.status === 'failed') {
          await triggerHaptic('error')
          es.close()
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err)
      }
    }

    es.onerror = () => {
      // Fallback to polling if SSE drops
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
    localStorage.setItem('ytdlp_custom_backend', newUrl)
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
        alert('Cookies saved successfully! yt-dlp will now use them for restricted platforms.')
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
    if (!confirm('Are you sure you want to remove the cookies file?')) return
    try {
      const baseUrl = getApiUrl()
      await fetch(`${baseUrl}/api/cookies`, { method: 'DELETE' })
      fetchTelemetry()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Radio size={22} />
          </div>
          <div className="brand-text">
            <h1>
              SocialDL
              <span className="brand-badge">yt-dlp v2026</span>
            </h1>
            <div className="brand-tagline">EC2 Cloud Backend • Serverless Frontend</div>
          </div>
        </div>

        <div className="nav-actions">
          {health ? (
            <div className="telemetry-pill" title="VPS Backend Connected">
              <span className="status-dot pulse" />
              <span>EC2 Online</span>
              <span style={{ color: 'var(--text-dim)' }}>|</span>
              <HardDrive size={13} style={{ color: 'var(--accent-secondary)' }} />
              <span>{health.storage.free_gb} GB Free</span>
            </div>
          ) : (
            <div className="telemetry-pill" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <span className="status-dot" style={{ background: '#ef4444', boxShadow: 'none' }} />
              <span>Backend Offline</span>
            </div>
          )}

          <button
            className="btn-icon"
            onClick={() => setShowSettings(true)}
            title="Backend & Vercel Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-pill">
          <Sparkles size={14} />
          Self-Hosted Media Engine for your VPS
        </div>
        <h2>
          Download Anything. <br />
          <span className="gradient-text">Zero Limits, Hosted on EC2.</span>
        </h2>
        <p>
          Powered by latest <strong style={{ color: '#fff' }}>yt-dlp</strong> and <strong style={{ color: '#fff' }}>FFmpeg</strong>.
          Extract ultra-crisp 1080p/4K video and lossless 320kbps MP3 audio directly to your device.
        </p>
      </section>

      {/* Input Section */}
      <section className="input-section">
        <div className="search-box">
          <div className="search-box-icon">
            <Film size={22} />
          </div>
          <input
            type="url"
            placeholder="Paste any video, track, or post URL (YouTube, TikTok, Twitter/X, SoundCloud, IG...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInspectUrl()}
          />
          <div className="search-box-actions">
            {url && (
              <button
                className="btn-ghost"
                onClick={() => setUrl('')}
                title="Clear input"
              >
                <X size={15} />
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => handleInspectUrl()}
              disabled={loadingInfo || !url.trim()}
            >
              {loadingInfo ? (
                <>
                  <RefreshCw size={16} className="job-spinner" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Fetch Media
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Demo Test URLs */}
        <div className="platforms-bar">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Try 1-Click Samples:</span>
          {SAMPLES.map((sample) => (
            <button
              key={sample.name}
              className="platform-pill sample"
              onClick={() => {
                triggerHaptic('light')
                setUrl(sample.url)
                handleInspectUrl(sample.url)
              }}
            >
              <Play size={10} />
              {sample.name}
            </button>
          ))}
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Extraction Notice:</strong> {error}
            {error.includes('confirm you’re not a bot') && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#fecaca' }}>
                💡 <strong>Tip for YouTube on EC2:</strong> YouTube requires cookies when accessed from cloud datacenters. Click the <strong>⚙️ Settings</strong> icon in the header to paste a cookies.txt file or use non-restricted URLs.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Job Tracker */}
      {jobState && (
        <div className="job-tracker">
          <div className="job-header">
            <div className="job-title-area">
              {jobState.status === 'completed' ? (
                <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
              ) : jobState.status === 'failed' ? (
                <AlertCircle size={24} style={{ color: 'var(--error)' }} />
              ) : (
                <div className="job-spinner" />
              )}
              <div>
                <div className="job-status-text">
                  {jobState.status === 'queued' && 'Task Queued on EC2...'}
                  {jobState.status === 'downloading' && `Downloading Media (${jobState.progress}%)`}
                  {jobState.status === 'processing' && 'Converting & Merging with FFmpeg...'}
                  {jobState.status === 'completed' && 'Media Ready for Download!'}
                  {jobState.status === 'failed' && 'Download Process Failed'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {jobState.title || (mediaInfo ? mediaInfo.title : 'Media File')}
                </div>
              </div>
            </div>

            <div className="job-stats">
              {jobState.speed && <span>⚡ {jobState.speed}</span>}
              {jobState.filesize_formatted && <span>📦 {jobState.filesize_formatted}</span>}
              {jobState.eta && <span>⏳ {jobState.eta}</span>}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-container">
            <div
              className="progress-fill"
              style={{
                width: `${jobState.progress || (jobState.status === 'completed' ? 100 : 5)}%`,
                background:
                  jobState.status === 'completed'
                    ? 'linear-gradient(90deg, #10b981, #059669)'
                    : 'var(--accent-gradient)'
              }}
            />
          </div>

          {/* Download Action Button once Ready */}
          {jobState.status === 'completed' && jobState.download_url && (
            <div className="job-complete-action">
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {Capacitor.isNativePlatform() ? 'Ready to save directly to device' : 'Saved locally on VPS • Auto-cleaned after 45 mins'}
              </span>
              {Capacitor.isNativePlatform() ? (
                <button
                  onClick={() => handleNativeDownloadOrShare(jobState.download_url, jobState.filename)}
                  disabled={downloadingToDevice}
                  className="btn-success"
                >
                  {downloadingToDevice ? (
                    <>
                      <RefreshCw size={18} className="job-spinner" />
                      Saving to Device...
                    </>
                  ) : (
                    <>
                      <Share2 size={18} />
                      Save & Share Media ({jobState.filesize_formatted})
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={`${getApiUrl()}${jobState.download_url}`}
                  download
                  className="btn-success"
                  onClick={() => triggerHaptic('medium')}
                >
                  <Download size={18} />
                  Download File ({jobState.filesize_formatted})
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Media Details & Format Selection Card */}
      {mediaInfo && (
        <div className="media-card">
          <div className="media-header">
            <div className="thumbnail-wrap">
              {mediaInfo.thumbnail ? (
                <img src={mediaInfo.thumbnail} alt={mediaInfo.title} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-dim)'
                  }}
                >
                  <Video size={48} />
                </div>
              )}
              {mediaInfo.duration_formatted && (
                <span className="duration-badge">{mediaInfo.duration_formatted}</span>
              )}
            </div>

            <div className="media-details">
              <div className="media-meta-top">
                <span className="platform-badge">{mediaInfo.platform}</span>
                <h3 className="media-title">{mediaInfo.title}</h3>
                <div className="media-author">
                  <span>Uploaded by:</span>
                  {mediaInfo.channel_url ? (
                    <a
                      href={mediaInfo.channel_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {mediaInfo.channel}
                    </a>
                  ) : (
                    <span>{mediaInfo.channel}</span>
                  )}
                </div>
              </div>

              {/* Format Switcher Tabs */}
              <div className="format-tabs">
                <button
                  className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection')
                    setActiveTab('video')
                  }}
                >
                  <Video size={17} />
                  Video Formats ({mediaInfo.video_formats?.length || 0})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection')
                    setActiveTab('audio')
                  }}
                >
                  <Music size={17} />
                  Audio Extraction (MP3/M4A)
                </button>
              </div>
            </div>
          </div>

          {/* Video Options */}
          {activeTab === 'video' && (
            <div className="formats-grid">
              {mediaInfo.video_formats && mediaInfo.video_formats.length > 0 ? (
                mediaInfo.video_formats.map((fmt) => (
                  <div key={fmt.format_id} className="format-card">
                    <div className="format-info">
                      <div className="format-res">
                        {fmt.resolution}
                        <span className="format-tag">{fmt.ext || 'MP4'}</span>
                      </div>
                      <div className="format-meta">
                        {fmt.filesize_formatted}
                        {fmt.fps ? ` • ${fmt.fps} fps` : ''}
                      </div>
                    </div>
                    <button
                      className="btn-download-sm"
                      onClick={() => handleStartDownload(fmt.format_id, false)}
                      disabled={jobState && jobState.status === 'downloading'}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-dim)', padding: '1rem' }}>
                  No standalone video streams detected. Try the Audio extraction tab.
                </div>
              )}
            </div>
          )}

          {/* Audio Options */}
          {activeTab === 'audio' && (
            <div className="formats-grid">
              {mediaInfo.audio_formats?.map((fmt) => (
                <div key={fmt.format_id} className="format-card">
                  <div className="format-info">
                    <div className="format-res">
                      {fmt.ext.toUpperCase()}
                      <span className="format-tag">AUDIO</span>
                    </div>
                    <div className="format-meta">{fmt.label}</div>
                  </div>
                  <button
                    className="btn-download-sm"
                    onClick={() => handleStartDownload(fmt.format_id, true, fmt.bitrate)}
                    disabled={jobState && jobState.status === 'downloading'}
                  >
                    <Download size={14} />
                    Extract
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings / Vercel Configuration Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Backend & Vercel Deployment</h3>
              <button
                className="btn-icon"
                onClick={() => setShowSettings(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Architecture Details */}
            <div className="arch-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>
                <Server size={16} style={{ color: 'var(--accent-primary)' }} />
                Self-Hosted Architecture: EC2 + Vercel
              </div>
              <div>
                • <strong>Backend:</strong> Running on EC2 VPS (FastAPI + yt-dlp + FFmpeg on port 8055)
              </div>
              <div>
                • <strong>Frontend:</strong> Serverless static application ready to deploy to Vercel
              </div>
            </div>

            {/* Backend URL setting */}
            <div className="form-group">
              <label>API Endpoint (EC2 VPS URL)</label>
              <input
                type="text"
                placeholder="http://YOUR_EC2_IP:8055 (or leave empty for local proxy)"
                value={customBackendUrl}
                onChange={(e) => handleSaveBackendUrl(e.target.value)}
              />
              <span className="form-hint">
                When deployed to Vercel, enter your EC2 Public IP or domain here so this serverless frontend can communicate with your VPS.
              </span>
            </div>

            {/* Storage Telemetry */}
            {health && (
              <div className="arch-card">
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>EC2 Disk & Engine Status</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div>Free Disk: <strong>{health.storage.free_gb} GB</strong></div>
                  <div>Used Disk: <strong>{health.storage.used_gb} GB</strong></div>
                  <div>yt-dlp: <strong>{health.ytdlp_version}</strong></div>
                  <div>FFmpeg: <strong>{health.ffmpeg_installed ? 'Installed ✅' : 'Missing ❌'}</strong></div>
                </div>
              </div>
            )}

            {/* Cookies Manager */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>YouTube / Netscape Cookies.txt</label>
                {cookiesInfo?.configured ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Active ({cookiesInfo.size_bytes} bytes)</span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Not Configured</span>
                )}
              </div>
              <textarea
                placeholder="Paste Netscape cookies.txt content here to bypass YouTube bot detection on cloud EC2 IPs..."
                value={cookiesInput}
                onChange={(e) => setCookiesInput(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button
                  className="btn-primary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.82rem' }}
                  onClick={handleSaveCookies}
                  disabled={savingCookies || !cookiesInput.trim()}
                >
                  Save Cookies
                </button>
                {cookiesInfo?.configured && (
                  <button
                    className="btn-ghost"
                    style={{ color: '#f87171' }}
                    onClick={handleDeleteCookies}
                  >
                    Delete Cookies
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                className="btn-primary"
                onClick={() => setShowSettings(false)}
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div>
          SocialDL • Self-Hosted yt-dlp & FFmpeg Cloud Suite
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          Safe EC2 execution • Autonomous periodic cleanup • Zero impact on existing services
        </div>
      </footer>

      {/* Mobile Back-to-Exit Toast */}
      {showExitToast && (
        <div className="exit-toast">
          <AlertCircle size={16} style={{ color: 'var(--accent-secondary)' }} />
          <span>Press back again to exit SocialDL</span>
        </div>
      )}
    </div>
  )
}
