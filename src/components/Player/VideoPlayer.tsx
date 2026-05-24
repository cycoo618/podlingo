import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react';

/** Public control handle exposed via ref */
export interface VideoHandle {
  play(): void;
  pause(): void;
  seekTo(time: number): void;
  setPlaybackRate(rate: number): void;
}

interface VideoPlayerProps {
  src: string;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

// ── Minimal YT IFrame API types ──────────────────────────────────────────────
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLIFrameElement | string,
        opts: {
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number; target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { PLAYING: 1; PAUSED: 2; ENDED: 0 };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ── One-time YT API loader ───────────────────────────────────────────────────
let _ytState: 'idle' | 'loading' | 'ready' = 'idle';
const _ytQueue: Array<() => void> = [];

function ensureYTApi(onReady: () => void) {
  if (_ytState === 'ready') { onReady(); return; }
  _ytQueue.push(onReady);
  if (_ytState === 'idle') {
    _ytState = 'loading';
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = () => {
      _ytState = 'ready';
      _ytQueue.forEach(cb => cb());
      _ytQueue.length = 0;
    };
  }
}

// ── Component ────────────────────────────────────────────────────────────────
const VideoPlayer = forwardRef<VideoHandle, VideoPlayerProps>(
  ({ src, onTimeUpdate, onLoadedMetadata, onPlay, onPause }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const ytRef    = useRef<YTPlayer | null>(null);
    const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
    const nativeRef = useRef<HTMLVideoElement>(null);

    // Keep callback refs current so event handlers never go stale
    const cbTime  = useRef(onTimeUpdate);
    const cbMeta  = useRef(onLoadedMetadata);
    const cbPlay  = useRef(onPlay);
    const cbPause = useRef(onPause);
    cbTime.current  = onTimeUpdate;
    cbMeta.current  = onLoadedMetadata;
    cbPlay.current  = onPlay;
    cbPause.current = onPause;

    // Expose control API via ref
    useImperativeHandle(ref, () => ({
      play()  {
        if (ytRef.current) ytRef.current.playVideo();
        else nativeRef.current?.play();
      },
      pause() {
        if (ytRef.current) ytRef.current.pauseVideo();
        else nativeRef.current?.pause();
      },
      seekTo(time: number) {
        if (ytRef.current) {
          // time is transcript-relative; YouTube expects absolute video time
          const srcOffset = (() => {
            try {
              const params = new URLSearchParams(new URL(src).search);
              return parseFloat(params.get('start') ?? '0') || 0;
            } catch { return 0; }
          })();
          ytRef.current.seekTo(time + srcOffset, true);
          cbTime.current(time);
        } else if (nativeRef.current) {
          nativeRef.current.currentTime = time;
        }
      },
      setPlaybackRate(rate: number) {
        if (ytRef.current) ytRef.current.setPlaybackRate(rate);
        else if (nativeRef.current) nativeRef.current.playbackRate = rate;
      },
    }), []);

    // YouTube IFrame API setup
    useEffect(() => {
      if (!src.includes('youtube.com/embed')) return;

      // Parse ?start=N offset so getCurrentTime() → transcript-relative time
      const startOffset = (() => {
        try {
          const params = new URLSearchParams(new URL(src).search);
          return parseFloat(params.get('start') ?? '0') || 0;
        } catch { return 0; }
      })();

      let mounted = true;

      const stopPoll = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };

      ensureYTApi(() => {
        if (!mounted || !iframeRef.current) return;

        const player = new window.YT!.Player(iframeRef.current, {
          events: {
            onReady: (e) => {
              if (!mounted) return;
              ytRef.current = e.target;
            },
            onStateChange: (e) => {
              if (!mounted) return;
              if (e.data === 1 /* PLAYING */) {
                if (!pollRef.current) {
                  pollRef.current = setInterval(() => {
                    if (ytRef.current) cbTime.current(ytRef.current.getCurrentTime() - startOffset);
                  }, 100);
                }
                cbPlay.current?.();
              } else if (e.data === 2 /* PAUSED */ || e.data === 0 /* ENDED */) {
                stopPoll();
                if (e.data === 2) cbPause.current?.();
              }
            },
          },
        });
        if (mounted) ytRef.current = player;
      });

      return () => {
        mounted = false;
        stopPoll();
        ytRef.current?.destroy();
        ytRef.current = null;
      };
    }, [src]);

    // ── YouTube branch ───────────────────────────────────────────────────────
    if (src.includes('youtube.com/embed')) {
      return (
        <div className="w-full bg-black" style={{ aspectRatio: '16/9' }}>
          <iframe
            ref={iframeRef}
            src={src}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="YouTube video player"
          />
        </div>
      );
    }

    // ── Native video branch ──────────────────────────────────────────────────
    return (
      <div className="relative bg-black" style={{ height: 220 }}>
        <video
          ref={nativeRef}
          src={src}
          className="w-full h-full object-contain"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
          onPlay={onPlay}
          onPause={onPause}
          onClick={(e) => {
            const v = e.currentTarget;
            v.paused ? v.play() : v.pause();
          }}
          playsInline
        />
        <div className="absolute inset-0 pointer-events-none" />
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
export default VideoPlayer;
