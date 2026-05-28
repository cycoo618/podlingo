"""
generate_allin_ep3_cc.py — All-In E273 via YouTube auto-captions
-----------------------------------------------------------------
Much faster than Whisper: downloads CC in seconds, no ML model needed.

Steps:
  1. yt-dlp  → download auto-captions VTT (en)
  2. Parse VTT  → sentence segments + word-level timestamps
  3. GoogleTranslator zh-CN
  4. Append ep3 to src/data/mockEpisodes.ts

Usage:
  python3 scripts/generate_allin_ep3_cc.py
"""

import sys, subprocess, json, re, time, os
sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
YT_URL     = "https://www.youtube.com/watch?v=jJRAvZNGUvI"
CC_DIR     = os.path.join(SCRIPT_DIR, "allin_cc")
MOCK_TS    = os.path.join(SCRIPT_DIR, "..", "src", "data", "mockEpisodes.ts")
EP_ID      = "ep3"
CHAPTER_INTERVAL = 720   # 12-minute chapters


# ── Timestamp helpers ─────────────────────────────────────────────────────────
def ts_to_sec(ts: str) -> float:
    ts = ts.split()[0]   # strip any trailing flags like "align:start"
    parts = ts.replace(',', '.').split(':')
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


# ── Step 1: Download auto-captions ────────────────────────────────────────────
def download_cc() -> str:
    os.makedirs(CC_DIR, exist_ok=True)
    out_template = os.path.join(CC_DIR, "allin_ep3.%(ext)s")
    print(f"[1] Downloading auto-captions from YouTube …")
    cmd = [
        "yt-dlp",
        "--write-auto-subs",
        "--sub-langs", "en",
        "--sub-format", "vtt",
        "--skip-download",
        "-o", out_template,
        YT_URL,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("yt-dlp error:", r.stderr); sys.exit(1)

    # Find the VTT file
    for fname in os.listdir(CC_DIR):
        if fname.endswith(".vtt"):
            path = os.path.join(CC_DIR, fname)
            print(f"   → {path}")
            return path

    print("ERROR: no VTT file found in", CC_DIR)
    sys.exit(1)


# ── Step 2: Parse VTT ─────────────────────────────────────────────────────────
def parse_vtt(vtt_path: str) -> tuple[list[dict], float]:
    """
    Extract unique words from YouTube VTT by deduplicating on word start-time.
    YouTube CC cues are ROLLING (each cue repeats some words from the previous),
    so we collect ALL timestamped words across all cues and deduplicate by
    start-timestamp — this gives a clean, non-repeating word stream.
    Returns a list of raw word dicts for merge_segments() to group into sentences.
    """
    with open(vtt_path, encoding="utf-8") as f:
        raw = f.read()

    blocks  = re.split(r'\n{2,}', raw.strip())
    word_re = re.compile(r'<(\d{2}:\d{2}:\d{2}\.\d{3})><c>(.*?)</c>')
    tag_re  = re.compile(r'<[^>]+>')
    sp_re   = re.compile(r'\s+')

    all_words: list[dict] = []   # {word, start, end_cue, punct}
    seen_starts: set      = set()
    max_end = 0.0

    for block in blocks:
        lines = [l for l in block.split('\n') if l.strip()]
        ts_line = next((l for l in lines if '-->' in l), None)
        if not ts_line:
            continue

        arrow  = ts_line.index('-->')
        cue_end = ts_to_sec(ts_line[arrow + 3:].strip())
        max_end = max(max_end, cue_end)

        idx      = lines.index(ts_line)
        text_raw = ' '.join(lines[idx + 1:])

        matches = list(word_re.finditer(text_raw))
        for i, m in enumerate(matches):
            w_start = round(ts_to_sec(m.group(1)), 3)
            w_word  = m.group(2)
            if not w_word.strip() or w_start in seen_starts:
                continue
            seen_starts.add(w_start)
            w_end = round(ts_to_sec(matches[i + 1].group(1)), 3) if i + 1 < len(matches) else cue_end
            all_words.append({"word": w_word, "start": w_start, "end": round(w_end, 3)})

    all_words.sort(key=lambda w: w["start"])
    print(f"   → {len(all_words)} unique words, duration ≈ {max_end:.1f}s")
    return all_words, max_end


# ── Group flat word list into sentence-level segments ─────────────────────────
def merge_segments(words: list[dict], max_words: int = 25) -> list[dict]:
    """
    Group the flat deduplicated word list into sentence-level segments.
    Splits on sentence-ending punctuation or when word count hits max_words.
    """
    merged: list[dict] = []
    buf:    list[dict] = []

    def flush():
        if not buf:
            return
        text = "".join(
            w["word"] if i == 0 else
            (" " + w["word"] if not w["word"].startswith((" ", "'", ",", ".", "!", "?", ":", ";")) else w["word"])
            for i, w in enumerate(buf)
        ).strip()
        merged.append({
            "text":  text,
            "start": buf[0]["start"],
            "end":   buf[-1]["end"],
            "words": list(buf),
        })

    for w in words:
        buf.append(w)
        word_text = w["word"].rstrip()
        if (word_text and word_text[-1] in ".!?") or len(buf) >= max_words:
            flush()
            buf = []

    flush()
    print(f"   → grouped into {len(merged)} sentence-level segments")
    return merged


# ── Chapters ──────────────────────────────────────────────────────────────────
def build_chapters(duration: float) -> list[dict]:
    chapters, t, idx = [], 0.0, 1
    while t < duration:
        end = min(t + CHAPTER_INTERVAL, duration)
        chapters.append({
            "id":          f"ac{idx}",
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


CHECKPOINT = os.path.join(SCRIPT_DIR, "allin_ep3_cn_checkpoint.json")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # 1. Download CC
    vtt_path = download_cc()

    # 2. Parse VTT + merge into sentences
    print("[2] Parsing & merging VTT …")
    raw_cues, duration = parse_vtt(vtt_path)
    raw_segs = merge_segments(raw_cues)

    # 3. Translate with checkpoint/resume
    from deep_translator import GoogleTranslator
    translator = GoogleTranslator(source="en", target="zh-CN")

    # Load existing checkpoint if available
    cn_texts: list[str] = []
    start_from = 0
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, encoding="utf-8") as f:
            ckpt = json.load(f)
        if ckpt.get("total") == len(raw_segs):
            cn_texts = ckpt["cn_texts"]
            start_from = len(cn_texts)
            print(f"[resume] Checkpoint found: {start_from}/{len(raw_segs)} already translated")
        else:
            print(f"[warn] Checkpoint size mismatch, starting fresh")

    print(f"[3] Translating {len(raw_segs)} segments (from {start_from}) …")
    for i in range(start_from, len(raw_segs)):
        text = raw_segs[i]["text"].strip()
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
        # Save checkpoint every 50 segments
        if (i + 1) % 50 == 0:
            with open(CHECKPOINT, "w", encoding="utf-8") as f:
                json.dump({"total": len(raw_segs), "cn_texts": cn_texts}, f, ensure_ascii=False)
            print(f"  … {i+1}/{len(raw_segs)} translated ✓", flush=True)
        time.sleep(0.12)

    # Final checkpoint save
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump({"total": len(raw_segs), "cn_texts": cn_texts}, f, ensure_ascii=False)
    print("   Translation complete.")

    # 4. Build sentence objects
    sentences = []
    for i, (seg, cn) in enumerate(zip(raw_segs, cn_texts)):
        sentences.append({
            "id":        f"al{i+1}",
            "startTime": seg["start"],
            "endTime":   seg["end"],
            "words":     seg["words"],
            "cnText":    cn,
        })

    # 5. Chapters
    chapters = build_chapters(duration)
    print(f"   {len(chapters)} chapters @ {CHAPTER_INTERVAL//60}-min intervals")

    # 6. Render TypeScript block
    duration_r   = round(duration, 1)
    sentences_ts = "\n".join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = "\n".join(chapter_to_ts(c)  for c in chapters)

    ep3_block = f"""  {{
    id: '{EP_ID}',
    podcastName: 'All-In Podcast',
    title: 'E273: U.S.-China Relations & AI\\'s Impact on Enterprise Software',
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

    # 7. Append to mockEpisodes.ts (remove old ep3 block if present)
    mock_path = os.path.normpath(MOCK_TS)
    with open(mock_path, "r", encoding="utf-8") as f:
        existing = f.read()

    if f"id: '{EP_ID}'," in existing:
        print(f"[warn] Removing existing {EP_ID} block …")
        start_marker = f"  {{\n    id: '{EP_ID}',"
        start_idx = existing.find(start_marker)
        if start_idx != -1:
            end_idx = existing.find("\n  },\n", start_idx)
            if end_idx != -1:
                existing = existing[:start_idx] + existing[end_idx + 6:]

    if existing.rstrip().endswith("];"):
        new_content = existing.rstrip()[:-2].rstrip() + "\n" + ep3_block + "];\n"
    else:
        new_content = existing.rstrip() + "\n" + ep3_block + "];\n"

    with open(mock_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"\n✓ mockEpisodes.ts updated")
    print(f"  {len(sentences)} sentences · {duration_r}s · {len(chapters)} chapters")


if __name__ == "__main__":
    main()
