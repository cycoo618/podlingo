import { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockEpisodes } from '../../data/mockEpisodes';
import TranscriptView from './TranscriptView';
import AudioControls from './AudioControls';
import VideoPlayer from './VideoPlayer';
import type { VideoHandle } from './VideoPlayer';

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const episode = mockEpisodes.find((e) => e.id === id);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<VideoHandle>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(episode?.duration ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [navVisible, setNavVisible] = useState(true);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleTranscriptTap = useCallback(() => {
    if (isPlaying && !navVisible) {
      showNav();
      scheduleNavHide();
    }
  }, [isPlaying, navVisible, showNav, scheduleNavHide]);

  if (!episode) {
    return (
      <div className="flex items-center justify-center h-screen text-muted">
        Episode not found.
      </div>
    );
  }

  const isVideo = !!episode.videoUrl;

  return (
    <div className="flex flex-col bg-bg overflow-hidden" style={{ height: '100dvh' }}>
      {/* Top nav — auto-hides while playing */}
      <div
        className={`flex items-center justify-between px-4 h-14 border-b border-[#1e2330] shrink-0 transition-all duration-300 overflow-hidden ${
          navVisible ? 'opacity-100 max-h-14' : 'opacity-0 max-h-0 border-b-0'
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
            {episode.title}
          </p>
        </div>
        <button className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </div>

      {/* Video player (video mode only) */}
      {isVideo && episode.videoUrl && (
        <div className="shrink-0">
          <VideoPlayer
            ref={videoRef}
            src={episode.videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={setDuration}
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
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Transcript — wrapper catches taps to restore nav while playing */}
      <TranscriptView
        episode={episode}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        onPlayPause={handlePlayPause}
        onTap={handleTranscriptTap}
      />

      {/* Audio controls */}
      <div className="shrink-0">
        <AudioControls
          episode={episode}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSkip={handleSkip}
          onRateChange={handleRateChange}
        />
      </div>
    </div>
  );
}
