import type { Episode } from '../../types';

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

interface AudioControlsProps {
  episode: Episode;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
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
  onPlayPause,
  onSeek,
  onSkip,
  onRateChange,
}: AudioControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const cycleRate = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    onRateChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  return (
    <div className="bg-[#0d0f14] border-t border-[#1e2330]">
      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted w-10 text-right tabular-nums">{fmt(currentTime)}</span>
          <div className="flex-1 relative h-3 flex items-center">
            {/* filled track */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] bg-accent rounded-l-full pointer-events-none"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full relative z-10"
              style={{ background: 'transparent' }}
            />
          </div>
          <span className="text-xs text-muted w-10 tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-2">
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
              {episode.title}
            </p>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* -10s */}
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

          {/* Play/Pause */}
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

          {/* +10s */}
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

          {/* Speed */}
          <button
            className="px-2.5 h-9 text-xs font-semibold text-slate-400 hover:text-accent transition-colors rounded-lg hover:bg-white/5 tabular-nums"
            onClick={cycleRate}
          >
            {playbackRate}×
          </button>
        </div>
      </div>
    </div>
  );
}
