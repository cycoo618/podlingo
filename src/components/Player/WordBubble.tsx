import { useEffect, useRef, useState } from 'react';
import type { WordEntry, BubblePosition } from '../../types';

interface WordBubbleProps {
  word: string;           // display word (for loading state)
  entry: WordEntry | null; // null = loading
  anchorRect: DOMRect;
  onClose: () => void;
}

export default function WordBubble({ word, entry, anchorRect, onClose }: WordBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<BubblePosition | null>(null);

  // Max height the bubble content is allowed to be (leaves 24px breathing room)
  const MAX_BUBBLE_H = Math.round(window.innerHeight * 0.55);

  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const bubbleW = Math.min(280, window.innerWidth - 32);
    const bubbleH = Math.min(bubble.scrollHeight || (entry ? 160 : 72), MAX_BUBBLE_H);
    const NAV_HEIGHT = 56;
    const GAP = 8;

    let left = anchorRect.left;
    if (left + bubbleW > window.innerWidth - 16) left = window.innerWidth - bubbleW - 16;
    if (left < 16) left = 16;

    const arrowLeft = Math.max(16, Math.min(anchorRect.left + anchorRect.width / 2 - left, bubbleW - 16));

    const spaceAbove = anchorRect.top - NAV_HEIGHT - GAP;
    if (spaceAbove >= bubbleH) {
      setPos({ bottom: window.innerHeight - anchorRect.top + GAP, left, arrowDirection: 'down', arrowLeft });
    } else {
      setPos({ top: anchorRect.bottom + GAP, left, arrowDirection: 'up', arrowLeft });
    }
  }, [anchorRect, entry, MAX_BUBBLE_H]);

  // close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={bubbleRef}
      className="fixed z-50 animate-bubble"
      style={{
        width: Math.min(280, window.innerWidth - 32),
        left: pos?.left ?? -9999,
        ...(pos?.top !== undefined ? { top: pos.top } : {}),
        ...(pos?.bottom !== undefined ? { bottom: pos.bottom } : {}),
        opacity: pos ? 1 : 0,
        pointerEvents: pos ? 'auto' : 'none',
      }}
    >
      {/* Arrow up — uses CSS var so it tracks day/night theme */}
      {pos?.arrowDirection === 'up' && (
        <div className="absolute -top-2 w-0 h-0" style={{
          left: pos.arrowLeft,
          borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          borderBottom: '8px solid var(--clr-surface2)',
        }} />
      )}

      {/* bg-surface-2 → named Tailwind class; theme override works without escaping */}
      <div
        className="bg-surface-2 rounded-2xl shadow-2xl overflow-hidden flex flex-col border"
        style={{ maxHeight: MAX_BUBBLE_H, borderColor: 'var(--clr-border3)' }}
      >
        {entry === null ? (
          /* ── Loading state ── */
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-slate-400">{word}</span>
          </div>
        ) : (
          /* ── Loaded state ── */
          <>
            {/* Header — always visible */}
            <div className="px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: 'var(--clr-border3)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold text-white leading-tight">{entry.word}</p>
                  {entry.phonetic && (
                    <p className="text-sm text-muted mt-0.5 font-mono">{entry.phonetic}</p>
                  )}
                </div>
                {entry.partOfSpeech && (
                  <span className="text-xs bg-purple/20 text-purple px-2 py-1 rounded-lg shrink-0 mt-0.5">
                    {entry.partOfSpeech}
                  </span>
                )}
              </div>
            </div>

            {/* Definitions — scrollable if tall */}
            <div className="px-4 py-3 space-y-1.5 overflow-y-auto overscroll-contain">
              {entry.definitions.map((def, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-accent font-medium shrink-0">{i + 1}.</span>
                  <span className="text-slate-300 leading-snug">{def}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Arrow down */}
      {pos?.arrowDirection === 'down' && (
        <div className="absolute -bottom-2 w-0 h-0" style={{
          left: pos.arrowLeft,
          borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          borderTop: '8px solid var(--clr-surface2)',
        }} />
      )}
    </div>
  );
}
