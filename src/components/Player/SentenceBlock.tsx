import { Fragment } from 'react';
import type { Sentence, SentenceStatus, WordEntry } from '../../types';
import type { FontSize } from './TranscriptView';
import { normalizeWord } from '../../utils/normalizeWord';

const STATUS_STYLES: Record<SentenceStatus, string> = {
  past: 'opacity-25',
  active: 'opacity-100',
  upcoming: 'opacity-40',
};

const EN_SIZES: Record<FontSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

const CN_SIZES: Record<FontSize, string> = {
  sm: 'text-xs',
  base: 'text-sm',
  lg: 'text-base',
};

interface SentenceBlockProps {
  sentence: Sentence;
  status: SentenceStatus;
  activeWordIndex: number;
  onWordClick: (wordText: string, entry: WordEntry | undefined, rect: DOMRect) => void;
  onSentenceClick: (startTime: number) => void;
  fontSize?: FontSize;
}

export default function SentenceBlock({
  sentence,
  status,
  activeWordIndex,
  onWordClick,
  onSentenceClick,
  fontSize = 'base',
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
        <p className={`${EN_SIZES[fontSize]} leading-relaxed text-slate-200 select-none`}>
          {sentence.words.map((word, i) => {
            const isActiveWord = status === 'active' && i === activeWordIndex;
            const hasEntry = !!word.entry;
            // Always work with the trimmed core — spaces are handled separately below
            const core = word.text.trim();
            const displayText = normalizeWord(core);
            const cleanedLen = core.replace(/[^a-zA-Z'-]/g, '').length;
            const isClickable = cleanedLen >= 2;

            return (
              // Fragment so we can place the inter-word space OUTSIDE the
              // highlighted span. This prevents the background box from
              // including a leading space (which caused visible gaps in JRE
              // where WhisperX strips leading whitespace from word tokens).
              <Fragment key={i}>
                {i > 0 && ' '}
                <span
                  className={`inline transition-colors duration-150 rounded-sm ${
                    isActiveWord ? 'bg-highlight/25 text-highlight' : ''
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
                            displayText,
                            word.entry,
                            (e.target as HTMLElement).getBoundingClientRect(),
                          );
                        }
                      : undefined
                  }
                >
                  {displayText}
                </span>
              </Fragment>
            );
          })}
        </p>

        {/* Chinese translation */}
        <p
          className={`${CN_SIZES[fontSize]} leading-relaxed text-slate-400 font-light`}
          style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
        >
          {sentence.cnText}
        </p>
      </div>
    </div>
  );
}
