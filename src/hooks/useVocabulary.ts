import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { WordEntry } from '../types';

export interface SavedWord {
  id: string;          // Firestore doc id (= word key)
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definitions: string[];
  savedAt: number;     // ms timestamp
  episodeId?: string;
}

export function useVocabulary() {
  const { user } = useAuth();
  const [vocab, setVocab]   = useState<SavedWord[]>([]);
  const [saved, setSaved]   = useState<Set<string>>(new Set());  // fast lookup

  // Real-time listener on the user's vocab subcollection
  useEffect(() => {
    if (!user) { setVocab([]); setSaved(new Set()); return; }

    const q = query(
      collection(db, 'users', user.uid, 'vocab'),
      orderBy('savedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const words: SavedWord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedWord, 'id'>),
        savedAt: d.data().savedAt?.toMillis?.() ?? Date.now(),
      }));
      setVocab(words);
      setSaved(new Set(words.map((w) => w.id)));
    });
    return unsub;
  }, [user]);

  const saveWord = useCallback(async (entry: WordEntry, episodeId?: string) => {
    if (!user) return;
    const key = entry.word.toLowerCase();
    const ref = doc(db, 'users', user.uid, 'vocab', key);
    await setDoc(ref, {
      word:         entry.word,
      phonetic:     entry.phonetic,
      partOfSpeech: entry.partOfSpeech,
      definitions:  entry.definitions,
      savedAt:      serverTimestamp(),
      episodeId:    episodeId ?? null,
    });
  }, [user]);

  const removeWord = useCallback(async (wordKey: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'vocab', wordKey));
  }, [user]);

  const isSaved = useCallback((wordKey: string) => saved.has(wordKey.toLowerCase()), [saved]);

  return { vocab, saveWord, removeWord, isSaved };
}
