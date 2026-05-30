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

const ZH_CHAR_SIZES: Record<FontSize, string> = {
  sm: 'text-lg',
  base: 'text-xl',
  lg: 'text-2xl',
};

const ZH_PINYIN_SIZES: Record<FontSize, string> = {
  sm: 'text-[9px]',
  base: 'text-[10px]',
  lg: 'text-xs',
};

interface SentenceBlockProps {
  sentence: Sentence;
  status: SentenceStatus;
  activeWordIndex: number;
  language?: 'en-zh' | 'zh-en';
  onWordClick: (wordText: string, entry: WordEntry | undefined, rect: DOMRect) => void;
  onSentenceClick: (startTime: number) => void;
  onSaveSentence?: (sentence: Sentence) => void;
  isSentenceSaved?: boolean;
  fontSize?: FontSize;
}

export default function SentenceBlock({
  sentence,
  status,
  activeWordIndex,
  language = 'en-zh',
  onWordClick,
  onSentenceClick,
  onSaveSentence,
  isSentenceSaved = false,
  fontSize = 'base',
}: SentenceBlockProps) {
  return (
    <div
      className={`group relative flex gap-3 transition-opacity duration-300 ${STATUS_STYLES[status]}`}
      data-sentence-id={sentence.id}
      data-start-time={sentence.startTime}
      data-cn-text={sentence.cnText}
      onClick={(e) => {
        e.stopPropagation();
        // Don't seek if user just finished a text-selection drag
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
        onSentenceClick(sentence.startTime);
      }}
    >
      {/* Active indicator */}
      <div
        className={`absolute -left-4 top-0 bottom-0 w-0.5 rounded-full transition-opacity duration-300 ${
          status === 'active' ? 'bg-accent opacity-100' : 'opacity-0'
        }`}
      />

      {/* Bookmark button — always faintly visible, full on hover/saved */}
      {onSaveSentence && (
        <button
          className={`absolute -right-1 top-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150
            ${isSentenceSaved
              ? 'text-accent opacity-100'
              : 'text-slate-500 opacity-20 group-hover:opacity-70 hover:text-accent hover:bg-white/5'
            }`}
          onClick={(e) => {
            e.stopPropagation();
            onSaveSentence(sentence);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSaveSentence(sentence);
          }}
          title="收藏句子"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isSentenceSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      <div className="flex-1 space-y-1.5">
        {language === 'zh-en' ? (
          <>
            {/* Chinese words with pinyin above each character/word */}
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {sentence.words.map((word, i) => {
                const isActiveWord = status === 'active' && i === activeWordIndex;
                const isChinese = /[一-鿿]/.test(word.text);
                // CI TypeScript doesn't recognise optional fields on Word/Sentence
                // even though they're declared; use explicit casts as workaround.
                const wordPinyin = (word as { pinyin?: string }).pinyin;
                const sentenceEnText = (sentence as { enText?: string }).enText;
                return (
                  <span
                    key={i}
                    className={`inline-flex flex-col items-center rounded px-0.5 transition-colors duration-150 ${
                      isActiveWord ? 'bg-highlight/25' : ''
                    } ${isChinese ? 'cursor-pointer hover:bg-accent/15' : ''}`}
                    onClick={
                      isChinese
                        ? (e) => {
                            e.stopPropagation();
                            const entry: WordEntry = {
                              word: word.text,
                              phonetic: wordPinyin ?? '',
                              partOfSpeech: '',
                              definitions: [],
                              contextEn: sentenceEnText ?? '',
                              contextCn: sentence.words.map((w) => w.text).join(''),
                              highlightInContext: word.text,
                            };
                            onWordClick(word.text, entry, (e.target as HTMLElement).getBoundingClientRect());
                          }
                        : undefined
                    }
                  >
                    <span
                      className={`${ZH_PINYIN_SIZES[fontSize]} leading-none font-mono ${
                        isActiveWord ? 'text-highlight' : 'text-slate-500'
                      }`}
                    >
                      {wordPinyin ?? ''}</span>
                    <span
                      className={`${ZH_CHAR_SIZES[fontSize]} leading-tight ${
                        isActiveWord ? 'text-highlight' : 'text-slate-200'
                      }`}
                      style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
                    >
                      {word.text}
                    </span>
                  </span>
                );
              })}
            </div>

            {/* English translation */}
            <p className={`${CN_SIZES[fontSize]} leading-relaxed text-slate-400 font-light`}>
              {(sentence as { enText?: string }).enText}
            </p>
          </>
        ) : (
          <>
            {/* English line */}
            <p className={`${EN_SIZES[fontSize]} leading-relaxed text-slate-200`}>
              {sentence.words.map((word, i) => {
                const isActiveWord = status === 'active' && i === activeWordIndex;
                const hasEntry = !!word.entry;
                const core = word.text.trim();
                const displayText = normalizeWord(core);
                const cleanedLen = core.replace(/[^a-zA-Z'-]/g, '').length;
                const isClickable = cleanedLen >= 2;

                return (
                  <Fragment key={i}>
                    {i > 0 && ' '}
                    <span
                      className={`inline transition-colors duration-150 rounded-sm ${
                        isActiveWord ? 'bg-highlight/25 text-highlight' : ''
                      } ${
                        hasEntry
                          ? 'cursor-pointer hover:text-accent hover:underline decoration-accent/50 underline-offset-2'
                          : isClickable
                          ? 'cursor-pointer hover:text-accent'
                          : ''
                      }`}
                      onClick={
                        isClickable
                          ? (e) => {
                              e.stopPropagation();
                              // Don't open word bubble if user just drag-selected text
                              const sel = window.getSelection();
                              if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
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
          </>
        )}
      </div>
    </div>
  );
}
