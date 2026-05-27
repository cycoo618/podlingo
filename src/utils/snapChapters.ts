import type { Chapter, Sentence } from '../types';

/**
 * Within a window of ±windowSec around `targetTime`, find the sentence whose
 * end is followed by the longest natural pause (gap to the next sentence).
 * Falls back to the nearest sentence end if no candidate found in the window.
 */
function findBestBreakPoint(
  sentences: Sentence[],
  targetTime: number,
  windowSec = 90,
): number {
  let bestEnd = -1;
  let bestPause = -1;

  for (let i = 0; i < sentences.length - 1; i++) {
    const s = sentences[i];
    if (Math.abs(s.endTime - targetTime) > windowSec) continue;
    const gap = sentences[i + 1].startTime - s.endTime;
    if (gap > bestPause) {
      bestPause = gap;
      bestEnd = s.endTime;
    }
  }

  if (bestEnd >= 0) return bestEnd;

  // Fallback: nearest sentence end
  let nearest = sentences[0];
  let minDiff = Math.abs(sentences[0].endTime - targetTime);
  for (const s of sentences) {
    const diff = Math.abs(s.endTime - targetTime);
    if (diff < minDiff) { nearest = s; minDiff = diff; }
  }
  return nearest.endTime;
}

/**
 * Snap each inter-chapter boundary to the nearest natural sentence break
 * (longest pause within ±windowSec). First chapter start and last chapter end
 * are kept as-is. Ensures chapterN.endTime === chapter(N+1).startTime.
 */
export function snapChaptersToBoundaries(
  chapters: Chapter[],
  sentences: Sentence[],
  windowSec = 90,
): Chapter[] {
  if (chapters.length <= 1 || sentences.length === 0) return chapters;

  // Compute one snapped time per inter-chapter boundary
  const boundaries: number[] = [chapters[0].startTime];
  for (let i = 0; i < chapters.length - 1; i++) {
    const raw = chapters[i + 1].startTime; // == chapters[i].endTime in well-formed data
    boundaries.push(findBestBreakPoint(sentences, raw, windowSec));
  }
  boundaries.push(chapters[chapters.length - 1].endTime);

  return chapters.map((ch, idx) => ({
    ...ch,
    startTime: boundaries[idx],
    endTime: boundaries[idx + 1],
  }));
}
