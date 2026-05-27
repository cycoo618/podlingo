import { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockEpisodes } from '../../data/mockEpisodes';
import TranscriptView from './TranscriptView';
import type { FontSize } from './TranscriptView';
import AudioControls from './AudioControls';
import VideoPlayer from './VideoPlayer';
import type { VideoHandle } from './VideoPlayer';
import { useEpisodeProgress } from '../../hooks/useEpisodeProgress';
import { useAuth } from '../../contexts/AuthContext';

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { premium } = useAuth();
  const episode = mockEpisodes.find((e) => e.id === id);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<VideoHandle>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(episode?.duration ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Preview mode: non-premium users can listen to first 60 seconds of premium episodes
  const isPreview = !!episode?.premium && !premium;
  const PREVIEW_LIMIT = 60; // seconds
  const [previewEnded, setPreviewEnded] = useState(false);

  // Persist playback rate across sessions
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('podlingo_rate') ?? '1') || 1; }
    catch { return 1; }
  });
  const [fontSize, setFontSize] = useState<FontSize>('base');
  const [theme, setTheme] = useState<'night' | 'day'>('night');
  const [showSettings, setShowSettings] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  const { getSavedPosition, markProgress, markChapterComplete } =
    useEpisodeProgress(episode?.id ?? '');
  const [navVisible, setNavVisible] = useState(true);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme to <html> so index.css [data-theme='day'] selectors fire
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'day' ? 'day' : '');
  }, [theme]);

  // Close settings panel on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handle = (e: MouseEvent) => {
      if (
        settingsPanelRef.current && !settingsPanelRef.current.contains(e.target as Node) &&
        settingsBtnRef.current && !settingsBtnRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showSettings]);

  // After any explicit seek, freeze the displayed time for ~700 ms.
  // This prevents two classes of flash:
  //   (a) YouTube keyframe lands slightly before sentence.startTime → old time < target → would show prev sentence
  //   (b) Polling reads the OLD position (above target) before seek completes → premature floor release
  // While frozen the display stays at the seeked time; normal tracking resumes after the freeze.
  const seekFreezeRef = useRef(false);
  const seekFreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTimeUpdate = useCallback((time: number) => {
    if (seekFreezeRef.current) return;   // frozen — ignore all media updates
    setCurrentTime(time);
  }, []);

  // Enforce preview limit
  useEffect(() => {
    if (!isPreview || previewEnded) return;
    if (currentTime >= PREVIEW_LIMIT) {
      setPreviewEnded(true);
      if (episode?.videoUrl) videoRef.current?.pause();
      else if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [currentTime, isPreview, previewEnded, episode?.videoUrl]);

  const activateSeekFreeze = useCallback(() => {
    seekFreezeRef.current = true;
    if (seekFreezeTimerRef.current) clearTimeout(seekFreezeTimerRef.current);
    seekFreezeTimerRef.current = setTimeout(() => {
      seekFreezeRef.current = false;
      seekFreezeTimerRef.current = null;
    }, 700);
  }, []);

  // Simulated time ticker for demo (when no real audio/video)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-hide nav while playing
  const scheduleNavHide = useCallback(() => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      setNavVisible(false);
    }, 3000);
  }, []);

  const showNav = useCallback(() => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    setNavVisible(true);
  }, []);

  // When play/pause state changes, manage nav visibility
  useEffect(() => {
    if (isPlaying) {
      scheduleNavHide();
    } else {
      showNav();
    }
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, [isPlaying, scheduleNavHide, showNav]);

  const startTicker = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 0.1 * playbackRate;
        const dur = episode?.duration ?? 0;
        if (next >= dur) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setIsPlaying(false);
          return dur;
        }
        return next;
      });
    }, 100);
  }, [playbackRate, episode?.duration]);

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    // Video (YouTube or native) via VideoHandle
    if (episode?.videoUrl) {
      const vh = videoRef.current;
      if (vh) {
        // isPlaying state is updated via onPlay / onPause callbacks from VideoPlayer
        if (isPlaying) vh.pause();
        else vh.play();
        return;
      }
    }
    // Audio element
    const audioEl = audioRef.current;
    if (audioEl) {
      if (audioEl.paused) { audioEl.play(); setIsPlaying(true); }
      else { audioEl.pause(); setIsPlaying(false); }
      return;
    }
    // Demo ticker (no media)
    if (timerRef.current) {
      stopTicker();
      setIsPlaying(false);
    } else {
      startTicker();
      setIsPlaying(true);
    }
  }, [episode?.videoUrl, isPlaying, startTicker, stopTicker]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    activateSeekFreeze();
    if (episode?.videoUrl) {
      videoRef.current?.seekTo(time);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, [episode?.videoUrl, activateSeekFreeze]);

  const handleSkip = useCallback((delta: number) => {
    setCurrentTime((t) => {
      const next = Math.max(0, Math.min(t + delta, duration));
      if (episode?.videoUrl) {
        videoRef.current?.seekTo(next);
      } else if (audioRef.current) {
        audioRef.current.currentTime = next;
      }
      return next;
    });
    activateSeekFreeze();
  }, [duration, episode?.videoUrl, activateSeekFreeze]);

  const handleRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    try { localStorage.setItem('podlingo_rate', String(rate)); } catch { /* ignore */ }
    if (episode?.videoUrl) {
      videoRef.current?.setPlaybackRate(rate);
      return;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      return;
    }
    // Demo ticker — restart with new rate
    if (isPlaying) {
      stopTicker();
      setTimeout(() => startTicker(), 0);
    }
  }, [isPlaying, episode?.videoUrl, startTicker, stopTicker]);

  // sync ticker rate when playbackRate changes
  useEffect(() => {
    const hasRealMedia = !!(episode?.videoUrl ? videoRef.current : audioRef.current);
    if (isPlaying && !hasRealMedia) {
      stopTicker();
      startTicker();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRate]);

  useEffect(() => {
    return () => stopTicker();
  }, [stopTicker]);

  // Space bar → play / pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      handlePlayPause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause]);

  // Like handleSeek but keeps transcript display at `time` while seeking video
  // 0.2s earlier — prevents the first word of a sentence being clipped by a
  // keyframe landing just after the sentence boundary.
  const handleSentenceSeek = useCallback((time: number) => {
    setCurrentTime(time);          // transcript stays at the clicked sentence
    activateSeekFreeze();
    const seekTime = Math.max(0, time - 0.2);
    if (episode?.videoUrl) {
      videoRef.current?.seekTo(seekTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  }, [episode?.videoUrl, activateSeekFreeze]);

  const handleTranscriptTap = useCallback(() => {
    if (isPlaying && !navVisible) {
      showNav();
      scheduleNavHide();
    }
  }, [isPlaying, navVisible, showNav, scheduleNavHide]);

  // ── Active chapter (derived, no extra state) ─────────────────────────────
  const chapters = episode?.chapters;
  const activeChapterIdx = chapters
    ? chapters.findIndex(ch => currentTime >= ch.startTime && currentTime < ch.endTime)
    : -1;
  // When between chapters (gap) fall back to last chapter whose startTime ≤ currentTime
  const effectiveChapterIdx = activeChapterIdx !== -1
    ? activeChapterIdx
    : (chapters
        ? chapters.reduce((best, ch, i) => (ch.startTime <= currentTime ? i : best), 0)
        : 0);
  const activeChapter = chapters?.[effectiveChapterIdx] ?? null;

  // ── Auto-resume: seek to saved position once media reports its duration ───
  const didAutoResumeRef = useRef(false);
  const handleLoadedMetadata = useCallback((dur: number) => {
    setDuration(dur);
    if (!didAutoResumeRef.current) {
      didAutoResumeRef.current = true;
      // Restore saved playback rate (YouTube player resets to 1× on load)
      if (playbackRate !== 1) {
        setTimeout(() => videoRef.current?.setPlaybackRate(playbackRate), 300);
      }
      const saved = getSavedPosition();
      if (saved > 1) {
        // Small delay so VideoPlayer's internal state settles before seeking
        setTimeout(() => handleSeek(saved), 300);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSavedPosition, playbackRate]);

  // ── Save progress every 5s while playing ─────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !episode || !activeChapter) return;
    const chId = activeChapter.id;
    markProgress(currentTime, chId);
    // Mark chapter complete when within 10s of its end
    if (currentTime >= activeChapter.endTime - 10) {
      markChapterComplete(chId, currentTime);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(currentTime / 5)]); // fires at most once per 5-second bucket

  if (!episode) {
    return (
      <div className="flex items-center justify-center h-screen text-muted">
        Episode not found.
      </div>
    );
  }

  const isVideo = !!episode.videoUrl;

  return (
    <div className="relative flex flex-col bg-bg overflow-hidden" style={{ height: '100dvh' }}>
      {/* Preview-ended overlay */}
      {previewEnded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 backdrop-blur-sm px-8 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-lg mb-1">试听结束</p>
            <p className="text-muted text-sm leading-relaxed">免费试听 1 分钟已结束。<br/>升级 PRO 账号即可解锁完整内容。</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-accent border border-accent/30 px-5 py-2.5 rounded-2xl hover:bg-accent/10 transition-colors"
          >
            返回首页
          </button>
        </div>
      )}
      {/* Top nav — auto-hides while playing */}
      <div
        className={`flex items-center justify-between px-4 h-14 border-b border-border shrink-0 transition-all duration-300 overflow-hidden ${
          navVisible ? 'opacity-100 max-h-14' : 'opacity-0 max-h-0 border-b-0 pointer-events-none'
        }`}
      >
        <button
          className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          onClick={() => navigate('/')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="text-center min-w-0 px-2">
          <p className="text-xs text-muted truncate">{episode.podcastName}</p>
          <p className="text-sm font-medium text-slate-200 truncate max-w-[220px] leading-tight">
            {activeChapter ? activeChapter.title : episode.title}
          </p>
          {activeChapter && chapters && chapters.length > 1 && (
            <p className="text-[10px] text-muted/60 mt-0.5">
              {effectiveChapterIdx + 1} / {chapters.length}
            </p>
          )}
        </div>
        <button
          ref={settingsBtnRef}
          className={`w-9 h-9 flex items-center justify-center transition-colors rounded-lg hover:bg-white/5 ${
            showSettings ? 'text-accent' : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setShowSettings((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </div>

      {/* Settings panel — floats below the nav, outside overflow-hidden */}
      {showSettings && (
        <div
          ref={settingsPanelRef}
          className="absolute top-14 right-4 z-50 bg-surface-2 rounded-2xl shadow-2xl p-4 min-w-[192px] border"
          style={{ borderColor: 'var(--clr-border3)' }}
        >
          {/* Font size */}
          <p className="text-xs text-muted mb-2 font-medium tracking-wide">字体大小</p>
          <div className="flex gap-2 mb-4">
            {([
              { key: 'sm', label: '小', cls: 'text-sm' },
              { key: 'base', label: '中', cls: 'text-base' },
              { key: 'lg', label: '大', cls: 'text-lg' },
            ] as { key: FontSize; label: string; cls: string }[]).map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setFontSize(key)}
                className={`flex-1 py-2 rounded-xl border transition-colors ${cls} ${
                  fontSize === key
                    ? 'bg-accent/20 border-accent/50 text-accent'
                    : 'text-slate-400 hover:text-white'
                }`}
                style={fontSize !== key ? { borderColor: 'var(--clr-border3)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Theme */}
          <p className="text-xs text-muted mb-2 font-medium tracking-wide">主题</p>
          <div className="flex gap-2">
            {([
              { key: 'night', label: '深色' },
              { key: 'day', label: '浅色' },
            ] as { key: 'night' | 'day'; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${
                  theme === key
                    ? 'bg-accent/20 border-accent/50 text-accent'
                    : 'text-slate-400 hover:text-white'
                }`}
                style={theme !== key ? { borderColor: 'var(--clr-border3)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video player (video mode only) */}
      {isVideo && episode.videoUrl && (
        <div className="shrink-0">
          <VideoPlayer
            ref={videoRef}
            src={episode.videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </div>
      )}

      {/* Hidden audio element */}
      {!isVideo && episode.audioUrl && (
        <audio
          ref={audioRef}
          src={episode.audioUrl}
          onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Transcript — wrapper catches taps to restore nav while playing */}
      <TranscriptView
        episode={episode}
        currentTime={currentTime}
        onSeek={handleSeek}
        onSentenceSeek={handleSentenceSeek}
        onPlayPause={handlePlayPause}
        onTap={handleTranscriptTap}
        fontSize={fontSize}
      />

      {/* Audio controls */}
      <div className="shrink-0">
        <AudioControls
          episode={episode}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          chapters={chapters}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSkip={handleSkip}
          onRateChange={handleRateChange}
        />
      </div>
    </div>
  );
}
