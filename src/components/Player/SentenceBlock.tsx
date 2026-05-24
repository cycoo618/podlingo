import type { Sentence, SentenceStatus, WordEntry } from '../../types';

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
  onSentenceClick: (startTime: number) => void;
}

export default function SentenceBlock({
  sentence,
  status,
  activeWordIndex,
  onWordClick,
  onSentenceClick,
}: SentenceBlockProps) {
  return (
    <div
      className={`group relative flex gap-3 transition-opacity duration-300 ${STATUS_STYLES[status]}`}
      onClick={(e) => {
        e.stopPropagation();
        onSentenceClick(sentence.startTime);
      }}
    >
      {/* Active indicator */}
      <div
        className={`absolute -left-4 top-0 bottom-0 w-0.5 rounded-full transition-opacity duration-300 ${
          status === 'active' ? 'bg-accent opacity-100' : 'opacity-0'
        }`}
      />

      <div className="flex-1 space-y-1.5">
        {/* English line */}
        <p className="text-base leading-relaxed text-slate-200 select-none">
          {sentence.words.map((word, i) => {
            const isActiveWord = status === 'active' && i === activeWordIndex;
            const hasEntry = !!word.entry;
            const cleanedLen = word.text.trim().replace(/[^a-zA-Z'-]/g, '').length;
            const isClickable = cleanedLen >= 2;

            return (
              <span
                key={i}
                className={`inline transition-colors duration-150 rounded-sm ${
                  isActiveWord
                    ? 'bg-highlight/25 text-highlight'
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
                        onWordClick(
                          word.text,
                          word.entry,
                          (e.target as HTMLElement).getBoundingClientRect(),
                        );
                      }
                    : undefined
                }
              >
                {word.text}
              </span>
            );
          })}
        </p>

        {/* Chinese translation — no highlighting */}
        <p
          className="text-sm leading-relaxed text-slate-400 font-light"
          style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
        >
          {sentence.cnText}
        </p>
      </div>
    </div>
  );
}
