import type { Sentence, SentenceStatus, WordEntry, WordMapping } from '../../types';

// Words too short/common to produce meaningful CN matches
const STOPWORDS = new Set([
  'the', 'a', 'an', 'it', "it's", "'s", 'is', 'not', "n't", 'will',
  'that', 'this', 'these', 'those', 'be', 'are', 'was', 'were', 'have',
  'has', 'had', 'do', 'does', 'did', 'of', 'in', 'on', 'at', 'to',
  'for', 'and', 'or', 'but', 'so', 'yet', 'as', 'by', 'up', 'out',
  'with', 'from', 'about', 'than', 'then', 'when', 'where', 'who',
  'what', 'how', 'if', 'we', 'you', 'he', 'she', 'they', 'i', 'me',
  'my', 'your', 'our', 'its', '--', '—', ',', '.', ':', ';', '!', '?',
]);

function getCnHighlightRanges(
  activeWordText: string,
  wordMappings: WordMapping[]
): { start: number; end: number }[] {
  const lower = activeWordText.toLowerCase().trim();
  if (!lower || STOPWORDS.has(lower)) return [];

  const matches: { start: number; end: number }[] = [];
  for (const m of wordMappings) {
    // Whole-word match: every token of the active word must appear as a
    // whole token in the mapping phrase (prevents "it" matching "ambition")
    const mTokens = m.enWord.toLowerCase().split(/\s+/);
    const aTokens = lower.split(/\s+/);
    const isMatch = aTokens.every((tok) => mTokens.includes(tok));
    if (isMatch) matches.push({ start: m.cnStart, end: m.cnEnd });
  }
  return matches;
}

function renderCnText(
  cnText: string,
  highlights: { start: number; end: number }[]
) {
  if (highlights.length === 0) return <span>{cnText}</span>;

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const { start, end } of sorted) {
    if (start > cursor) segments.push({ text: cnText.slice(cursor, start), highlighted: false });
    segments.push({ text: cnText.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < cnText.length) segments.push({ text: cnText.slice(cursor), highlighted: false });

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark key={i} className="bg-highlight/25 text-highlight/90 rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

const STATUS_STYLES: Record<SentenceStatus, string> = {
  past: 'opacity-25',
  active: 'opacity-100',
  upcoming: 'opacity-40',
};

interface SentenceBlockProps {
  sentence: Sentence;
  status: SentenceStatus;
  activeWordIndex: number;
  onWordClick: (wordText: string, entry: WordEntry | undefined, rect: DOMRect) => void;
  onSeek: (time: number) => void;
}

export default function SentenceBlock({
  sentence,
  status,
  activeWordIndex,
  onWordClick,
  onSeek,
}: SentenceBlockProps) {
  const activeWord = sentence.words[activeWordIndex];
  const cnHighlights =
    status === 'active' && activeWord
      ? getCnHighlightRanges(activeWord.text, sentence.wordMappings)
      : [];

  return (
    <div
      className={`group relative flex gap-3 transition-opacity duration-300 ${STATUS_STYLES[status]}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Active indicator / replay button */}
      <div
        className={`absolute -left-4 top-0 bottom-0 w-0.5 rounded-full transition-opacity duration-300 ${
          status === 'active' ? 'bg-accent opacity-100' : 'opacity-0'
        }`}
      />
      {/* Replay-from-here button (non-active sentences) */}
      {status !== 'active' && (
        <button
          className="absolute -left-5 top-1 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-accent transition-all"
          onClick={(e) => { e.stopPropagation(); onSeek(sentence.startTime); }}
          title="从这里开始"
          aria-label="从这里开始"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <polygon points="0,0 10,5 0,10" />
          </svg>
        </button>
      )}

      <div className="flex-1 space-y-1.5">
        {/* English line */}
        <p className="text-base leading-relaxed text-slate-200 select-none">
          {sentence.words.map((word, i) => {
            const isActiveWord = status === 'active' && i === activeWordIndex;
            const hasEntry = !!word.entry;
            // Clickable if the cleaned word has ≥2 letters
            const cleanedLen = word.text.trim().replace(/[^a-zA-Z'-]/g, '').length;
            const isClickable = cleanedLen >= 2;

            return (
              <span
                key={i}
                className={`inline transition-all duration-150 rounded-sm ${
                  isActiveWord
                    ? 'bg-highlight/30 text-highlight font-semibold px-0.5'
                    : ''
                } ${
                  hasEntry
                    ? 'cursor-pointer hover:text-accent hover:underline decoration-accent/50 underline-offset-2'
                    : isClickable
                    ? 'cursor-pointer hover:text-slate-100'
                    : ''
                }`}
                onClick={
                  isClickable
                    ? (e) => {
                        e.stopPropagation();
                        onWordClick(word.text, word.entry, (e.target as HTMLElement).getBoundingClientRect());
                      }
                    : undefined
                }
              >
                {word.text}
              </span>
            );
          })}
        </p>

        {/* Chinese translation line */}
        <p className="text-sm leading-relaxed text-slate-400 font-light" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
          {renderCnText(sentence.cnText, cnHighlights)}
        </p>
      </div>
    </div>
  );
}
