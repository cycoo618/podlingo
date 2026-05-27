"""
generate_allin_ep3.py  — All-In Podcast E273 transcript pipeline
-----------------------------------------------------------------
Steps:
  1. yt-dlp  → download audio + fetch video metadata (title, duration)
  2. faster-whisper medium (CPU int8)  →  raw transcript
  3. whisperx.align()  →  word-level timestamps
  4. Save raw JSON (skip re-transcription on re-run)
  5. GoogleTranslator zh-CN
  6. Append ep3 to src/data/mockEpisodes.ts

Usage:
  python3 scripts/generate_allin_ep3.py

Re-run translation only (if transcript_allin_ep3.json already exists):
  python3 scripts/generate_allin_ep3.py --skip-transcribe
"""

import sys
sys.stdout.reconfigure(line_buffering=True)

import argparse, json, time, os, gc, subprocess
import torch

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
YT_URL      = "https://www.youtube.com/watch?v=jJRAvZNGUvI"
AUDIO_PATH  = os.path.join(SCRIPT_DIR, "allin_ep3.mp3")
RAW_JSON    = os.path.join(SCRIPT_DIR, "transcript_allin_ep3.json")
MOCK_TS     = os.path.join(SCRIPT_DIR, "..", "src", "data", "mockEpisodes.ts")
EP_ID       = "ep3"

CHAPTER_INTERVAL = 720   # 12-minute chapters


# ── Download ──────────────────────────────────────────────────────────────────
def download_audio():
    if os.path.exists(AUDIO_PATH):
        print(f"[skip] Audio already exists: {AUDIO_PATH}")
        return
    print(f"[1] Downloading audio from {YT_URL} …")
    cmd = [
        "yt-dlp", "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist",
        "-o", AUDIO_PATH,
        YT_URL,
    ]
    r = subprocess.run(cmd, text=True)
    if r.returncode != 0:
        print("yt-dlp failed"); sys.exit(1)
    print(f"   → saved: {AUDIO_PATH}")


# ── Chapters ──────────────────────────────────────────────────────────────────
def build_chapters(duration: float) -> list[dict]:
    chapters = []
    t = 0.0
    idx = 1
    while t < duration:
        end = min(t + CHAPTER_INTERVAL, duration)
        mins_s = int(t) // 60
        mins_e = int(end) // 60
        chapters.append({
            "id":          f"ac{idx}",
            "title":       f"Part {idx}",
            "description": f"{mins_s}:00 – {mins_e}:00",
            "start":       round(t, 1),
            "end":         round(end, 1),
        })
        t = end
        idx += 1
    return chapters


# ── TypeScript helpers ────────────────────────────────────────────────────────
def ts_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")

def word_to_ts(w: dict, is_first: bool) -> str:
    text = w["word"]
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
    for i, w in enumerate(s["words"]):
        lines.append(word_to_ts(w, is_first=(i == 0)))
    lines += [
        "        ],",
        f"        cnText: '{ts_escape(s['cnText'])}',",
        "        wordMappings: [],",
        "      },",
    ]
    return "\n".join(lines)

def chapter_to_ts(c: dict) -> str:
    desc = f", description: '{ts_escape(c['description'])}'" if c.get("description") else ""
    return (f"      {{ id: '{c['id']}', title: '{ts_escape(c['title'])}'"
            f"{desc}, startTime: {c['start']}, endTime: {c['end']} }},")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-transcribe", action="store_true",
                        help="Skip transcription and use existing RAW_JSON")
    args = parser.parse_args()

    align_device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Align device: {align_device}")

    # ── Step 1: Download ──────────────────────────────────────────────────────
    download_audio()

    # ── Step 2 + 3: Transcribe + Align (or load cached) ──────────────────────
    if args.skip_transcribe and os.path.exists(RAW_JSON):
        print(f"[skip] Loading cached transcript: {RAW_JSON}")
        with open(RAW_JSON, encoding="utf-8") as f:
            raw_data = json.load(f)
        segments = raw_data["segments"]
        duration = raw_data["duration"]
    else:
        from faster_whisper import WhisperModel
        print("[2] Loading faster-whisper medium …")
        model = WhisperModel("medium", device="cpu", compute_type="int8")

        print(f"    Transcribing {AUDIO_PATH} …")
        t0 = time.time()
        segments_iter, info = model.transcribe(
            AUDIO_PATH,
            language="en",
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            beam_size=5,
        )
        raw_segs = []
        for i, seg in enumerate(segments_iter):
            raw_segs.append(seg)
            if (i + 1) % 100 == 0:
                pct = seg.end / info.duration * 100
                print(f"  … {i+1} segs  {seg.end:.0f}s/{info.duration:.0f}s ({pct:.1f}%)  "
                      f"[{time.time()-t0:.0f}s]", flush=True)

        print(f"    Done in {time.time()-t0:.1f}s  ({len(raw_segs)} segments)")
        del model; gc.collect()

        # WhisperX alignment
        import whisperx
        wx_segs = []
        for seg in raw_segs:
            wx_segs.append({
                "text":  seg.text.strip(),
                "start": round(seg.start, 3),
                "end":   round(seg.end,   3),
                "words": [
                    {
                        "word":  w.word,
                        "start": round(w.start, 3) if w.start is not None else round(seg.start, 3),
                        "end":   round(w.end,   3) if w.end   is not None else round(seg.end,   3),
                        "score": round(w.probability, 3) if w.probability is not None else 0.0,
                    }
                    for w in (seg.words or [])
                ],
            })

        print(f"[3] Forced alignment on {align_device} …")
        t2 = time.time()
        audio_arr = whisperx.load_audio(AUDIO_PATH)
        model_a, metadata = whisperx.load_align_model(language_code="en", device=align_device)
        aligned = whisperx.align(wx_segs, model_a, metadata, audio_arr, align_device,
                                 return_char_alignments=False)
        print(f"    Done in {time.time()-t2:.1f}s")
        del model_a; gc.collect()

        segments = aligned["segments"]
        duration = info.duration

        # Cache
        raw_data = {
            "segments": [
                {"text": s.get("text",""), "start": s.get("start",0),
                 "end": s.get("end",0), "words": s.get("words",[])}
                for s in segments
            ],
            "duration": duration,
        }
        with open(RAW_JSON, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)
        print(f"    Raw JSON cached → {RAW_JSON}")

    # ── Step 4: Translate ─────────────────────────────────────────────────────
    from deep_translator import GoogleTranslator
    translator = GoogleTranslator(source="en", target="zh-CN")

    print(f"[4] Translating {len(segments)} segments …")
    cn_texts = []
    for i, seg in enumerate(segments):
        text = seg.get("text", "").strip()
        if not text:
            cn_texts.append(""); continue
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
            print(f"  … {i+1}/{len(segments)} translated", flush=True)
        time.sleep(0.15)
    print("    Translation complete.")

    # ── Step 5: Build sentence + chapter objects ──────────────────────────────
    sentences = []
    for i, (seg, cn) in enumerate(zip(segments, cn_texts)):
        words_raw = seg.get("words", [])
        if words_raw:
            words = [{
                "word":  w.get("word", ""),
                "start": round(w.get("start", seg["start"]), 3),
                "end":   round(w.get("end",   seg["end"]),   3),
            } for w in words_raw]
        else:
            words = [{"word": seg.get("text","").strip(),
                      "start": round(seg["start"],3), "end": round(seg["end"],3)}]
        sentences.append({
            "id":        f"al{i+1}",
            "startTime": round(seg["start"], 3),
            "endTime":   round(seg["end"],   3),
            "words":     words,
            "cnText":    cn,
        })

    chapters = build_chapters(duration)
    print(f"    {len(chapters)} chapters @ {CHAPTER_INTERVAL//60}-min intervals")

    # ── Step 6: Render TypeScript block ──────────────────────────────────────
    duration_r   = round(duration, 1)
    sentences_ts = "\n".join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = "\n".join(chapter_to_ts(c) for c in chapters)

    ep3_block = f"""  {{
    id: '{EP_ID}',
    podcastName: 'All-In Podcast',
    title: 'E273: U.S.-China Relations & AI\'s Impact on Enterprise Software',
    description:
      'The besties dig into U.S.-China geopolitics and Taiwan\\'s defense posture, then pivot to AI\\'s disruptive impact on SaaS with guest Marc Benioff — covering Salesforce strategy, the OpenAI-Apple deal, and what the next wave of enterprise software looks like.',
    videoUrl: 'https://www.youtube.com/embed/jJRAvZNGUvI?enablejsapi=1',
    coverImage: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&h=400&fit=crop',
    duration: {duration_r},
    language: 'en-zh',
    premium: true,
    chapters: [
{chapters_ts}
    ],
    transcript: [
{sentences_ts}
    ],
  }},
"""

    # ── Step 7: Append ep3 to mockEpisodes.ts ────────────────────────────────
    mock_path = os.path.normpath(MOCK_TS)
    with open(mock_path, "r", encoding="utf-8") as f:
        existing = f.read()

    # Remove any existing ep3 block if re-running
    if f"id: '{EP_ID}'," in existing:
        print(f"[warn] {EP_ID} already in mockEpisodes.ts — removing old block first")
        # Find the ep3 block start
        start_marker = f"  {{\n    id: '{EP_ID}',"
        start_idx = existing.find(start_marker)
        if start_idx != -1:
            # Find the closing },
            end_idx = existing.find("\n  },\n", start_idx)
            if end_idx != -1:
                existing = existing[:start_idx] + existing[end_idx + 6:]

    if existing.rstrip().endswith("];"):
        new_content = existing.rstrip()[:-2].rstrip() + "\n" + ep3_block + "];\n"
    else:
        print("WARNING: mockEpisodes.ts doesn't end with ']' — appending anyway")
        new_content = existing.rstrip() + "\n" + ep3_block + "];\n"

    with open(mock_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"\n✓ mockEpisodes.ts updated → {mock_path}")
    print(f"  {len(sentences)} sentences · {duration_r}s · {len(chapters)} chapters")


if __name__ == "__main__":
    main()
