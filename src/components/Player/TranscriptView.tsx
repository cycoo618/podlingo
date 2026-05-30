import { useEffect, useRef, useState, useCallback } from 'react';
import type { Episode, Sentence, WordEntry } from '../../types';
import SentenceBlock from './SentenceBlock';
import WordBubble from './WordBubble';

export type FontSize = 'sm' | 'base' | 'lg';

interface TranscriptViewProps {
  episode: Episode;
  currentTime: number;
  onSeek: (time: number) => void;
  /** Sentence-tap seek: video seeks 0.2s early to avoid first-word clipping.
   *  Falls back to onSeek if not provided. */
  onSentenceSeek?: (time: number) => void;
  onPlayPause: () => void;
  onTap?: () => void;
  fontSize?: FontSize;
  onSaveSentence?: (sentence: Sentence) => void;
  savedSentenceIds?: Set<string>;  // set of sentenceId strings already saved
  /** Called when user saves an arbitrary text selection (Kindle-style) */
  onSaveSelection?: (text: string, cnText: string, startTime: number) => void;
}

// ── Free Dictionary API types ────────────────────────────────────────────────
interface DictDef { definition: string }
interface DictMeaning { partOfSpeech: string; definitions: DictDef[] }
interface DictEntry { word: string; phonetics: { text?: string }[]; meanings: DictMeaning[] }

/** Translate English text to Chinese via MyMemory (free, no key, CORS-friendly). */
async function translateToCn(text: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`
    );
    const data = await res.json();
    return (data.responseData?.translatedText as string) || text;
  } catch {
    return text;
  }
}

async function mapApiToEntry(data: DictEntry[]): Promise<WordEntry> {
  const r = data[0];
  const phonetic = r.phonetics.find((p) => p.text)?.text ?? '';

  // Collect up to 3 English definitions
  const enDefs: string[] = [];
  for (const m of r.meanings) {
    for (const d of m.definitions) {
      if (enDefs.length >= 3) break;
      const prefix = r.meanings.length > 1 ? `[${m.partOfSpeech}] ` : '';
      enDefs.push(prefix + d.definition);
    }
    if (enDefs.length >= 3) break;
  }

  // Translate all definitions in parallel
  const cnDefs = await Promise.all(enDefs.map(translateToCn));

  return {
    word: r.word,
    phonetic,
    partOfSpeech: r.meanings[0]?.partOfSpeech ?? '',
    definitions: cnDefs,
    contextEn: '',
    contextCn: '',
    highlightInContext: '',
  };
}

/** Strip punctuation/spaces, return lowercase lookup key. Returns '' if not worth looking up. */
function cleanWord(text: string): string {
  const clean = text.trim().replace(/[^a-zA-Z'-]/g, '').toLowerCase().replace(/^'+|'+$/g, '');
  return clean.length >= 2 ? clean : '';
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TranscriptView({
  episode, currentTime, onSeek, onSentenceSeek, onPlayPause, onTap, fontSize = 'base',
  onSaveSentence, savedSentenceIds, onSaveSelection,
}: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  // bubble: null = closed, entry null = loading, entry set = ready
  const [bubble, setBubble] = useState<{ word: string; entry: WordEntry | null; rect: DOMRect } | null>(null);
  const activeWordRef = useRef<string | null>(null);
  const cache = useRef<Map<string, WordEntry | 'not_found'>>(new Map());

  // Scroll detection — prevents "scroll = tap" on mobile
  const didScrollRef = useRef(false);

  // ── Text-selection bookmark (Kindle-style) ────────────────────────────────
  interface SelectionSave {
    text: string;
    cnText: string;
    startTime: number;
    rect: DOMRect;
  }
  const [selection, setSelection] = useState<SelectionSave | null>(null);

  useEffect(() => {
    if (!onSaveSentence && !onSaveSelection) return;

    /** Walk up the DOM to find the nearest ancestor with data-start-time */
    function findSentenceData(node: Node | null): { startTime: number; cnText: string } | null {
      while (node) {
        if (node instanceof HTMLElement) {
          const st = node.dataset.startTime;
          if (st) return { startTime: parseFloat(st), cnText: node.dataset.cnText ?? '' };
        }
        node = node.parentNode;
      }
      return null;
    }

    const handlePointerUp = () => {
      // Delay so the browser can finalize the selection (important on iOS)
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { setSelection(null); return; }
        const text = sel.toString().trim();
        if (text.length < 2) { setSelection(null); return; }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) { setSelection(null); return; }

        const data = findSentenceData(range.startContainer);
        setSelection({ text, cnText: data?.cnText ?? '', startTime: data?.startTime ?? 0, rect });
      }, 80);
    };

    const handlePointerDown = () => setSelection(null);

    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchend', handlePointerUp);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchend', handlePointerUp);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onSaveSentence, onSaveSelection]);

  const { transcript } = episode;

  const activeSentenceIdx = transcript.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );
  const effectiveActive = activeSentenceIdx !== -1
    ? activeSentenceIdx
    : (() => {
        let lastStarted = 0;
        for (let i = 0; i < transcript.length; i++) {
          if (transcript[i].startTime <= currentTime) {
            lastStarted = i;
          } else {
            if (transcript[i].startTime - currentTime < 0.5) return i;
            break;
          }
        }
        return lastStarted;
      })();

  const activeSentence = transcript[effectiveActive];
  const activeWordIdx = activeSentence
    ? activeSentence.words.findIndex(
        (w) => w.startTime !== undefined && w.endTime !== undefined
          ? currentTime >= w.startTime && currentTime < w.endTime
          : false
      )
    : -1;

  useEffect(() => {
    const container = containerRef.current;
    const el = sentenceRefs.current[effectiveActive];
    if (!container || !el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relTop = elRect.top - containerRect.top + container.scrollTop;
    const targetScrollTop = relTop - containerRect.height * 0.35;

    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [effectiveActive]);

  const closeBubble = useCallback(() => {
    activeWordRef.current = null;
    setBubble(null);
  }, []);

  const handleWordClick = useCallback(async (
    wordText: string,
    preloadedEntry: WordEntry | undefined,
    rect: DOMRect,
  ) => {
    // For pre-loaded entries (e.g. Chinese words with pinyin), use text directly as key
    const key = preloadedEntry ? wordText : cleanWord(wordText);
    if (!key) return;

    if (activeWordRef.current === key) { closeBubble(); return; }
    activeWordRef.current = key;

    // 1. Pre-loaded entry (zh-en Chinese words or en-zh pre-annotated words)
    if (preloadedEntry) {
      setBubble({ word: key, entry: preloadedEntry, rect });
      return;
    }

    // 2. Cached
    const cached = cache.current.get(key);
    if (cached === 'not_found') { activeWordRef.current = null; return; }
    if (cached) { setBubble({ word: key, entry: cached, rect }); return; }

    // 3. Fetch from Free Dictionary API → translate definitions to Chinese
    setBubble({ word: key, entry: null, rect });
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('not_found');
      const data: DictEntry[] = await res.json();
      const entry = await mapApiToEntry(data);   // ← now async, translates defs
      cache.current.set(key, entry);
      if (activeWordRef.current === key) setBubble({ word: key, entry, rect });
    } catch {
      cache.current.set(key, 'not_found');
      if (activeWordRef.current === key) { setBubble(null); activeWordRef.current = null; }
    }
  }, [closeBubble]);

  const handleSentenceClick = useCallback((startTime: number) => {
    if (bubble) { closeBubble(); }
    else { (onSentenceSeek ?? onSeek)(startTime); }
  }, [bubble, closeBubble, onSeek, onSentenceSeek]);

  const handleContainerClick = useCallback(() => {
    if (didScrollRef.current) return;   // was a scroll gesture, not a tap
    if (bubble) { closeBubble(); }
    else { onPlayPause(); onTap?.(); }
  }, [bubble, closeBubble, onPlayPause, onTap]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-6 py-8 space-y-6"
        onClick={handleContainerClick}
        onTouchStart={() => { didScrollRef.current = false; }}
        onTouchMove={() => { didScrollRef.current = true; }}
      >
        {transcript.map((sentence, i) => {
          const status =
            i < effectiveActive ? 'past' : i === effectiveActive ? 'active' : 'upcoming';
          return (
            <div
              key={sentence.id}
              ref={(el) => { sentenceRefs.current[i] = el; }}
              className="pl-4"
            >
              <SentenceBlock
                sentence={sentence}
                status={status}
                activeWordIndex={activeWordIdx}
                language={episode.language}
                onWordClick={handleWordClick}
                onSentenceClick={handleSentenceClick}
                onSaveSentence={onSaveSentence}
                isSentenceSaved={savedSentenceIds?.has(sentence.id)}
                fontSize={fontSize}
              />
            </div>
          );
        })}
        <div className="h-64" />
      </div>

      {bubble && (
        <WordBubble
          word={bubble.word}
          entry={bubble.entry}
          anchorRect={bubble.rect}
          onClose={closeBubble}
          episodeId={episode.id}
        />
      )}

      {/* ── Text-selection save popup (Kindle-style) ── */}
      {selection && (onSaveSelection || onSaveSentence) && (() => {
        const GAP = 8;
        const BTN_H = 34;
        const BTN_W = 76;
        let left = selection.rect.left + selection.rect.width / 2 - BTN_W / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - BTN_W - 8));
        const rawTop = selection.rect.top - BTN_H - GAP;
        const finalTop = rawTop < 8 ? selection.rect.bottom + GAP : rawTop;
        return (
          <div
            className="fixed z-50 flex items-center bg-accent text-black text-xs font-semibold rounded-xl shadow-xl overflow-hidden"
            style={{ left, top: finalTop, height: BTN_H, width: BTN_W, pointerEvents: 'auto' }}
          >
            <button
              className="flex-1 flex items-center justify-center gap-1 h-full px-3 hover:bg-black/10 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault(); // keep selection alive until we read it
                const s = selection;
                setSelection(null);
                window.getSelection()?.removeAllRanges();
                if (onSaveSelection) {
                  onSaveSelection(s.text, s.cnText, s.startTime);
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                const s = selection;
                setSelection(null);
                window.getSelection()?.removeAllRanges();
                if (onSaveSelection) {
                  onSaveSelection(s.text, s.cnText, s.startTime);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
              收藏
            </button>
          </div>
        );
      })()}
    </div>
  );
}
