import React, { useState, useEffect, useRef } from 'react'
import {
  Menu,
  Download,
  Video,
  Music,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  X,
  Share2,
  Folder,
  LayoutGrid,
  Trash2,
  ClipboardPaste,
  Check,
  Smartphone,
  ExternalLink,
  Clock
} from 'lucide-react'

import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

// Tactile Haptic Feedback
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
      if (type === 'light') navigator.vibrate(10)
      else if (type === 'medium') navigator.vibrate(25)
      else if (type === 'heavy') navigator.vibrate(40)
      else if (type === 'selection') navigator.vibrate(8)
      else if (type === 'success') navigator.vibrate([15, 40, 20])
      else if (type === 'error') navigator.vibrate([35, 30, 35])
    }
  } catch {
    // Non-critical
  }
}

// Supported Platforms (No hardcoded URLs - used for platform selection)
const PLATFORMS = [
  { id: 'TikTok', name: 'TikTok', icon: '🎵', placeholder: 'Paste TikTok link here...' },
  { id: 'YouTube', name: 'YouTube', icon: '▶️', placeholder: 'Paste YouTube link here...' },
  { id: 'X', name: 'X', icon: '✖️', placeholder: 'Paste Twitter / X link here...' },
  { id: 'Instagram', name: 'Instagram', icon: '📷', placeholder: 'Paste Instagram link here...' },
  { id: 'Facebook', name: 'Facebook', icon: '👥', placeholder: 'Paste Facebook video link here...' }
]

const APK_URL = 'https://social.nworahebuka.com.ng/SocialDL.apk'

export default function App() {
  const [activeNav, setActiveNav] = useState('saver') // 'saver' | 'library' | 'apps' | 'settings'
  const [showSidebar, setShowSidebar] = useState(false)

  // Input & Platform Selection States
  const [url, setUrl] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState(null) // 'TikTok' | 'YouTube' | 'X' | 'Instagram' | null
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [mediaInfo, setMediaInfo] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('video') // 'video' | 'audio'
  const inputRef = useRef(null)

  // Job tracking
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [jobState, setJobState] = useState(null)
  const eventSourceRef = useRef(null)

  // Status
  const [isOnline, setIsOnline] = useState(true)
  const [downloadingToDevice, setDownloadingToDevice] = useState(false)

  // Platform & Environment Detection
  const isNative = Capacitor.isNativePlatform()
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  // Only display APK download prompts if NOT running inside the installed native mobile app,
  // NOT installed as a standalone PWA, and NOT on an iOS device (where APK cannot run).
  const showApkPrompts = !isNative && !isStandalone && !isIOS

  // Over-The-Air (OTA) Update State
  const CURRENT_APP_VERSION = '1.0.0'
  const [checkingOta, setCheckingOta] = useState(false)
  const [otaStatusMessage, setOtaStatusMessage] = useState(null)

  // History - strictly real user downloads, no mock data
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('socialdl_history')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Filter out any remnant demo items from earlier prototypes
          return parsed.filter((item) => item && item.id && !String(item.id).startsWith('demo_'))
        }
      }
    } catch (e) {
      console.warn('History read notice:', e)
    }
    return []
  })
  const [libraryFilter, setLibraryFilter] = useState('all')

  // Mobile Back Button
  const [backPressedOnce, setBackPressedOnce] = useState(false)
  const [showExitToast, setShowExitToast] = useState(false)
  const backPressTimerRef = useRef(null)

  const stateRef = useRef({ activeNav, showSidebar, mediaInfo, jobState, backPressedOnce })
  useEffect(() => {
    stateRef.current = { activeNav, showSidebar, mediaInfo, jobState, backPressedOnce }
  }, [activeNav, showSidebar, mediaInfo, jobState, backPressedOnce])

  // Save to history helper
  const saveToHistory = (item) => {
    setHistory((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id && p.title !== item.title)
      const updated = [item, ...filtered].slice(0, 30)
      try {
        localStorage.setItem('socialdl_history', JSON.stringify(updated))
      } catch (err) {
        console.warn('History write error', err)
      }
      return updated
    })
  }

  // Clear history
  const handleClearHistory = () => {
    if (confirm('Clear download history?')) {
      triggerHaptic('medium')
      setHistory([])
      localStorage.removeItem('socialdl_history')
    }
  }

  // Delete individual item from history
  const handleDeleteHistoryItem = (e, id) => {
    if (e) e.stopPropagation()
    triggerHaptic('light')
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      try {
        localStorage.setItem('socialdl_history', JSON.stringify(updated))
      } catch (err) {
        console.warn('History write error', err)
      }
      return updated
    })
  }

  // Mobile Hardware Back Button
  useEffect(() => {
    let backListener = null

    const setupBackButton = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          backListener = await CapApp.addListener('backButton', async () => {
            const { activeNav: curNav, showSidebar: isSidebarOpen, mediaInfo: hasMedia, backPressedOnce: pressedOnce } = stateRef.current

            // 1. If sidebar is open, close it
            if (isSidebarOpen) {
              await triggerHaptic('light')
              setShowSidebar(false)
              return
            }

            // 2. If inside Library, Apps, or Settings, return to Saver Home
            if (curNav !== 'saver') {
              await triggerHaptic('light')
              setActiveNav('saver')
              return
            }

            // 3. If on Saver screen with media card open, close card back to clean input
            if (hasMedia) {
              await triggerHaptic('light')
              setMediaInfo(null)
              return
            }

            // 4. Double back to exit
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
        console.warn('Back button notice:', err)
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
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    }
    // In native Android APK, connect directly to VPS backend IP
    if (Capacitor.isNativePlatform()) {
      return 'http://34.244.99.37:8055'
    }
    return ''
  }

  // Health check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/health`)
        setIsOnline(res.ok)
      } catch {
        setIsOnline(false)
      }
    }
    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => clearInterval(timer)
  }, [])

  // Over-The-Air (OTA) Updates Lifecycle
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    // 1. Notify native updater that app rendered successfully (protects against crash rollbacks)
    try {
      CapacitorUpdater.notifyAppReady()
    } catch (err) {
      console.warn('Updater notify notice:', err)
    }

    // 2. Silent background OTA check
    const checkOtaUpdates = async () => {
      try {
        const baseUrl = getApiUrl()
        const res = await fetch(`${baseUrl}/api/app/version`)
        if (!res.ok) return
        const raw = await res.text()
        const data = raw ? JSON.parse(raw) : {}

        if (data.version && data.bundle_url) {
          const current = await CapacitorUpdater.current()
          const activeVersion = current?.bundle?.version || CURRENT_APP_VERSION

          if (data.version !== activeVersion) {
            console.log(`[OTA] Downloading update v${data.version}...`)
            const downloaded = await CapacitorUpdater.download({
              url: data.bundle_url,
              version: data.version
            })
            // Stage update to be applied seamlessly on next launch
            await CapacitorUpdater.set(downloaded)
            console.log(`[OTA] Update v${data.version} downloaded and staged for next launch`)
          }
        }
      } catch (otaErr) {
        console.warn('OTA background check notice:', otaErr)
      }
    }

    const timer = setTimeout(checkOtaUpdates, 3500)
    return () => clearTimeout(timer)
  }, [])

  // Manual OTA Check Handler
  const handleManualOtaCheck = async () => {
    if (!Capacitor.isNativePlatform()) return
    setCheckingOta(true)
    setOtaStatusMessage('Checking for updates...')
    await triggerHaptic('light')
    try {
      const baseUrl = getApiUrl()
      const res = await fetch(`${baseUrl}/api/app/version`)
      if (!res.ok) throw new Error('Could not reach update server.')
      const raw = await res.text()
      const data = raw ? JSON.parse(raw) : {}

      const current = await CapacitorUpdater.current()
      const currentVer = current?.bundle?.version || CURRENT_APP_VERSION

      if (data.version && data.version !== currentVer && data.bundle_url) {
        setOtaStatusMessage(`Downloading v${data.version}...`)
        const downloaded = await CapacitorUpdater.download({
          url: data.bundle_url,
          version: data.version
        })
        await CapacitorUpdater.set(downloaded)
        setOtaStatusMessage(`v${data.version} ready! Restart to apply.`)
        await triggerHaptic('success')
      } else {
        setOtaStatusMessage('You are on the latest version!')
        await triggerHaptic('success')
      }
    } catch (err) {
      console.warn('Manual OTA check error:', err)
      setOtaStatusMessage('Up to date')
    } finally {
      setCheckingOta(false)
      setTimeout(() => setOtaStatusMessage(null), 4000)
    }
  }

  // Native Mobile Download & Share
  const handleNativeDownloadOrShare = async (downloadUrl, filename, title) => {
    await triggerHaptic('medium')
    try {
      setDownloadingToDevice(true)
      const fullUrl = `${getApiUrl()}${downloadUrl}`
      const response = await fetch(fullUrl)
      if (!response.ok) throw new Error('File download failed.')
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
            title: title || 'SocialDL',
            text: 'Saved with SocialDL',
            url: savedFile.uri,
            dialogTitle: 'Save or Share'
          })
        } catch (shareErr) {
          console.error('Share notice:', shareErr)
          await triggerHaptic('error')
        } finally {
          setDownloadingToDevice(false)
        }
      }
    } catch (err) {
      setDownloadingToDevice(false)
      await triggerHaptic('error')
      alert(`Could not save file: ${err.message}`)
    }
  }

  // Strict Client-Side URL Validation
  const validateUrl = (rawUrl) => {
    const trimmed = (rawUrl || '').trim()
    if (!trimmed) {
      return 'Please enter or paste a video link.'
    }

    if (!/^https?:\/\//i.test(trimmed) || trimmed.includes('\n') || trimmed.includes(' ')) {
      return 'Please enter a valid link starting with http:// or https://'
    }

    try {
      const parsed = new URL(trimmed)
      const host = parsed.hostname.toLowerCase()

      // Ensure it has a valid domain with a dot
      if (!host.includes('.')) {
        return 'Please enter a valid web link.'
      }

      // Check against supported platforms
      const isKnown =
        host.includes('tiktok.com') ||
        host.includes('youtube.com') ||
        host.includes('youtu.be') ||
        host.includes('twitter.com') ||
        host.includes('x.com') ||
        host.includes('instagram.com') ||
        host.includes('facebook.com') ||
        host.includes('fb.watch')

      if (!isKnown) {
        return 'Please paste a link from TikTok, YouTube, X, Instagram, or Facebook.'
      }
    } catch {
      return 'Please enter a valid video URL.'
    }

    return null
  }

  // Friendly error sanitization
  const sanitizeErrorMessage = (raw) => {
    if (!raw) return 'Unable to load video. Please check the link and try again.'
    const str = String(raw)
    if (str.includes('not a valid URL') || str.includes('Unsupported URL') || str.includes('ERROR: [generic]')) {
      return 'Please enter a valid video link from TikTok, YouTube, X, or Instagram.'
    }
    if (str.includes('bot') || str.includes('Sign in') || str.includes('confirm you’re not a robot')) {
      return 'This video requires account sign-in or is private. Try another public video.'
    }
    if (
      str.includes('Failed to fetch') ||
      str.includes('NetworkError') ||
      str.includes('Unexpected end of JSON') ||
      str.includes('405') ||
      str.includes('502') ||
      str.includes('504')
    ) {
      return 'Backend service is connecting. Please try again in a few moments.'
    }
    return str.length > 90 ? `${str.slice(0, 85)}...` : str
  }

  // 1-Tap Paste
  const handlePasteFromClipboard = async () => {
    await triggerHaptic('light')
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text && text.trim()) {
          const clean = text.trim()
          setUrl(clean)
          setError(null)
          await triggerHaptic('success')
          handleInspectUrl(clean)
          return
        }
      }
    } catch (e) {
      console.warn('Clipboard notice:', e)
    }

    const fallbackVal = prompt('Paste link:')
    if (fallbackVal && fallbackVal.trim()) {
      const clean = fallbackVal.trim()
      setUrl(clean)
      setError(null)
      handleInspectUrl(clean)
    }
  }

  // Handle platform button selection (Does NOT auto-download dummy links)
  const handlePlatformClick = (platformId) => {
    triggerHaptic('selection')
    if (selectedPlatform === platformId) {
      setSelectedPlatform(null)
    } else {
      setSelectedPlatform(platformId)
    }
    setError(null)
    inputRef.current?.focus()
  }

  // Inspect URL / Fetch Media
  const handleInspectUrl = async (targetUrl = url) => {
    await triggerHaptic('medium')
    const finalUrl = (targetUrl || '').trim()

    // Validate
    const validationError = validateUrl(finalUrl)
    if (validationError) {
      await triggerHaptic('error')
      setError(validationError)
      return
    }

    // Auto-sync platform pill
    try {
      const parsed = new URL(finalUrl)
      const host = parsed.hostname.toLowerCase()
      if (host.includes('tiktok.com')) setSelectedPlatform('TikTok')
      else if (host.includes('youtube.com') || host.includes('youtu.be')) setSelectedPlatform('YouTube')
      else if (host.includes('twitter.com') || host.includes('x.com')) setSelectedPlatform('X')
      else if (host.includes('instagram.com')) setSelectedPlatform('Instagram')
      else if (host.includes('facebook.com') || host.includes('fb.watch')) setSelectedPlatform('Facebook')
    } catch {
      // non-critical
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

      const rawText = await res.text()
      let data = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch (jsonErr) {
        console.warn('Non-JSON response:', rawText, jsonErr)
      }

      if (!res.ok) {
        throw new Error(data.detail || `Server returned status ${res.status}.`)
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
      setError(sanitizeErrorMessage(err.message))
    } finally {
      setLoadingInfo(false)
    }
  }

  // Start Download
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

      const rawText = await res.text()
      let data = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch (jsonErr) {
        console.warn('Non-JSON response:', rawText, jsonErr)
      }

      if (!res.ok) {
        throw new Error(data.detail || `Download request failed (${res.status}).`)
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
        filesize_formatted: 'Readying...'
      })

      connectToJobSSE(taskId)
    } catch (err) {
      await triggerHaptic('error')
      setError(sanitizeErrorMessage(err.message))
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

          saveToHistory({
            id: taskId,
            title: update.title || mediaInfo?.title || 'Saved Video',
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
        console.error('SSE notice:', err)
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
                title: data.task.title || mediaInfo?.title || 'Saved Video',
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

  // Dynamic input placeholder based on selected platform
  const currentPlaceholder =
    PLATFORMS.find((p) => p.id === selectedPlatform)?.placeholder ||
    'Paste TikTok, YouTube, X, or Instagram link...'

  // Filtered History
  const filteredHistory = history.filter((item) => {
    if (libraryFilter === 'video') return item.ext === 'mp4' || item.ext === 'webm' || !item.ext
    if (libraryFilter === 'audio') return item.ext === 'mp3' || item.ext === 'm4a'
    return true
  })

  return (
    <div className="app-shell">
      {/* Top Header: 3-Lines Menu + Title + APK Button */}
      <header className="app-header">
        <div className="brand-section">
          <button
            className="btn-menu-toggle"
            onClick={() => {
              triggerHaptic('light')
              setShowSidebar(true)
            }}
            aria-label="Open Navigation Menu"
          >
            <Menu size={22} />
          </button>
          <span className="brand-text-name">
            Social<span>DL</span>
          </span>
        </div>

        <div className="header-actions">
          {showApkPrompts && (
            <a
              href={APK_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-apk-header"
              title="Download Android APK"
            >
              <Smartphone size={13} />
              <span>APK</span>
            </a>
          )}
          <div className="status-dot-wrap" title="Engine Status">
            <span className={`status-dot ${isOnline ? 'active' : ''}`} />
          </div>
        </div>
      </header>

      {/* Slide-out Navigation Sidebar Drawer */}
      {showSidebar && (
        <>
          <div
            className="sidebar-backdrop"
            onClick={() => setShowSidebar(false)}
          />
          <aside className="sidebar-drawer">
            <div className="sidebar-header">
              <span className="sidebar-brand">
                Social<span>DL</span>
              </span>
              <button
                className="sidebar-close-btn"
                onClick={() => setShowSidebar(false)}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="sidebar-nav-list">
              <button
                className={`sidebar-nav-item ${activeNav === 'saver' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setActiveNav('saver')
                  setShowSidebar(false)
                }}
              >
                <Download size={20} />
                <span>Saver</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeNav === 'library' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setActiveNav('library')
                  setShowSidebar(false)
                }}
              >
                <Folder size={20} />
                <span>Downloads Library</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeNav === 'apps' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setActiveNav('apps')
                  setShowSidebar(false)
                }}
              >
                <LayoutGrid size={20} />
                <span>Supported Apps</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeNav === 'settings' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection')
                  setActiveNav('settings')
                  setShowSidebar(false)
                }}
              >
                <Settings size={20} />
                <span>About & Credits</span>
              </button>
            </nav>

            <div className="sidebar-footer">
              {showApkPrompts && (
                <a
                  href={APK_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="sidebar-apk-btn"
                >
                  <Smartphone size={16} />
                  <span>Download Android APK</span>
                </a>
              )}
              <div className="sidebar-credits-text">
                Built with ❤️ by{' '}
                <a
                  href="https://nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)', fontWeight: 700, textDecoration: 'none' }}
                >
                  King-Austin
                </a>
                <br />
                <a
                  href="https://social.nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  social.nworahebuka.com.ng
                </a>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Scrollable Content Body (Scrolls freely between fixed header and sticky bottom nav) */}
      <main className="scroll-body">
        {/* ============================================================== */}
        {/* TAB 1: SAVER (HOME) */}
        {/* ============================================================== */}
        {activeNav === 'saver' && (
          <div key="saver" className="tab-pane-animate">
            {/* Minimal Hero */}
            <div className="hero-box">
              <h1>
                Save Any Video. <br />
                <span>Fast & Clean.</span>
              </h1>
            </div>

            {/* Main Action Card */}
            <div className="form-card">
              {/* URL Input Box */}
              <div className="url-input-container">
                <input
                  ref={inputRef}
                  type="url"
                  className="url-input"
                  placeholder={currentPlaceholder}
                  value={url}
                  onChange={(e) => {
                    const val = e.target.value
                    setUrl(val)
                    if (error) setError(null)
                    try {
                      if (val.includes('://')) {
                        const parsed = new URL(val.trim())
                        const host = parsed.hostname.toLowerCase()
                        if (host.includes('tiktok.com')) setSelectedPlatform('TikTok')
                        else if (host.includes('youtube.com') || host.includes('youtu.be')) setSelectedPlatform('YouTube')
                        else if (host.includes('twitter.com') || host.includes('x.com')) setSelectedPlatform('X')
                        else if (host.includes('instagram.com')) setSelectedPlatform('Instagram')
                        else if (host.includes('facebook.com') || host.includes('fb.watch')) setSelectedPlatform('Facebook')
                      }
                    } catch {
                      // non-critical
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInspectUrl()}
                />
                {url ? (
                  <button
                    className="btn-clear-url"
                    onClick={() => {
                      setUrl('')
                      setMediaInfo(null)
                      setError(null)
                    }}
                    title="Clear"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <button
                    className="btn-paste-action"
                    onClick={handlePasteFromClipboard}
                    title="Paste from clipboard"
                  >
                    <ClipboardPaste size={13} />
                    PASTE
                  </button>
                )}
              </div>

              {/* Large Download Button */}
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
                    <RefreshCw size={18} className="spin-indicator" />
                    Finding Media...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    DOWNLOAD NOW
                  </>
                )}
              </button>

              {/* Platform Selector Chips (Does NOT inject hardcoded dummy URLs) */}
              <div className="platform-select-section">
                <span className="platform-select-label">Select platform (optional):</span>
                <div className="samples-row">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      className={`sample-pill-btn ${selectedPlatform === p.id ? 'active' : ''}`}
                      onClick={() => handlePlatformClick(p.id)}
                      title={`Select ${p.name}`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Graceful Error Card */}
            {error && (
              <div className="error-card">
                <AlertCircle size={18} style={{ color: 'var(--error)', flexShrink: 0 }} />
                <div className="error-card-text">{error}</div>
                <button
                  className="error-card-close"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Active Download Progress Card */}
            {jobState && (
              <div className="active-job-box">
                <div className="job-header-row">
                  <div className="job-title-group">
                    {jobState.status === 'completed' ? (
                      <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                    ) : jobState.status === 'failed' ? (
                      <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                    ) : (
                      <RefreshCw size={18} className="spin-indicator" style={{ color: 'var(--accent-orange)' }} />
                    )}
                    <span className="job-status-heading">
                      {jobState.status === 'queued' && 'Starting...'}
                      {jobState.status === 'downloading' && `Downloading (${jobState.progress}%)`}
                      {jobState.status === 'processing' && 'Finishing up...'}
                      {jobState.status === 'completed' && 'Ready!'}
                      {jobState.status === 'failed' && 'Download paused'}
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
                  <div style={{ marginTop: '2px' }}>
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
                            <RefreshCw size={16} className="spin-indicator" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Share2 size={16} />
                            Save to Phone / Share
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
                        <Download size={16} />
                        Download File ({jobState.filesize_formatted || 'Save'})
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Inspect Media Details */}
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
                        <Video size={22} />
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

                {/* Segmented Format Switcher */}
                <div className="segmented-toggle">
                  <button
                    className={`segmented-toggle-btn ${activeTab === 'video' ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection')
                      setActiveTab('video')
                    }}
                  >
                    <Video size={15} />
                    Video (HD)
                  </button>
                  <button
                    className={`segmented-toggle-btn ${activeTab === 'audio' ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection')
                      setActiveTab('audio')
                    }}
                  >
                    <Music size={15} />
                    Audio (MP3)
                  </button>
                </div>

                {/* Formats list */}
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
                          <Download size={13} />
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
                          <Download size={13} />
                          Extract
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Android Mobile App Card (Hidden when running inside the installed app) */}
            {showApkPrompts && (
              <div className="apk-banner-card">
                <div className="apk-banner-text">
                  <h3>📱 Android Mobile App</h3>
                  <p>Install SocialDL on your phone for 1-tap saving.</p>
                </div>
                <a
                  href={APK_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-apk-install"
                >
                  <Download size={14} />
                  Download APK
                </a>
              </div>
            )}

            {/* Recent Downloads Section */}
            <div className="section-title-row">
              <span className="section-title">Recent</span>
              {history.length > 0 && (
                <button
                  className="section-action-link"
                  onClick={() => {
                    triggerHaptic('light')
                    setActiveNav('library')
                  }}
                >
                  See All
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="recent-empty-card">
                <Clock size={20} className="recent-empty-icon" />
                <div className="recent-empty-texts">
                  <div className="recent-empty-title">No recent downloads yet</div>
                  <div className="recent-empty-subtitle">
                    Paste a link above and tap download to save your first video
                  </div>
                </div>
              </div>
            ) : (
              <div className="recent-items-list">
                {history.slice(0, 2).map((item) => (
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
                        <Play size={12} fill="currentColor" />
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

                    <div style={{ display: 'flex', gap: '6px' }}>
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
                          <Share2 size={15} />
                        </button>
                      ) : (
                        <div
                          className="recent-circle-btn"
                          style={{ cursor: 'default', color: 'var(--success)' }}
                        >
                          <Check size={15} />
                        </div>
                      )}

                      <button
                        className="recent-circle-btn delete-btn"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        title="Remove from history"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <footer className="app-credits-footer">
              <div>
                SocialDL • Built by{' '}
                <a
                  href="https://nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
                >
                  King-Austin
                </a>
              </div>
              <div>
                <a
                  href="https://social.nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                >
                  social.nworahebuka.com.ng
                </a>
              </div>
            </footer>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: LIBRARY */}
        {/* ============================================================== */}
        {activeNav === 'library' && (
          <div key="library" className="tab-pane-animate">
            <div className="hero-box">
              <h1>Downloads</h1>
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

            {filteredHistory.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 1rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Folder size={38} style={{ color: 'var(--border-focus)' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No saved downloads yet</div>
                <button
                  className="btn-download-primary"
                  style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem' }}
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
                        <Play size={12} fill="currentColor" />
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
                          <Share2 size={15} />
                        </button>
                      )}
                      <button
                        className="recent-circle-btn delete-btn"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        title="Delete from history"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleClearHistory}
                  style={{
                    background: 'transparent',
                    border: '1px dashed var(--error)',
                    color: 'var(--error)',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  Clear History
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: APPS (TikTok, YouTube, X, Instagram) */}
        {/* ============================================================== */}
        {activeNav === 'apps' && (
          <div key="apps" className="tab-pane-animate">
            <div className="hero-box">
              <h1>Apps</h1>
            </div>

            <div className="apps-grid-box">
              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setSelectedPlatform('TikTok')
                  setActiveNav('saver')
                  inputRef.current?.focus()
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>🎵</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>TikTok</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  1080p No Watermark
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setSelectedPlatform('YouTube')
                  setActiveNav('saver')
                  inputRef.current?.focus()
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>▶️</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>YouTube</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  4K / HD Video & MP3
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setSelectedPlatform('X')
                  setActiveNav('saver')
                  inputRef.current?.focus()
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>✖️</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>X (Twitter)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Video Posts & Clips
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setSelectedPlatform('Instagram')
                  setActiveNav('saver')
                  inputRef.current?.focus()
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>📷</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Instagram</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Reels & Video Posts
                </div>
              </div>

              <div
                className="app-card-item"
                onClick={() => {
                  triggerHaptic('light')
                  setSelectedPlatform('Facebook')
                  setActiveNav('saver')
                  inputRef.current?.focus()
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>👥</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Facebook</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Watch, Reels & Videos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: SETTINGS (About & Credits) */}
        {/* ============================================================== */}
        {activeNav === 'settings' && (
          <div key="settings" className="tab-pane-animate">
            <div className="hero-box">
              <h1>About</h1>
            </div>

            {/* Official Credits Card */}
            <div className="settings-card" style={{ borderLeft: '4px solid var(--accent-orange)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                SocialDL
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Built by</span>
                <a
                  href="https://nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}
                >
                  King-Austin
                </a>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Website</span>
                <a
                  href="https://social.nworahebuka.com.ng/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)', fontWeight: 600, fontSize: '0.88rem' }}
                >
                  social.nworahebuka.com.ng
                </a>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Platform</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {isNative ? 'Android App (Native)' : isStandalone ? 'Standalone Web App' : 'Web Edition'}
                </span>
              </div>
              <div className="settings-item-row">
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>App Version</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  v{CURRENT_APP_VERSION}
                </span>
              </div>
              {isNative && (
                <div className="settings-item-row">
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Live Updates</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                    Active ⚡
                  </span>
                </div>
              )}
              <div className="settings-item-row">
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Engine Status</span>
                <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                  Online 🟢
                </span>
              </div>
            </div>

            {/* In-App OTA Manual Check Button */}
            {isNative && (
              <button
                onClick={handleManualOtaCheck}
                disabled={checkingOta}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-card)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '11px 16px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <RefreshCw size={15} className={checkingOta ? 'spin-indicator' : ''} />
                <span>{checkingOta ? 'Checking server...' : otaStatusMessage || 'Check for Updates'}</span>
              </button>
            )}

            {/* Android Mobile App (APK) - Hidden inside native app */}
            {showApkPrompts ? (
              <div className="apk-banner-card">
                <div className="apk-banner-text">
                  <h3>📱 Android Mobile App</h3>
                  <p>Install SocialDL on your phone for 1-tap saving.</p>
                </div>
                <a
                  href={APK_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-apk-install"
                >
                  <Download size={14} />
                  Download APK
                </a>
              </div>
            ) : isNative ? (
              <div
                className="apk-banner-card"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  boxShadow: 'none'
                }}
              >
                <div className="apk-banner-text">
                  <h3 style={{ color: 'var(--text-primary)' }}>📱 Native Android App</h3>
                  <p>SocialDL Mobile Edition • Version 1.0.0</p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: 'var(--success)',
                    fontWeight: 700,
                    fontSize: '0.84rem'
                  }}
                >
                  <CheckCircle2 size={16} />
                  Installed
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* STICKY BOTTOM NAV DOCK (No curved border, stays pinned at bottom regardless of scroll) */}
      <nav className="bottom-nav-dock">
        <button
          className={`nav-tab-item ${activeNav === 'saver' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('saver')
          }}
        >
          <Download size={20} />
          <span className="nav-tab-label">Saver</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'library' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('library')
          }}
        >
          <Folder size={20} />
          <span className="nav-tab-label">Library</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'apps' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('apps')
          }}
        >
          <LayoutGrid size={20} />
          <span className="nav-tab-label">Apps</span>
        </button>

        <button
          className={`nav-tab-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection')
            setActiveNav('settings')
          }}
        >
          <Settings size={20} />
          <span className="nav-tab-label">About</span>
        </button>
      </nav>

      {/* Exit Notice Toast */}
      {showExitToast && (
        <div className="exit-notice-toast">
          <AlertCircle size={15} style={{ color: 'var(--accent-orange)' }} />
          <span>Tap back again to exit</span>
        </div>
      )}
    </div>
  )
}
