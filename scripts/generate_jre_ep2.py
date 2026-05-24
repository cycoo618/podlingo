"""
generate_jre_ep2.py  — JRE #2504 (Skylar Grey) transcript pipeline
--------------------------------------------------------------------
Uses:
  1. faster-whisper  medium  (CPU int8, ~2 GB RAM, avoids OOM on M2)
     + built-in Silero VAD   (seconds, not minutes like Pyannote)
  2. whisperx.align()  on MPS for accurate word timestamps (~30 ms)
  3. GoogleTranslator  zh-CN
  4. Appends ep2 to src/data/mockEpisodes.ts   (ep1 untouched)

Usage:
  python3 scripts/generate_jre_ep2.py
"""

import sys
sys.stdout.reconfigure(line_buffering=True)   # see output in real-time

import json, time, os, gc
import torch

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
AUDIO_PATH   = os.path.join(SCRIPT_DIR, 'jre2504.mp3')
RAW_JSON     = os.path.join(SCRIPT_DIR, 'transcript_jre2504.json')
MOCK_TS      = os.path.join(SCRIPT_DIR, '..', 'src', 'data', 'mockEpisodes.ts')

CHAPTER_INTERVAL = 600   # 10-minute chapters

# ── Auto-generate chapters at even 10-min intervals ───────────────────────────
def build_chapters(duration: float) -> list[dict]:
    chapters = []
    t = 0.0
    idx = 1
    while t < duration:
        end = min(t + CHAPTER_INTERVAL, duration)
        mins_s = int(t) // 60
        mins_e = int(end) // 60
        chapters.append({
            'id': f'jc{idx}',
            'title': f'Part {idx}',
            'description': f'{mins_s}:00 – {mins_e}:00',
            'start': round(t, 1),
            'end': round(end, 1),
        })
        t = end
        idx += 1
    return chapters

# ── TypeScript helpers ────────────────────────────────────────────────────────
def ts_escape(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")

def word_to_ts(w: dict, is_first: bool) -> str:
    text = w['word']
    if is_first:
        text = text.lstrip()
    return f"          {{ text: '{ts_escape(text)}', startTime: {w['start']}, endTime: {w['end']} }},"

def sentence_to_ts(s: dict) -> str:
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

def chapter_to_ts(c: dict) -> str:
    desc = f", description: '{ts_escape(c['description'])}'" if c.get('description') else ''
    return (f"      {{ id: '{c['id']}', title: '{ts_escape(c['title'])}'"
            f"{desc}, startTime: {c['start']}, endTime: {c['end']} }},")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(AUDIO_PATH):
        print(f"ERROR: audio not found at {AUDIO_PATH}"); sys.exit(1)

    align_device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Align device: {align_device}")

    # ── Step 1: Transcribe with faster-whisper medium + Silero VAD ──────────
    from faster_whisper import WhisperModel

    print("Loading faster-whisper  medium  …")
    model = WhisperModel("medium", device="cpu", compute_type="int8")

    print(f"Transcribing {AUDIO_PATH} (Silero VAD) …")
    t0 = time.time()
    segments_iter, info = model.transcribe(
        AUDIO_PATH,
        language="en",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        beam_size=5,
    )

    raw_segments = []
    for i, seg in enumerate(segments_iter):
        raw_segments.append(seg)
        if (i + 1) % 100 == 0:
            pct = seg.end / info.duration * 100
            elapsed = time.time() - t0
            print(f"  … {i+1} segs  {seg.end:.0f}s / {info.duration:.0f}s  ({pct:.1f}%)  [{elapsed:.0f}s elapsed]", flush=True)

    t1 = time.time()
    print(f"  Transcription done in {t1-t0:.1f}s  ({len(raw_segments)} segments)")
    del model; gc.collect()

    # ── Step 2: WhisperX forced alignment ───────────────────────────────────
    import whisperx

    wx_segments = []
    for seg in raw_segments:
        wx_segments.append({
            "text":  seg.text.strip(),
            "start": round(seg.start, 3),
            "end":   round(seg.end,   3),
            "words": [
                {
                    "word":   w.word,
                    "start":  round(w.start, 3) if w.start is not None else round(seg.start, 3),
                    "end":    round(w.end,   3) if w.end   is not None else round(seg.end,   3),
                    "score":  round(w.probability, 3) if w.probability is not None else 0.0,
                }
                for w in (seg.words or [])
            ],
        })

    print(f"Running forced alignment on {align_device} …")
    t2 = time.time()
    audio_array = whisperx.load_audio(AUDIO_PATH)
    model_a, metadata = whisperx.load_align_model(language_code="en", device=align_device)
    aligned = whisperx.align(wx_segments, model_a, metadata, audio_array, align_device,
                             return_char_alignments=False)
    print(f"  Alignment done in {time.time()-t2:.1f}s")
    del model_a; gc.collect()

    segments = aligned["segments"]
    duration = info.duration

    # Save raw JSON (useful for re-running translation without re-transcribing)
    raw_data = {
        "segments": [
            {"text": s.get("text",""), "start": s.get("start",0),
             "end": s.get("end",0), "words": s.get("words",[])}
            for s in segments
        ],
        "duration": duration,
    }
    with open(RAW_JSON, 'w', encoding='utf-8') as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)
    print(f"  Raw JSON saved → {RAW_JSON}")

    # ── Step 3: Translate to Chinese ────────────────────────────────────────
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
                    print(f"  [warn] seg {i}: {e}", flush=True)
                    cn_texts.append(text)
        if (i + 1) % 100 == 0:
            print(f"  … {i+1}/{len(segments)} translated", flush=True)
        time.sleep(0.15)
    print("  Translation complete.")

    # ── Step 4: Build sentence objects ──────────────────────────────────────
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
            'id':        f'jre{i+1}',
            'startTime': round(seg['start'], 3),
            'endTime':   round(seg['end'],   3),
            'words':     words,
            'cnText':    cn,
        })

    # ── Step 5: Chapters (auto 10-min intervals) ────────────────────────────
    chapters = build_chapters(duration)
    print(f"  Auto-generated {len(chapters)} chapters")

    # ── Step 6: Render TypeScript for ep2 ───────────────────────────────────
    duration_r   = round(duration, 1)
    sentences_ts = '\n'.join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = '\n'.join(chapter_to_ts(c) for c in chapters)

    ep2_block = f"""  {{
    id: 'ep2',
    podcastName: 'The Joe Rogan Experience',
    title: '#2504 – Skylar Grey',
    description:
      'Joe Rogan sits down with singer-songwriter Skylar Grey for a wide-ranging conversation about creativity, addiction, identity, and the music industry.',
    videoUrl: 'https://www.youtube.com/embed/fOTMWZNYg9g?enablejsapi=1',
    coverImage: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=400&fit=crop',
    duration: {duration_r},
    language: 'en-zh',
    chapters: [
{chapters_ts}
    ],
    transcript: [
{sentences_ts}
    ],
  }},
"""

    # ── Step 7: Append ep2 to existing mockEpisodes.ts ──────────────────────
    mock_path = os.path.normpath(MOCK_TS)
    with open(mock_path, 'r', encoding='utf-8') as f:
        existing = f.read()

    # Remove trailing "];\n" (or "];" with trailing whitespace/newlines)
    # and append ep2 + close
    if existing.rstrip().endswith('];'):
        new_content = existing.rstrip()[:-2].rstrip() + '\n' + ep2_block + '];\n'
    else:
        print("WARNING: mockEpisodes.ts doesn't end with ']' — appending anyway")
        new_content = existing.rstrip() + '\n' + ep2_block + '];\n'

    with open(mock_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"\nmockEpisodes.ts updated → {mock_path}")
    print(f"Done. {len(sentences)} sentences, {duration_r}s total, {len(chapters)} chapters.")

if __name__ == '__main__':
    main()
