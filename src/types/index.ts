export interface WordMapping {
  enWord: string;
  cnStart: number;
  cnEnd: number;
}

export interface WordEntry {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definitions: string[];
  contextEn: string;
  contextCn: string;
  highlightInContext: string;
}

export interface Word {
  text: string;
  startTime: number;
  endTime: number;
  entry?: WordEntry;
}

export interface Sentence {
  id: string;
  startTime: number;
  endTime: number;
  words: Word[];
  cnText: string;
  wordMappings: WordMapping[];
}

export interface Chapter {
  id: string;
  title: string;
  description?: string;
  startTime: number;  // seconds, same coordinate as Sentence.startTime
  endTime: number;
}

export interface Episode {
  id: string;
  podcastName: string;
  title: string;
  description: string;
  audioUrl?: string;
  videoUrl?: string;
  coverImage: string;
  duration: number;
  language: 'en-zh' | 'zh-en';
  transcript: Sentence[];
  chapters?: Chapter[];
  premium?: boolean;   // true = requires premium account to play
}

export type SentenceStatus = 'past' | 'active' | 'upcoming';

export interface BubblePosition {
  top?: number;
  bottom?: number;
  left: number;
  arrowDirection: 'up' | 'down';
  arrowLeft: number;
}
