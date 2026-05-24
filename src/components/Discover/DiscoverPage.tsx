import { mockEpisodes } from '../../data/mockEpisodes';
import EpisodeCard from './EpisodeCard';

export default function DiscoverPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#6ee7b7">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-tight">PodLingo</span>
        </div>
        <h1 className="text-2xl font-bold text-white mt-4 leading-tight">
          Discover
        </h1>
        <p className="text-sm text-muted mt-1">
          Learn languages through real podcasts
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {['All', 'Psychology', 'Sports', 'Tech', 'Business'].map((tag, i) => (
          <button
            key={tag}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              i === 0
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-transparent text-muted border-[#1e2330] hover:border-slate-500'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Episode list */}
      <div className="px-5 space-y-3 pb-8">
        <p className="text-xs text-muted uppercase tracking-wider mb-3">Featured</p>
        {mockEpisodes.map((ep) => (
          <EpisodeCard key={ep.id} episode={ep} />
        ))}
      </div>
    </div>
  );
}
