"""
generate_whisperx_ep1.py  (v2 — faster-whisper + WhisperX alignment)
---------------------------------------------------------------------
Avoids Pyannote VAD (too slow on CPU for long audio) by using:
  1. faster-whisper  with built-in Silero VAD  (seconds, not minutes)
  2. whisperx.align() for accurate word timestamps (~30ms vs Whisper's ~200ms)

Pipeline:
  faster-whisper transcribe (Silero VAD, word_timestamps=True)
    → whisperx.align() forced alignment on MPS
      → GoogleTranslator zh-CN
        → mockEpisodes.ts

Usage: python3 scripts/generate_whisperx_ep1.py
"""

import json, time, sys, os
import torch

# ── Chapter boundaries ────────────────────────────────────────────────────────
CHAPTERS = [
    { 'id': 'c1', 'title': 'Post-Olympic Depression',
      'description': "There's a thing called post-Olympic depression — and it doesn't care if you won.",
      'start': 0, 'end': 300 },
    { 'id': 'c2', 'title': 'The Making of a Skier',
      'description': "From a casual ski trip to World Cups — the role of mentorship and early failure.",
      'start': 300, 'end': 600 },
    { 'id': 'c3', 'title': 'No Traditional Path',
      'description': "On skipping the conventional roadmap and charting your own course.",
      'start': 600, 'end': 900 },
    { 'id': 'c4', 'title': 'The Olympics Decision',
      'description': "Choosing to represent China at age 14 — and what that actually meant.",
      'start': 900, 'end': 1200 },
    { 'id': 'c5', 'title': 'Growing Up Biracial',
      'description': "Being authentically American and Chinese — without having to choose between the two.",
      'start': 1200, 'end': 1500 },
    { 'id': 'c6', 'title': 'Money & Optimization',
      'description': "On financial independence, investing in yourself, and the real meaning of productivity.",
      'start': 1500, 'end': 1800 },
    { 'id': 'c7', 'title': 'Handling Hate',
      'description': "Death threats, male intimidation, and why confidence isn't about ignoring the noise.",
      'start': 1800, 'end': 2040 },
    { 'id': 'c8', 'title': 'Burnout & Recovery',
      'description': "The anxiety after the Olympics, learning to rest, and what comes next.",
      'start': 2040, 'end': 2220 },
]

# ── TypeScript helpers ────────────────────────────────────────────────────────
def ts_escape(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")

def word_to_ts(w, is_first):
    text = w['word']
    if is_first:
        text = text.lstrip()
    return f"          {{ text: '{ts_escape(text)}', startTime: {w['start']}, endTime: {w['end']} }},"

def sentence_to_ts(s):
    lines = [
        "      {",
        f"        id: '{s['id']}',",
        f"        startTime: {s['startTime']},",
        f"        endTime: {s['endTime']},",
        "        words: [",
    ]
    for i, w in enumerate(s['words']):
        lines.append(word_to_ts(w, is_first=(i == 0)))
    lines += [
        "        ],",
        f"        cnText: '{ts_escape(s['cnText'])}',",
        "        wordMappings: [],",
        "      },",
    ]
    return '\n'.join(lines)

def chapter_to_ts(c):
    desc = f", description: '{ts_escape(c['description'])}'" if c.get('description') else ''
    return (f"      {{ id: '{c['id']}', title: '{ts_escape(c['title'])}'"
            f"{desc}, startTime: {c['start']}, endTime: {c['end']} }},")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    audio_path = os.path.join(script_dir, 'audio.mp3')
    out_raw    = os.path.join(script_dir, 'transcript_whisperx.json')
    out_mock   = os.path.join(script_dir, '..', 'src', 'data', 'mockEpisodes.ts')

    if not os.path.exists(audio_path):
        print(f"ERROR: audio file not found at {audio_path}"); sys.exit(1)

    align_device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Align device: {align_device}")

    # ── Step 1: Transcribe with faster-whisper + Silero VAD ──────────────────
    # Silero VAD is built into faster-whisper and runs in seconds (not minutes)
    from faster_whisper import WhisperModel

    print("Loading faster-whisper large-v3 …")
    model = WhisperModel("large-v3", device="cpu", compute_type="int8")

    print(f"Transcribing {audio_path} (Silero VAD) …")
    t0 = time.time()
    segments_iter, info = model.transcribe(
        audio_path,
        language="en",
        word_timestamps=True,
        vad_filter=True,                           # Silero VAD — fast
        vad_parameters={"min_silence_duration_ms": 400},
        beam_size=5,
    )

    # Consume iterator (prints progress every 100 segments)
    raw_segments = []
    for i, seg in enumerate(segments_iter):
        raw_segments.append(seg)
        if (i + 1) % 100 == 0:
            print(f"  … {i+1} segments, {seg.end:.1f}s / {info.duration:.1f}s")

    t1 = time.time()
    print(f"  Transcription done in {t1-t0:.1f}s  ({len(raw_segments)} segments)")
    del model
    import gc; gc.collect()

    # ── Step 2: forced alignment (WhisperX) for accurate word timestamps ─────
    import whisperx

    # Convert faster-whisper segments to the dict format whisperx.align expects
    wx_segments = []
    for seg in raw_segments:
        wx_segments.append({
            "text":  seg.text.strip(),
            "start": round(seg.start, 3),
            "end":   round(seg.end, 3),
            "words": [
                {
                    "word":       w.word,
                    "start":      round(w.start, 3) if w.start is not None else round(seg.start, 3),
                    "end":        round(w.end, 3)   if w.end   is not None else round(seg.end,   3),
                    "score":      round(w.probability, 3) if w.probability is not None else 0.0,
                }
                for w in (seg.words or [])
            ],
        })

    print(f"Running forced alignment on {align_device} …")
    t2 = time.time()
    # Load the audio array that whisperx.align needs
    audio_array = whisperx.load_audio(audio_path)
    model_a, metadata = whisperx.load_align_model(language_code="en", device=align_device)
    aligned = whisperx.align(wx_segments, model_a, metadata, audio_array, align_device,
                             return_char_alignments=False)
    print(f"  Alignment done in {time.time()-t2:.1f}s")
    del model_a; gc.collect()

    segments = aligned["segments"]
    duration = info.duration

    # Save raw JSON
    raw_data = {
        "segments": [
            {
                "text":  s.get("text", ""),
                "start": s.get("start", 0),
                "end":   s.get("end", 0),
                "words": s.get("words", []),
            }
            for s in segments
        ],
        "duration": duration,
    }
    with open(out_raw, 'w', encoding='utf-8') as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)
    print(f"  Raw JSON saved → {out_raw}")

    # ── Step 3: Translate to Chinese ─────────────────────────────────────────
    from deep_translator import GoogleTranslator
    translator = GoogleTranslator(source='en', target='zh-CN')

    cn_texts = []
    print(f"Translating {len(segments)} segments …")
    for i, seg in enumerate(segments):
        text = seg.get("text", "").strip()
        if not text:
            cn_texts.append(''); continue
        for attempt in range(3):
            try:
                cn = translator.translate(text) or text
                cn_texts.append(cn); break
            except Exception as e:
                if attempt < 2: time.sleep(2)
                else:
                    print(f"  [warn] seg {i}: {e}")
                    cn_texts.append(text)
        if (i + 1) % 100 == 0:
            print(f"  … {i+1}/{len(segments)} done")
        time.sleep(0.15)
    print("  Translation complete.")

    # ── Step 4: Build sentence objects ───────────────────────────────────────
    sentences = []
    for i, (seg, cn) in enumerate(zip(segments, cn_texts)):
        words_raw = seg.get('words', [])
        if words_raw:
            words = [{
                'word':  w.get('word', ''),
                'start': round(w.get('start', seg['start']), 3),
                'end':   round(w.get('end',   seg['end']),   3),
            } for w in words_raw]
        else:
            words = [{'word': seg.get('text','').strip(),
                      'start': round(seg['start'],3), 'end': round(seg['end'],3)}]
        sentences.append({
            'id': f's{i+1}',
            'startTime': round(seg['start'], 3),
            'endTime':   round(seg['end'],   3),
            'words': words,
            'cnText': cn,
        })

    # ── Step 5: Render TypeScript ─────────────────────────────────────────────
    duration_r    = round(duration, 1)
    sentences_ts  = '\n'.join(sentence_to_ts(s) for s in sentences)
    chapters_ts   = '\n'.join(chapter_to_ts(c) for c in CHAPTERS)

    full_episode = f"""import type {{ Episode }} from '../types';

export const mockEpisodes: Episode[] = [
  {{
    id: 'ep1',
    podcastName: 'The Burnouts',
    title: 'Eileen Gu Opens Up',
    description:
      'Olympic champion Eileen Gu opens up about death threats, growing up biracial, post-Olympic depression, and her secrets to unshakeable confidence.',
    videoUrl: 'https://www.youtube.com/embed/5sPAyKrk0-s?enablejsapi=1',
    coverImage: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop',
    duration: {duration_r},
    language: 'en-zh',
    chapters: [
{chapters_ts}
    ],
    transcript: [
{sentences_ts}
    ],
  }},
];
"""

    with open(out_mock, 'w', encoding='utf-8') as f:
        f.write(full_episode)
    print(f"\nmockEpisodes.ts updated → {out_mock}")
    print(f"Done. {len(sentences)} sentences, {duration_r}s total.")

if __name__ == '__main__':
    main()
