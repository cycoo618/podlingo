import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'podlingo_progress';
const SAVE_DEBOUNCE_MS = 5000;

interface ChapterProgress {
  completed: boolean;
  lastPosition: number;
}

interface EpisodeProgress {
  lastPosition: number;
  lastChapterId: string;
  chapters: Record<string, ChapterProgress>;
}

type ProgressStore = Record<string, EpisodeProgress>;

function readStore(): ProgressStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeStore(store: ProgressStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable (private browsing, quota exceeded) — fail silently
  }
}

export function useEpisodeProgress(episodeId: string) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Last saved position for this episode (0 if never saved) */
  const getSavedPosition = useCallback((): number => {
    return readStore()[episodeId]?.lastPosition ?? 0;
  }, [episodeId]);

  /** Last saved chapter id for this episode */
  const getSavedChapterId = useCallback((): string | null => {
    return readStore()[episodeId]?.lastChapterId ?? null;
  }, [episodeId]);

  /**
   * Save current playback position and chapter.
   * Debounced: calls within SAVE_DEBOUNCE_MS of each other are collapsed.
   */
  const markProgress = useCallback((position: number, chapterId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const store = readStore();
      const prev = store[episodeId] ?? { lastPosition: 0, lastChapterId: chapterId, chapters: {} };
      store[episodeId] = {
        ...prev,
        lastPosition: position,
        lastChapterId: chapterId,
      };
      writeStore(store);
    }, SAVE_DEBOUNCE_MS);
  }, [episodeId]);

  /**
   * Mark a chapter as completed (called when within 10s of chapter end).
   */
  const markChapterComplete = useCallback((chapterId: string, lastPosition: number) => {
    const store = readStore();
    const prev = store[episodeId] ?? { lastPosition, lastChapterId: chapterId, chapters: {} };
    store[episodeId] = {
      ...prev,
      chapters: {
        ...prev.chapters,
        [chapterId]: { completed: true, lastPosition },
      },
    };
    writeStore(store);
  }, [episodeId]);

  /** Is a specific chapter marked complete? */
  const isChapterComplete = useCallback((chapterId: string): boolean => {
    return readStore()[episodeId]?.chapters?.[chapterId]?.completed ?? false;
  }, [episodeId]);

  // Flush any pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { getSavedPosition, getSavedChapterId, markProgress, markChapterComplete, isChapterComplete };
}
