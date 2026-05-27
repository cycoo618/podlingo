import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { snapChaptersToBoundaries } from '../../utils/snapChapters';
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

  // ── Chapter mode ──────────────────────────────────────────────────────────
  const rawChapters = episode?.chapters ?? [];
  const hasChapters = rawChapters.length > 1;
  // Start on chapter 0 directly (no selection screen)
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number | null>(0);
  const [chapterEnded, setChapterEnded] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set to true when user dismisses the chapter-end overlay so the detection
  // effect won't immediately re-trigger while currentTime is still at chapterEnd.
  // Reset to false whenever a new chapter begins (in selectChapter).
  const chapterEndAckedRef = useRef(false);

  // Snap chapter boundaries to natural sentence-pause break points
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chapters = useMemo(() => snapChaptersToBoundaries(rawChapters, episode?.transcript ?? []), [episode?.id]);

  // Derived chapter values (safe when no chapters: fall back to full episode)
  const selectedChapter = selectedChapterIdx !== null ? (chapters[selectedChapterIdx] ?? null) : null;
  const chapterStart = selectedChapter?.startTime ?? 0;
  const chapterEnd = selectedChapter?.endTime ?? (episode?.duration ?? 0);
  const chapterDuration = Math.max(1, chapterEnd - chapterStart);
  const chapterCurrentTime = Math.max(0, Math.min(currentTime - chapterStart, chapterDuration));

  // Chapter 0 is always free; idx ≥ 1 requires premium on premium episodes
  const isChapterLocked = (idx: number): boolean => !!episode?.premium && !premium && idx > 0;

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

  const activateSeekFreeze = useCallback(() => {
    seekFreezeRef.current = true;
    if (seekFreezeTimerRef.current) clearTimeout(seekFreezeTimerRef.current);
    seekFreezeTimerRef.current = setTimeout(() => {
      seekFreezeRef.current = false;
      seekFreezeTimerRef.current = null;
    }, 700);
  }, []);

  // Select a chapter: seek to its start and begin playback
  const selectChapter = useCallback((idx: number) => {
    const ch = chapters[idx];
    if (!ch) return;
    chapterEndAckedRef.current = false;
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSelectedChapterIdx(idx);
    setChapterEnded(false);
    setCountdown(3);
    const seekTime = ch.startTime;
    setCurrentTime(seekTime);
    activateSeekFreeze();
    setTimeout(() => {
      if (episode?.videoUrl) {
        videoRef.current?.seekTo(seekTime);
        videoRef.current?.play();
      } else if (audioRef.current) {
        audioRef.current.currentTime = seekTime;
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, episode?.videoUrl, activateSeekFreeze]);

  // Detect end of current chapter
  useEffect(() => {
    if (selectedChapterIdx === null || chapterEnded || !selectedChapter || chapterEndAckedRef.current) return;
    if (currentTime >= chapterEnd - 0.3) {
      setChapterEnded(true);
      if (episode?.videoUrl) videoRef.current?.pause();
      else if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, chapterEnd, chapterEnded, selectedChapterIdx, episode?.videoUrl]);

  // 3-second countdown then auto-advance to next chapter
  useEffect(() => {
    if (!chapterEnded || selectedChapterIdx === null) return;
    const nextIdx = selectedChapterIdx + 1;
    if (nextIdx >= chapters.length || isChapterLocked(nextIdx)) return;
    setCountdown(3);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          selectChapter(nextIdx);
          return 3;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterEnded, selectedChapterIdx]);

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
      const lo = selectedChapter ? chapterStart : 0;
      const hi = selectedChapter ? chapterEnd : duration;
      const next = Math.max(lo, Math.min(t + delta, hi));
      if (episode?.videoUrl) {
        videoRef.current?.seekTo(next);
      } else if (audioRef.current) {
        audioRef.current.currentTime = next;
      }
      return next;
    });
    activateSeekFreeze();
  }, [duration, chapterStart, chapterEnd, selectedChapter, episode?.videoUrl, activateSeekFreeze]);

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
  const activeChapterIdx = chapters.length > 0
    ? chapters.findIndex(ch => currentTime >= ch.startTime && currentTime < ch.endTime)
    : -1;
  // When between chapters (gap) fall back to last chapter whose startTime ≤ currentTime
  const effectiveChapterIdx = activeChapterIdx !== -1
    ? activeChapterIdx
    : chapters.reduce((best, ch, i) => (ch.startTime <= currentTime ? i : best), 0);
  const activeChapter = chapters[effectiveChapterIdx] ?? null;

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
      // In chapter mode the user selects which chapter to resume — skip auto-resume
      if (!hasChapters) {
        const saved = getSavedPosition();
        if (saved > 1) {
          setTimeout(() => handleSeek(saved), 300);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSavedPosition, playbackRate, hasChapters]);

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

  // Chapter duration string for display
  return (
    <div className="relative flex flex-col bg-bg overflow-hidden" style={{ height: '100dvh' }}>

      {/* ── Chapter-ended overlay ──────────────────────────────────────────── */}
      {chapterEnded && selectedChapterIdx !== null && (() => {
        const nextIdx = selectedChapterIdx + 1;
        const nextChapter = chapters[nextIdx];
        const nextLocked = nextChapter ? isChapterLocked(nextIdx) : false;
        return (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 backdrop-blur-sm px-8 text-center gap-5">
            {/* Check icon */}
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-lg mb-1">第 {selectedChapterIdx + 1} 小节完成</p>
              <p className="text-muted text-sm">{chapters[selectedChapterIdx]?.title}</p>
            </div>

            {nextChapter && !nextLocked ? (
              // Auto-advance to next chapter
              <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                <p className="text-xs text-muted">下一章</p>
                <p className="text-sm font-semibold text-white">{nextChapter.title}</p>
                <button
                  onClick={() => {
                    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                    selectChapter(nextIdx);
                  }}
                  className="w-full bg-accent text-bg font-semibold text-sm py-3 rounded-2xl hover:bg-accent/90 transition-colors"
                >
                  立即播放（{countdown}s）
                </button>
                <button
                  onClick={() => {
                    chapterEndAckedRef.current = true;
                    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                    setChapterEnded(false);
                  }}
                  className="text-sm text-muted hover:text-white transition-colors"
                >
                  取消
                </button>
              </div>
            ) : nextChapter && nextLocked ? (
              // Next chapter is locked
              <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <p className="text-sm text-muted leading-relaxed">后续小节需要 PRO 账号<br/>升级即可解锁全集内容</p>
                <button
                  onClick={() => { chapterEndAckedRef.current = true; setChapterEnded(false); }}
                  className="text-sm text-accent border border-accent/30 px-5 py-2.5 rounded-2xl hover:bg-accent/10 transition-colors"
                >
                  知道了
                </button>
              </div>
            ) : (
              // Last chapter
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-muted">已完成全部小节 🎉</p>
                <button
                  onClick={() => navigate('/')}
                  className="text-sm text-accent border border-accent/30 px-5 py-2.5 rounded-2xl hover:bg-accent/10 transition-colors"
                >
                  返回首页
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Top nav — auto-hides while playing */}
      <div
        className={`flex items-center justify-between px-4 h-14 border-b border-border shrink-0 transition-all duration-300 overflow-hidden lg:opacity-100 lg:max-h-14 lg:border-b lg:pointer-events-auto ${
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

          {/* Vocab link */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--clr-border3)' }}>
            <button
              onClick={() => { navigate('/vocab'); setShowSettings(false); }}
              className="w-full flex items-center gap-2.5 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              单词本
            </button>
          </div>
        </div>
      )}

      {/* ── Body: single-column on mobile, two-column on desktop ────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* LEFT column (desktop) / TOP section (mobile): media + controls */}
        <div className="lg:w-2/3 lg:shrink-0 lg:flex lg:flex-col lg:border-r lg:border-border lg:overflow-hidden">
          {/* Video */}
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

          {/* Desktop: fill remaining space, show controls at bottom */}
          <div className="hidden lg:flex lg:flex-col lg:flex-1">
            {/* Audio-only: show cover art centered */}
            {!isVideo && (
              <div className="flex-1 flex items-center justify-center p-10">
                <img
                  src={episode.coverImage}
                  alt={episode.podcastName}
                  className="w-52 h-52 rounded-2xl object-cover shadow-2xl"
                />
              </div>
            )}
            {/* Video: spacer pushes controls to bottom */}
            {isVideo && <div className="flex-1" />}
            {/* Controls pinned to bottom of left column */}
            <div className="shrink-0">
              <AudioControls
                episode={episode}
                currentTime={hasChapters ? chapterCurrentTime : currentTime}
                duration={hasChapters ? chapterDuration : duration}
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                chapters={hasChapters ? chapters : (episode.chapters ?? undefined)}
                chapterLabel={selectedChapter ? `${selectedChapterIdx! + 1}. ${selectedChapter.title}` : undefined}
                selectedChapterIdx={selectedChapterIdx ?? undefined}
                onSelectChapter={hasChapters ? selectChapter : undefined}
                isChapterLocked={hasChapters ? isChapterLocked : undefined}
                onPlayPause={handlePlayPause}
                onSeek={hasChapters ? (t) => handleSeek(chapterStart + t) : handleSeek}
                onSkip={handleSkip}
                onRateChange={handleRateChange}
              />
            </div>
          </div>
        </div>

        {/* RIGHT column (desktop) / BOTTOM section (mobile): transcript + mobile controls */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TranscriptView
            episode={episode}
            currentTime={currentTime}
            onSeek={handleSeek}
            onSentenceSeek={handleSentenceSeek}
            onPlayPause={handlePlayPause}
            onTap={handleTranscriptTap}
            fontSize={fontSize}
          />

          {/* Mobile only: audio controls below transcript */}
          <div className="shrink-0 lg:hidden">
            <AudioControls
              episode={episode}
              currentTime={hasChapters ? chapterCurrentTime : currentTime}
              duration={hasChapters ? chapterDuration : duration}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              chapters={hasChapters ? chapters : (episode.chapters ?? undefined)}
              chapterLabel={selectedChapter ? `${selectedChapterIdx! + 1}. ${selectedChapter.title}` : undefined}
              selectedChapterIdx={selectedChapterIdx ?? undefined}
              onSelectChapter={hasChapters ? selectChapter : undefined}
              isChapterLocked={hasChapters ? isChapterLocked : undefined}
              onPlayPause={handlePlayPause}
              onSeek={hasChapters ? (t) => handleSeek(chapterStart + t) : handleSeek}
              onSkip={handleSkip}
              onRateChange={handleRateChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
