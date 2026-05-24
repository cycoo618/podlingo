import { useNavigate } from 'react-router-dom';
import type { Episode } from '../../types';

interface EpisodeCardProps {
  episode: Episode;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m} min`;
}

export default function EpisodeCard({ episode }: EpisodeCardProps) {
  const navigate = useNavigate();

  return (
    <button
      className="w-full text-left bg-[#161920] hover:bg-[#1a1f2e] border border-[#1e2330] rounded-2xl overflow-hidden transition-all duration-200 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 group"
      onClick={() => navigate(`/player/${episode.id}`)}
    >
      <div className="flex gap-4 p-4">
        {/* Cover */}
        <div className="relative shrink-0">
          <img
            src={episode.coverImage}
            alt={episode.podcastName}
            className="w-16 h-16 rounded-xl object-cover"
          />
          {episode.videoUrl && (
            <div className="absolute -bottom-1 -right-1 bg-purple rounded-md px-1.5 py-0.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <p className="text-xs text-accent font-medium mb-1">{episode.podcastName}</p>
            <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
              {episode.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {episode.chapters && episode.chapters.length > 0 ? (
              <span className="text-xs text-muted">
                {episode.chapters.length} chapters · {fmt(episode.duration)}
              </span>
            ) : (
              <span className="text-xs text-muted">{fmt(episode.duration)}</span>
            )}
            <span className="text-[#2a3348]">·</span>
            <span className="text-xs bg-[#0d0f14] border border-[#2a3348] text-slate-400 px-2 py-0.5 rounded-lg">
              {episode.language === 'en-zh' ? '🇺🇸 → 🇨🇳' : '🇨🇳 → 🇺🇸'}
            </span>
            {episode.videoUrl && (
              <>
                <span className="text-[#2a3348]">·</span>
                <span className="text-xs bg-purple/10 text-purple px-2 py-0.5 rounded-lg">VIDEO</span>
              </>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="shrink-0 flex items-center text-muted group-hover:text-accent transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 pb-4">
        <p className="text-xs text-muted leading-relaxed line-clamp-2">{episode.description}</p>
      </div>
    </button>
  );
}
