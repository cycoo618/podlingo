import { useEffect, useRef, useState, useCallback } from 'react';
import type { Episode, WordEntry } from '../../types';
import SentenceBlock from './SentenceBlock';
import WordBubble from './WordBubble';

interface TranscriptViewProps {
  episode: Episode;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onTap?: () => void;
}

// ── Free Dictionary API types ────────────────────────────────────────────────
interface DictDef { definition: string }
interface DictMeaning { partOfSpeech: string; definitions: DictDef[] }
interface DictEntry { word: string; phonetics: { text?: string }[]; meanings: DictMeaning[] }

function mapApiToEntry(data: DictEntry[]): WordEntry {
  const r = data[0];
  const phonetic = r.phonetics.find((p) => p.text)?.text ?? '';

  const defs: string[] = [];
  for (const m of r.meanings) {
    for (const d of m.definitions) {
      if (defs.length >= 3) break;
      // prefix part-of-speech when multiple meanings exist
      const prefix = r.meanings.length > 1 ? `[${m.partOfSpeech}] ` : '';
      defs.push(prefix + d.definition);
    }
    if (defs.length >= 3) break;
  }

  return {
    word: r.word,
    phonetic,
    partOfSpeech: r.meanings[0]?.partOfSpeech ?? '',
    definitions: defs,
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
export default function TranscriptView({ episode, currentTime, isPlaying, onSeek, onPlayPause, onTap }: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  // bubble: null = closed, entry null = loading, entry set = ready
  const [bubble, setBubble] = useState<{ word: string; entry: WordEntry | null; rect: DOMRect } | null>(null);
  const activeWordRef = useRef<string | null>(null);   // track current lookup to cancel stale responses
  const cache = useRef<Map<string, WordEntry | 'not_found'>>(new Map());

  const { transcript } = episode;

  const activeSentenceIdx = transcript.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );
  const effectiveActive = activeSentenceIdx !== -1
    ? activeSentenceIdx
    : (() => {
        // In a gap between sentences: look up to 0.5s ahead to handle
        // YouTube keyframe seek landing slightly before sentence.startTime
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
    wordStartTime?: number,
  ) => {
    // Always seek to the word's position in the video
    if (wordStartTime !== undefined) onSeek(wordStartTime);

    // Dictionary lookup only while playing
    if (!isPlaying) return;

    const key = cleanWord(wordText);
    if (!key) return;

    // Toggle off if tapping same word again
    if (activeWordRef.current === key) {
      closeBubble();
      return;
    }
    activeWordRef.current = key;

    // 1. Pre-loaded entry from episode data
    if (preloadedEntry) {
      setBubble({ word: key, entry: preloadedEntry, rect });
      return;
    }

    // 2. Already cached
    const cached = cache.current.get(key);
    if (cached === 'not_found') {
      activeWordRef.current = null;
      return;
    }
    if (cached) {
      setBubble({ word: key, entry: cached, rect });
      return;
    }

    // 3. Fetch from Free Dictionary API
    setBubble({ word: key, entry: null, rect });

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('not_found');
      const data: DictEntry[] = await res.json();
      const entry = mapApiToEntry(data);
      cache.current.set(key, entry);
      if (activeWordRef.current === key) {
        setBubble({ word: key, entry, rect });
      }
    } catch {
      cache.current.set(key, 'not_found');
      if (activeWordRef.current === key) {
        setBubble(null);
        activeWordRef.current = null;
      }
    }
  }, [isPlaying, onSeek, closeBubble]);

  const handleContainerClick = useCallback(() => {
    closeBubble();
    onPlayPause();
    onTap?.();
  }, [closeBubble, onPlayPause, onTap]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-6 py-8 space-y-6"
        onClick={handleContainerClick}
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
                onSeek={onSeek}
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
        />
      )}
    </div>
  );
}
