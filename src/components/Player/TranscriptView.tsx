import { useEffect, useRef, useState, useCallback } from 'react';
import type { Episode, WordEntry } from '../../types';
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
}: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  // bubble: null = closed, entry null = loading, entry set = ready
  const [bubble, setBubble] = useState<{ word: string; entry: WordEntry | null; rect: DOMRect } | null>(null);
  const activeWordRef = useRef<string | null>(null);
  const cache = useRef<Map<string, WordEntry | 'not_found'>>(new Map());

  // Scroll detection — prevents "scroll = tap" on mobile
  const didScrollRef = useRef(false);

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
    const key = cleanWord(wordText);
    if (!key) return;

    if (activeWordRef.current === key) { closeBubble(); return; }
    activeWordRef.current = key;

    // 1. Pre-loaded entry (already in Chinese from episode data)
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
                onWordClick={handleWordClick}
                onSentenceClick={handleSentenceClick}
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
    </div>
  );
}
