"""
generate_full_ep1.py
--------------------
Converts the full Whisper transcript (transcript_raw.json) into a complete
TypeScript Episode object for the Podlingo app.

- 1071 segments, 37 minutes, Eileen Gu interview
- Translates each sentence to Chinese (GoogleTranslator, free, no API key)
- Groups into 8 chapters (~4-5 min each)
- Outputs: scripts/full_ep1_sentences.ts  (the sentences + chapters snippet)
  and overwrites: src/data/mockEpisodes.ts

Usage: python3 scripts/generate_full_ep1.py
"""

import json, time, sys, os, re

# ── Chapter boundaries (seconds from video start) ────────────────────────────
CHAPTERS = [
    {
        'id': 'c1',
        'title': 'Post-Olympic Depression',
        'description': "There's a thing called post-Olympic depression — and it doesn't care if you won.",
        'start': 0,
        'end': 300,
    },
    {
        'id': 'c2',
        'title': 'The Making of a Skier',
        'description': "From a casual ski trip to World Cups — the role of mentorship and early failure.",
        'start': 300,
        'end': 600,
    },
    {
        'id': 'c3',
        'title': 'No Traditional Path',
        'description': "On skipping the conventional roadmap and charting your own course.",
        'start': 600,
        'end': 900,
    },
    {
        'id': 'c4',
        'title': 'The Olympics Decision',
        'description': "Choosing to represent China at age 14 — and what that actually meant.",
        'start': 900,
        'end': 1200,
    },
    {
        'id': 'c5',
        'title': 'Growing Up Biracial',
        'description': "Being authentically American and Chinese — without having to choose between the two.",
        'start': 1200,
        'end': 1500,
    },
    {
        'id': 'c6',
        'title': 'Money & Optimization',
        'description': "On financial independence, investing in yourself, and the real meaning of productivity.",
        'start': 1500,
        'end': 1800,
    },
    {
        'id': 'c7',
        'title': 'Handling Hate',
        'description': "Death threats, male intimidation, and why confidence isn't about ignoring the noise.",
        'start': 1800,
        'end': 2040,
    },
    {
        'id': 'c8',
        'title': 'Burnout & Recovery',
        'description': "The anxiety after the Olympics, learning to rest, and what comes next.",
        'start': 2040,
        'end': 2220,
    },
]

# ── Helpers ────────────────────────────────────────────────────────────────────
def ts_escape(s: str) -> str:
    """Escape backslashes and single quotes for a TS single-quoted string."""
    return s.replace('\\', '\\\\').replace("'", "\\'")

def word_to_ts(w: dict, is_first: bool) -> str:
    text = w['word']
    if is_first:
        text = text.lstrip()
    text_esc = ts_escape(text)
    return f"          {{ text: '{text_esc}', startTime: {w['start']}, endTime: {w['end']} }},"

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
    return (
        f"      {{ id: '{c['id']}', title: '{ts_escape(c['title'])}'"
        f"{desc}, startTime: {c['start']}, endTime: {c['end']} }},"
    )

# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    raw_path = os.path.join(script_dir, 'transcript_raw.json')
    out_snippet = os.path.join(script_dir, 'full_ep1_sentences.ts')
    out_mock = os.path.join(script_dir, '..', 'src', 'data', 'mockEpisodes.ts')

    print(f"Reading {raw_path} …")
    with open(raw_path, encoding='utf-8') as f:
        data = json.load(f)

    segments = data['segments']
    print(f"  {len(segments)} segments, {data['duration']:.1f}s total")

    # ── Translate ────────────────────────────────────────────────────────────
    from deep_translator import GoogleTranslator
    translator = GoogleTranslator(source='en', target='zh-CN')

    cn_texts = []
    print(f"Translating {len(segments)} segments to Chinese …")
    for i, seg in enumerate(segments):
        text = seg['text'].strip()
        if not text:
            cn_texts.append('')
            continue
        retries = 3
        for attempt in range(retries):
            try:
                cn = translator.translate(text) or text
                cn_texts.append(cn)
                break
            except Exception as e:
                if attempt < retries - 1:
                    time.sleep(2)
                else:
                    print(f"  [warn] translation failed for seg {i}: {e}")
                    cn_texts.append(text)
        if (i + 1) % 100 == 0:
            print(f"  … {i + 1}/{len(segments)} done")
        time.sleep(0.15)   # gentle rate limit

    print("Translation complete.")

    # ── Build sentence objects ────────────────────────────────────────────────
    sentences = []
    for i, (seg, cn) in enumerate(zip(segments, cn_texts)):
        words_raw = seg.get('words', [])
        if words_raw:
            words = [
                {
                    'word': w.get('word', ''),
                    'start': round(w.get('start', seg['start']), 3),
                    'end': round(w.get('end', seg['end']), 3),
                }
                for w in words_raw
            ]
        else:
            # Whisper gave no word-level timestamps — single pseudo-word
            words = [{
                'word': seg['text'].strip(),
                'start': round(seg['start'], 3),
                'end': round(seg['end'], 3),
            }]

        sentences.append({
            'id': f's{i + 1}',
            'startTime': round(seg['start'], 3),
            'endTime': round(seg['end'], 3),
            'words': words,
            'cnText': cn,
        })

    # ── Render TypeScript ────────────────────────────────────────────────────
    duration = round(data['duration'], 1)

    sentences_ts = '\n'.join(sentence_to_ts(s) for s in sentences)
    chapters_ts  = '\n'.join(chapter_to_ts(c) for c in CHAPTERS)

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
    duration: {duration},
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

    # Save snippet for inspection
    with open(out_snippet, 'w', encoding='utf-8') as f:
        f.write(full_episode)
    print(f"Snippet saved → {out_snippet}")

    # Overwrite mockEpisodes.ts
    with open(out_mock, 'w', encoding='utf-8') as f:
        f.write(full_episode)
    print(f"mockEpisodes.ts updated → {out_mock}")
    print(f"\nDone. {len(sentences)} sentences, {len(CHAPTERS)} chapters, {duration}s total.")


if __name__ == '__main__':
    main()
