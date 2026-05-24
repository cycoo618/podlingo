"""
translate_jre_ep2.py
--------------------
Reads the already-aligned transcript_jre2504.json (transcription + alignment
already done) and runs only:
  - Chinese translation via GoogleTranslator
  - TypeScript generation → appends ep2 to mockEpisodes.ts

Usage: python3 scripts/translate_jre_ep2.py
"""

import sys
sys.stdout.reconfigure(line_buffering=True)

import json, time, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_JSON   = os.path.join(SCRIPT_DIR, 'transcript_jre2504.json')
MOCK_TS    = os.path.join(SCRIPT_DIR, '..', 'src', 'data', 'mockEpisodes.ts')

CHAPTER_INTERVAL = 600  # 10-minute chapters

def build_chapters(duration):
    chapters, t, idx = [], 0.0, 1
    while t < duration:
        end = min(t + CHAPTER_INTERVAL, duration)
        chapters.append({
            'id': f'jc{idx}', 'title': f'Part {idx}',
            'description': f'{int(t)//60}:00 – {int(end)//60}:00',
            'start': round(t, 1), 'end': round(end, 1),
        })
        t, idx = end, idx + 1
    return chapters

def ts_escape(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")

def word_to_ts(w, is_first):
    text = w['word']
    if is_first: text = text.lstrip()
    return f"          {{ text: '{ts_escape(text)}', startTime: {w['start']}, endTime: {w['end']} }},"

def sentence_to_ts(s):
    lines = ["      {", f"        id: '{s['id']}',",
             f"        startTime: {s['startTime']},", f"        endTime: {s['endTime']},",
             "        words: ["]
    for i, w in enumerate(s['words']):
        lines.append(word_to_ts(w, i == 0))
    lines += ["        ],", f"        cnText: '{ts_escape(s['cnText'])}',",
              "        wordMappings: [],", "      },"]
    return '\n'.join(lines)

def chapter_to_ts(c):
    desc = f", description: '{ts_escape(c['description'])}'" if c.get('description') else ''
    return (f"      {{ id: '{c['id']}', title: '{ts_escape(c['title'])}'"
            f"{desc}, startTime: {c['start']}, endTime: {c['end']} }},")

def main():
    print(f"Loading {RAW_JSON} …")
    with open(RAW_JSON, encoding='utf-8') as f:
        data = json.load(f)
    segments = data['segments']
    duration = data['duration']
    print(f"  {len(segments)} segments, {duration:.1f}s")

    # ── Translate ─────────────────────────────────────────────────────────────
    from deep_translator import GoogleTranslator
    translator = GoogleTranslator(source='en', target='zh-CN')

    cn_texts = []
    print(f"Translating {len(segments)} segments …")
    for i, seg in enumerate(segments):
        text = seg.get('text', '').strip()
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

    # ── Build sentences ────────────────────────────────────────────────────────
    sentences = []
    for i, (seg, cn) in enumerate(zip(segments, cn_texts)):
        words_raw = seg.get('words', [])
        if words_raw:
            words = [{'word': w.get('word', ''),
                      'start': round(w.get('start', seg['start']), 3),
                      'end':   round(w.get('end',   seg['end']),   3)}
                     for w in words_raw]
        else:
            words = [{'word': seg.get('text', '').strip(),
                      'start': round(seg['start'], 3), 'end': round(seg['end'], 3)}]
        sentences.append({'id': f'jre{i+1}', 'startTime': round(seg['start'], 3),
                          'endTime': round(seg['end'], 3), 'words': words, 'cnText': cn})

    # ── Chapters ──────────────────────────────────────────────────────────────
    chapters = build_chapters(duration)
    print(f"  {len(chapters)} chapters generated")

    # ── TypeScript ────────────────────────────────────────────────────────────
    duration_r   = round(duration, 1)
    sentences_ts = '\n'.join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = '\n'.join(chapter_to_ts(c)  for c in chapters)

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

    mock_path = os.path.normpath(MOCK_TS)
    with open(mock_path, 'r', encoding='utf-8') as f:
        existing = f.read()

    # Check if ep2 already exists — remove it first to avoid duplicates
    if "'ep2'" in existing or '"ep2"' in existing:
        print("  ep2 already in mockEpisodes.ts — removing old version first …")
        # Find and remove the ep2 block (between id:'ep2' marker and next episode or closing)
        import re
        existing = re.sub(r"\s*\{[^{}]*id:\s*'ep2'.*?(?=\s*\{[^{}]*id:|];)", '',
                          existing, flags=re.DOTALL)

    if existing.rstrip().endswith('];'):
        new_content = existing.rstrip()[:-2].rstrip() + '\n' + ep2_block + '];\n'
    else:
        new_content = existing.rstrip() + '\n' + ep2_block + '];\n'

    with open(mock_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"\nmockEpisodes.ts updated → {mock_path}")
    print(f"Done. {len(sentences)} sentences, {duration_r}s, {len(chapters)} chapters.")

if __name__ == '__main__':
    main()
