import { useState, useRef, useEffect } from 'react';
import type { Episode, Chapter } from '../../types';

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];

interface AudioControlsProps {
  episode: Episode;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  chapters?: Chapter[];
  /** When set, replaces the episode title in the bottom bar */
  chapterLabel?: string;
  /** Index of currently-playing chapter (for highlight in popover) */
  selectedChapterIdx?: number;
  /** Called when user picks a chapter from the popover */
  onSelectChapter?: (idx: number) => void;
  /** Returns true if a chapter index should be locked */
  isChapterLocked?: (idx: number) => boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (delta: number) => void;
  onRateChange: (rate: number) => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioControls({
  episode,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  chapters,
  chapterLabel,
  selectedChapterIdx,
  onSelectChapter,
  isChapterLocked,
  onPlayPause,
  onSeek,
  onSkip,
  onRateChange,
}: AudioControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const speedBtnRef = useRef<HTMLButtonElement>(null);
  const chapterBtnRef = useRef<HTMLButtonElement>(null);
  const hasChapterMenu = !!(chapters && chapters.length > 1 && onSelectChapter);

  // Close menus when clicking outside
  useEffect(() => {
    if (!showSpeedMenu && !showChapterMenu) return;
    const handleClick = (e: Event) => {
      if (showSpeedMenu && speedBtnRef.current && !speedBtnRef.current.parentElement?.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
      if (showChapterMenu && chapterBtnRef.current && !chapterBtnRef.current.parentElement?.contains(e.target as Node)) {
        setShowChapterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [showSpeedMenu, showChapterMenu]);

  return (
    <div
      className="bg-bg border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted w-10 text-right tabular-nums">{fmt(currentTime)}</span>
          <div className="flex-1 relative h-3 flex items-center">
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] bg-accent rounded-l-full pointer-events-none"
              style={{ width: `${progress}%` }}
            />
            {/* Chapter tick marks (skip first chapter — startTime=0 is the bar start) */}
            {chapters && duration > 0 && chapters.slice(1).map((ch) => (
              <div
                key={ch.id}
                className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/35 pointer-events-none z-10"
                style={{ left: `${(ch.startTime / duration) * 100}%` }}
              />
            ))}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full relative z-20"
              style={{ background: 'transparent' }}
            />
          </div>
          <span className="text-xs text-muted w-10 tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      {/* Main controls row */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3">
        {/* Cover + info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <img
            src={episode.coverImage}
            alt={episode.podcastName}
            className="w-10 h-10 rounded-xl object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">{episode.podcastName}</p>
            <p className="text-sm text-slate-200 font-medium truncate leading-tight mt-0.5">
              {chapterLabel ?? episode.title}
            </p>
          </div>
        </div>

        {/* Skip + Play + Speed */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            onClick={() => onSkip(-10)}
            title="Back 10s"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="12" y="16" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">10</text>
            </svg>
          </button>

          <button
            className="w-12 h-12 flex items-center justify-center bg-accent text-bg rounded-full hover:bg-accent/90 transition-colors shrink-0 shadow-lg"
            onClick={onPlayPause}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <button
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            onClick={() => onSkip(10)}
            title="Forward 10s"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              <text x="12" y="16" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">10</text>
            </svg>
          </button>

          {/* Chapter list button + popover */}
          {hasChapterMenu && (
            <div className="relative">
              {showChapterMenu && (
                <div
                  className="absolute bottom-full right-0 mb-2 w-56 rounded-xl shadow-2xl border overflow-hidden"
                  style={{ backgroundColor: 'var(--clr-speed-bg)', borderColor: 'var(--clr-border2)', maxHeight: '52vh', overflowY: 'auto' }}
                >
                  {chapters!.map((ch, idx) => {
                    const isActive = idx === selectedChapterIdx;
                    const locked = isChapterLocked?.(idx) ?? false;
                    const mins = Math.round((ch.endTime - ch.startTime) / 60);
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          if (locked) return;
                          onSelectChapter!(idx);
                          setShowChapterMenu(false);
                        }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left border-b transition-colors ${
                          isActive
                            ? 'text-accent bg-accent/10 border-accent/10'
                            : locked
                            ? 'text-slate-600 cursor-default border-white/5'
                            : 'text-slate-300 hover:text-white hover:bg-white/5 border-white/5'
                        }`}
                      >
                        <span className={`text-[11px] font-bold w-4 shrink-0 text-right tabular-nums ${isActive ? 'text-accent' : 'text-muted'}`}>
                          {idx + 1}
                        </span>
                        <span className={`flex-1 text-xs leading-snug truncate ${isActive ? 'font-semibold' : ''}`}>
                          {ch.title}
                        </span>
                        <span className="text-[11px] text-muted tabular-nums shrink-0">{mins}m</span>
                        {isActive && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="#6ee7b7" className="shrink-0">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        )}
                        {locked && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                ref={chapterBtnRef}
                onClick={() => setShowChapterMenu((v) => !v)}
                className={`h-9 px-2 flex items-center justify-center rounded-lg transition-colors ${
                  showChapterMenu ? 'text-accent bg-accent/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title="小节"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="15" y2="12"/>
                  <line x1="3" y1="18" x2="10" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Speed button with upward popover */}
          <div className="relative">
            {showSpeedMenu && (
              <div
                className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-xl border"
                style={{ backgroundColor: 'var(--clr-speed-bg)', borderColor: 'var(--clr-border2)' }}
              >
                {[...SPEEDS].reverse().map((speed) => (
                  <button
                    key={speed}
                    onClick={() => { onRateChange(speed); setShowSpeedMenu(false); }}
                    className={`block w-full px-5 py-2.5 text-sm font-semibold tabular-nums text-center transition-colors ${
                      playbackRate === speed
                        ? 'text-accent bg-accent/10'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {speed === 1 ? '1×' : `${speed}×`}
                  </button>
                ))}
              </div>
            )}
            <button
              ref={speedBtnRef}
              onClick={() => setShowSpeedMenu((v) => !v)}
              className={`h-9 px-2 flex items-center justify-center text-xs font-semibold tabular-nums rounded-lg transition-colors ${
                showSpeedMenu
                  ? 'text-accent bg-accent/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Playback speed"
            >
              {playbackRate === 1 ? '1×' : `${playbackRate}×`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
