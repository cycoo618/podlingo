import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary';
import { useAuth } from '../../contexts/AuthContext';
import type { SavedWord, SavedSentence } from '../../hooks/useVocabulary';

type Filter = 'all' | 'word' | 'sentence';

export default function VocabPage() {
  const navigate = useNavigate();
  const { items, removeItem } = useVocabulary();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = items.filter((item) => filter === 'all' || item.type === filter);

  const counts = {
    all:      items.length,
    word:     items.filter((i) => i.type === 'word').length,
    sentence: items.filter((i) => i.type === 'sentence').length,
  };

  const handleJump = (item: SavedSentence) => {
    navigate(`/player/${item.episodeId}`, { state: { seekTo: item.startTime } });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <button
          className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          onClick={() => navigate('/')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">我的笔记</p>
          {user && <p className="text-xs text-muted">{user.displayName}</p>}
        </div>
        <span className="text-xs text-muted tabular-nums">{counts[filter]} 条</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-1">
        {(['all', 'word', 'sentence'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-accent/20 text-accent'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {f === 'all' && '全部'}
            {f === 'word' && (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M4 6h16M4 12h8M4 18h12" strokeLinecap="round"/>
                </svg>
                单词
              </>
            )}
            {f === 'sentence' && (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                句子
              </>
            )}
            <span className="opacity-60 tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#6ee7b7" opacity="0.6">
              <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <p className="text-white font-medium mb-1">
            {filter === 'all' ? '还没有收藏' : filter === 'word' ? '还没有收藏单词' : '还没有收藏句子'}
          </p>
          <p className="text-sm text-muted">
            {filter === 'sentence'
              ? '在播放页悬停句子，点击书签图标即可收藏整句话。'
              : '点击任意单词可以查看释义，点击书签图标即可保存。'}
          </p>
        </div>
      )}

      {/* Item list */}
      <div className="px-4 py-3 space-y-3">
        {filtered.map((item) =>
          item.type === 'word'
            ? <WordCard key={item.id} item={item} onRemove={() => removeItem(item.id)} />
            : <SentenceCard key={item.id} item={item} onRemove={() => removeItem(item.id)} onJump={() => handleJump(item)} formatTime={formatTime} />
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}

// ── Word card ─────────────────────────────────────────────────────────────────
function WordCard({ item, onRemove }: { item: SavedWord; onRemove: () => void }) {
  return (
    <div
      className="bg-surface-2 rounded-2xl p-4 border"
      style={{ borderColor: 'var(--clr-border3)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold text-base">{item.word}</span>
          {item.phonetic && (
            <span className="text-muted text-xs font-mono">{item.phonetic}</span>
          )}
          {/* Type tag */}
          <span className="text-[10px] bg-purple/20 text-purple px-1.5 py-0.5 rounded-md font-medium">单词</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.partOfSpeech && (
            <span className="text-xs bg-purple/20 text-purple px-2 py-0.5 rounded-lg">
              {item.partOfSpeech}
            </span>
          )}
          <button
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {item.definitions.map((def, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-accent font-medium shrink-0">{i + 1}.</span>
            <span className="text-slate-300 leading-snug">{def}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted mt-2">
        {new Date(item.savedAt).toLocaleDateString('zh-CN')}
      </p>
    </div>
  );
}

// ── Sentence card ─────────────────────────────────────────────────────────────
function SentenceCard({
  item, onRemove, onJump, formatTime,
}: {
  item: SavedSentence;
  onRemove: () => void;
  onJump: () => void;
  formatTime: (s: number) => string;
}) {
  return (
    <div
      className="bg-surface-2 rounded-2xl p-4 border"
      style={{ borderColor: 'var(--clr-border3)' }}
    >
      {/* Top row: type tag + actions */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-md font-medium">句子</span>
          <span className="text-[10px] text-muted truncate max-w-[140px]">{item.podcastName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Jump to video */}
          <button
            onClick={onJump}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
            title="跳转至视频原位"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            {formatTime(item.startTime)}
          </button>
          <button
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* English sentence */}
      <p className="text-slate-200 text-sm leading-relaxed mb-1.5">{item.enText}</p>
      {/* Chinese translation */}
      {item.cnText && (
        <p className="text-slate-400 text-xs leading-relaxed" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
          {item.cnText}
        </p>
      )}

      <p className="text-[10px] text-muted mt-2">
        {new Date(item.savedAt).toLocaleDateString('zh-CN')}
      </p>
    </div>
  );
}
