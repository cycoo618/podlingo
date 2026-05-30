import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { WordEntry } from '../types';

// ── Saved word ────────────────────────────────────────────────────────────────
export interface SavedWord {
  id: string;
  type: 'word';
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definitions: string[];
  savedAt: number;
  episodeId?: string;
  startTime?: number;   // video position when saved (for jump-back)
}

// ── Saved sentence ────────────────────────────────────────────────────────────
export interface SavedSentence {
  id: string;
  type: 'sentence';
  enText: string;
  cnText: string;
  savedAt: number;
  episodeId: string;
  episodeTitle: string;
  podcastName: string;
  sentenceId: string;
  startTime: number;    // video position for jump-back
}

export type SavedItem = SavedWord | SavedSentence;

export function useVocabulary() {
  const { user } = useAuth();
  const [items, setItems]   = useState<SavedItem[]>([]);
  const [saved, setSaved]   = useState<Set<string>>(new Set());  // fast lookup by doc id

  // Real-time listener
  useEffect(() => {
    if (!user) { setItems([]); setSaved(new Set()); return; }

    const q = query(
      collection(db, 'users', user.uid, 'vocab'),
      orderBy('savedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const all: SavedItem[] = snap.docs.map((d) => {
        const data = d.data();
        const savedAt = data.savedAt?.toMillis?.() ?? Date.now();
        if (data.type === 'sentence') {
          return {
            id:          d.id,
            type:        'sentence',
            enText:      data.enText ?? '',
            cnText:      data.cnText ?? '',
            savedAt,
            episodeId:   data.episodeId ?? '',
            episodeTitle: data.episodeTitle ?? '',
            podcastName: data.podcastName ?? '',
            sentenceId:  data.sentenceId ?? '',
            startTime:   data.startTime ?? 0,
          } satisfies SavedSentence;
        }
        return {
          id:           d.id,
          type:         'word',
          word:         data.word ?? d.id,
          phonetic:     data.phonetic ?? '',
          partOfSpeech: data.partOfSpeech ?? '',
          definitions:  data.definitions ?? [],
          savedAt,
          episodeId:    data.episodeId ?? undefined,
          startTime:    data.startTime ?? undefined,
        } satisfies SavedWord;
      });
      setItems(all);
      setSaved(new Set(all.map((w) => w.id)));
    });
    return unsub;
  }, [user]);

  // ── Save word ─────────────────────────────────────────────────────────────
  const saveWord = useCallback(async (
    entry: WordEntry,
    episodeId?: string,
    startTime?: number,
  ) => {
    if (!user) return;
    const key = entry.word.toLowerCase();
    const ref = doc(db, 'users', user.uid, 'vocab', key);
    await setDoc(ref, {
      type:         'word',
      word:         entry.word,
      phonetic:     entry.phonetic,
      partOfSpeech: entry.partOfSpeech,
      definitions:  entry.definitions,
      savedAt:      serverTimestamp(),
      episodeId:    episodeId ?? null,
      startTime:    startTime ?? null,
    });
  }, [user]);

  // ── Save sentence ─────────────────────────────────────────────────────────
  const saveSentence = useCallback(async (opts: {
    sentenceId: string;
    enText: string;
    cnText: string;
    episodeId: string;
    episodeTitle: string;
    podcastName: string;
    startTime: number;
  }) => {
    if (!user) return;
    const key = `s_${opts.episodeId}_${opts.sentenceId}`;
    const ref = doc(db, 'users', user.uid, 'vocab', key);
    await setDoc(ref, {
      type:         'sentence',
      enText:       opts.enText,
      cnText:       opts.cnText,
      savedAt:      serverTimestamp(),
      episodeId:    opts.episodeId,
      episodeTitle: opts.episodeTitle,
      podcastName:  opts.podcastName,
      sentenceId:   opts.sentenceId,
      startTime:    opts.startTime,
    });
  }, [user]);

  // ── Remove any item ───────────────────────────────────────────────────────
  const removeItem = useCallback(async (itemId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'vocab', itemId));
  }, [user]);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);
  const isSentenceSaved = useCallback(
    (episodeId: string, sentenceId: string) =>
      saved.has(`s_${episodeId}_${sentenceId}`),
    [saved],
  );

  // Backward-compat: expose vocab as SavedWord[] for any old callers
  const vocab = items.filter((i): i is SavedWord => i.type === 'word');

  return { items, vocab, saveWord, saveSentence, removeItem, isSaved, isSentenceSaved };
}
