"""
generate_episode_mlx.py — 通用播客转录脚本（Apple Silicon 优化版）
------------------------------------------------------------------
流程：
  1. yt-dlp          下载音频
  2. mlx-whisper     转录（Apple GPU / Neural Engine，~10x CPU 速度）
  3. WhisperX align  精确词级时间戳（MPS）
  4. Google Translate zh-CN 翻译
  5. 追加到 src/data/mockEpisodes.ts

用法：
  # 防止合盖中断，加 caffeinate：
  caffeinate -i python3 scripts/generate_episode_mlx.py \\
    --url "https://www.youtube.com/watch?v=VIDEO_ID" \\
    --id ep4 \\
    --podcast "播客名" \\
    --title "节目标题" \\
    --description "节目简介" \\
    --cover "https://images.unsplash.com/photo-xxx?w=400&h=400&fit=crop"

  # 只重跑翻译（跳过转录，使用缓存 JSON）：
  caffeinate -i python3 scripts/generate_episode_mlx.py \\
    --url ... --id ep4 ... --skip-transcribe
"""

import sys, argparse, subprocess, json, time, os, gc
sys.stdout.reconfigure(line_buffering=True)

import torch

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MOCK_TS    = os.path.join(SCRIPT_DIR, "..", "src", "data", "mockEpisodes.ts")


# ── CLI ───────────────────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--url",              required=True,  help="YouTube URL")
    p.add_argument("--id",               required=True,  help="Episode ID, e.g. ep4")
    p.add_argument("--podcast",          required=True,  help="Podcast name")
    p.add_argument("--title",            required=True,  help="Episode title")
    p.add_argument("--description",      required=True,  help="Episode description")
    p.add_argument("--cover",            required=True,  help="Cover image URL")
    p.add_argument("--premium",          action="store_true", help="Mark as premium")
    p.add_argument("--chapter-interval", type=int, default=720,
                   help="Chapter length in seconds (default: 720 = 12 min)")
    p.add_argument("--model",            default="mlx-community/whisper-medium-mlx",
                   help="mlx-whisper model repo (default: medium)")
    p.add_argument("--skip-transcribe",  action="store_true",
                   help="Skip transcription if cached JSON exists")
    return p.parse_args()


# ── Download ──────────────────────────────────────────────────────────────────
def download_audio(url: str, ep_id: str) -> str:
    audio_path = os.path.join(SCRIPT_DIR, f"{ep_id}.mp3")
    if os.path.exists(audio_path):
        print(f"[skip] Audio exists: {audio_path}")
        return audio_path
    print(f"[1] Downloading audio from {url} …")
    cmd = [
        "yt-dlp", "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist",
        "-o", audio_path,
        url,
    ]
    r = subprocess.run(cmd, text=True)
    if r.returncode != 0:
        print("yt-dlp failed"); sys.exit(1)
    print(f"   → {audio_path}")
    return audio_path


# ── Transcribe (mlx-whisper) ──────────────────────────────────────────────────
def transcribe_mlx(audio_path: str, model_repo: str) -> tuple[list[dict], float]:
    import mlx_whisper

    print(f"[2] Transcribing with mlx-whisper ({model_repo}) …")
    t0 = time.time()
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo=model_repo,
        word_timestamps=True,
        language="en",
        verbose=False,
    )
    elapsed = time.time() - t0

    segs     = result["segments"]
    duration = segs[-1]["end"] if segs else 0.0
    print(f"   Done in {elapsed:.1f}s  ({len(segs)} segments, {duration:.1f}s audio)")
    return segs, duration


# ── WhisperX alignment ────────────────────────────────────────────────────────
def align_whisperx(segs: list[dict], audio_path: str) -> list[dict]:
    import whisperx

    align_device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[3] WhisperX forced alignment on {align_device} …")
    t0 = time.time()

    # Convert mlx-whisper format → whisperx input format
    wx_segs = []
    for seg in segs:
        words = []
        for w in (seg.get("words") or []):
            words.append({
                "word":  w["word"],
                "start": round(float(w["start"]), 3),
                "end":   round(float(w["end"]),   3),
                "score": round(float(w.get("probability", 1.0)), 3),
            })
        wx_segs.append({
            "text":  seg["text"].strip(),
            "start": round(float(seg["start"]), 3),
            "end":   round(float(seg["end"]),   3),
            "words": words,
        })

    audio_arr = whisperx.load_audio(audio_path)
    model_a, metadata = whisperx.load_align_model(language_code="en", device=align_device)
    aligned = whisperx.align(wx_segs, model_a, metadata, audio_arr, align_device,
                             return_char_alignments=False)
    del model_a; gc.collect()

    print(f"   Done in {time.time()-t0:.1f}s")
    return aligned["segments"]


# ── Translate ─────────────────────────────────────────────────────────────────
def translate(segments: list[dict]) -> list[str]:
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
        if (i + 1) % 200 == 0:
            print(f"  … {i+1}/{len(segments)} translated", flush=True)
        time.sleep(0.12)
    print("   Translation complete.")
    return cn_texts


# ── Chapters ──────────────────────────────────────────────────────────────────
def build_chapters(ep_id: str, duration: float, interval: int) -> list[dict]:
    chapters, t, idx = [], 0.0, 1
    prefix = ep_id.replace("-", "")
    while t < duration:
        end = min(t + interval, duration)
        chapters.append({
            "id":          f"{prefix}c{idx}",
            "title":       f"Part {idx}",
            "description": f"{int(t)//60}:00 – {int(end)//60}:00",
            "start":       round(t, 1),
            "end":         round(end, 1),
        })
        t = end; idx += 1
    return chapters


# ── TypeScript helpers ────────────────────────────────────────────────────────
def ts_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")

def word_to_ts(w: dict, is_first: bool) -> str:
    text = w.get("word", "")
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


# ── Append to mockEpisodes.ts ─────────────────────────────────────────────────
def write_episode(args, sentences, chapters, duration):
    duration_r   = round(duration, 1)
    sentences_ts = "\n".join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = "\n".join(chapter_to_ts(c)  for c in chapters)

    # Derive YouTube embed URL from watch URL
    import re as _re
    m = _re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', args.url)
    video_url_ts = ""
    if m:
        vid_id = m.group(1)
        video_url_ts = f"\n    videoUrl: 'https://www.youtube.com/embed/{vid_id}?enablejsapi=1',"

    premium_ts = "\n    premium: true," if args.premium else ""

    ep_block = f"""  {{
    id: '{args.id}',
    podcastName: '{ts_escape(args.podcast)}',
    title: '{ts_escape(args.title)}',
    description:
      '{ts_escape(args.description)}',{video_url_ts}
    coverImage: '{args.cover}',
    duration: {duration_r},
    language: 'en-zh',{premium_ts}
    chapters: [
{chapters_ts}
    ],
    transcript: [
{sentences_ts}
    ],
  }},
"""

    mock_path = os.path.normpath(MOCK_TS)
    with open(mock_path, "r", encoding="utf-8") as f:
        existing = f.read()

    # Remove existing block with same id
    if f"id: '{args.id}'," in existing:
        print(f"[warn] Removing existing {args.id} block …")
        marker = f"  {{\n    id: '{args.id}',"
        si = existing.find(marker)
        if si != -1:
            ei = existing.find("\n  },\n", si)
            if ei != -1:
                existing = existing[:si] + existing[ei + 6:]

    if existing.rstrip().endswith("];"):
        new_content = existing.rstrip()[:-2].rstrip() + "\n" + ep_block + "];\n"
    else:
        new_content = existing.rstrip() + "\n" + ep_block + "];\n"

    with open(mock_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"\n✓ mockEpisodes.ts updated")
    print(f"  {len(sentences)} sentences · {duration_r}s · {len(chapters)} chapters")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    align_ok = torch.backends.mps.is_available()
    print(f"Device: mlx-whisper=GPU  align={'mps' if align_ok else 'cpu'}")
    print(f"Episode: {args.id}  interval: {args.chapter_interval}s\n")

    raw_json_path = os.path.join(SCRIPT_DIR, f"transcript_{args.id}.json")

    # ── 1. Download ───────────────────────────────────────────────────────────
    audio_path = download_audio(args.url, args.id)

    # ── 2+3. Transcribe + Align (or load cache) ───────────────────────────────
    if args.skip_transcribe and os.path.exists(raw_json_path):
        print(f"[skip] Loading cached transcript: {raw_json_path}")
        with open(raw_json_path, encoding="utf-8") as f:
            raw = json.load(f)
        segments = raw["segments"]
        duration = raw["duration"]
    else:
        raw_segs, duration = transcribe_mlx(audio_path, args.model)
        segments = align_whisperx(raw_segs, audio_path)

        # Cache
        raw_data = {
            "segments": [
                {"text": s.get("text",""), "start": s.get("start",0),
                 "end": s.get("end",0), "words": s.get("words",[])}
                for s in segments
            ],
            "duration": duration,
        }
        with open(raw_json_path, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)
        print(f"   Cached → {raw_json_path}")

    # ── 4. Translate ──────────────────────────────────────────────────────────
    cn_texts = translate(segments)

    # ── 5. Build sentence objects ─────────────────────────────────────────────
    sentences = []
    prefix = args.id.replace("-", "")
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
            "id":        f"{prefix}{i+1}",
            "startTime": round(seg["start"], 3),
            "endTime":   round(seg["end"],   3),
            "words":     words,
            "cnText":    cn,
        })

    # ── 6. Chapters ───────────────────────────────────────────────────────────
    chapters = build_chapters(args.id, duration, args.chapter_interval)

    # ── 7. Write ──────────────────────────────────────────────────────────────
    write_episode(args, sentences, chapters, duration)


if __name__ == "__main__":
    main()
