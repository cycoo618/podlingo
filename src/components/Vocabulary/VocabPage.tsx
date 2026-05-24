import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary';
import { useAuth } from '../../contexts/AuthContext';

export default function VocabPage() {
  const navigate = useNavigate();
  const { vocab, removeWord } = useVocabulary();
  const { user } = useAuth();

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
          <p className="text-sm font-semibold text-white">My Vocabulary</p>
          {user && <p className="text-xs text-muted">{user.displayName}</p>}
        </div>
        <span className="text-xs text-muted tabular-nums">{vocab.length} words</span>
      </div>

      {/* Empty state */}
      {vocab.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#6ee7b7" opacity="0.6">
              <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <p className="text-white font-medium mb-1">No saved words yet</p>
          <p className="text-sm text-muted">Tap any word while listening to look it up, then press the bookmark icon to save it here.</p>
        </div>
      )}

      {/* Word list */}
      <div className="px-4 py-4 space-y-3">
        {vocab.map((item) => (
          <div
            key={item.id}
            className="bg-surface-2 rounded-2xl p-4 border"
            style={{ borderColor: 'var(--clr-border3)' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-white font-semibold text-base">{item.word}</span>
                {item.phonetic && (
                  <span className="text-muted text-xs font-mono ml-2">{item.phonetic}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.partOfSpeech && (
                  <span className="text-xs bg-purple/20 text-purple px-2 py-0.5 rounded-lg">
                    {item.partOfSpeech}
                  </span>
                )}
                <button
                  onClick={() => removeWord(item.id)}
                  className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                  title="Remove"
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
        ))}
      </div>

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
}
