"""
Generate ep1 TypeScript data from transcript_raw.json
Extracts the post-Olympic depression section (~84-153s),
applies a -83.0s offset (audio was trimmed starting at 83s),
and prints the words arrays for 9 pre-defined sentence groups.
"""
import json

OFFSET = 83.0  # audio trim start in original file

# Define sentence groups as (start, end) in ORIGINAL timestamps
GROUPS = [
    (84.400, 88.080),   # s1
    (88.380, 92.480),   # s2
    (93.280, 99.660),   # s3
    (99.660, 107.180),  # s4
    (107.900, 113.280), # s5
    (115.120, 123.580), # s6
    (128.860, 134.220), # s7
    (136.100, 145.120), # s8
    (145.440, 152.840), # s9
]

def fmt(t):
    return round(t - OFFSET, 3)

def clean(word_text):
    """Strip leading space from Whisper word."""
    return word_text.lstrip()

with open('scripts/transcript_raw.json') as f:
    data = json.load(f)

all_words = []
for seg in data['segments']:
    for w in seg.get('words', []):
        all_words.append(w)

for gi, (g_start, g_end) in enumerate(GROUPS):
    sentence_words = [w for w in all_words if g_start <= w['start'] < g_end or
                      (w['start'] >= g_start and w['end'] <= g_end + 0.05)]
    # filter to just those within range
    sentence_words = [w for w in all_words if w['start'] >= g_start - 0.01 and w['end'] <= g_end + 0.05]

    print(f"\n// --- s{gi+1}: [{fmt(g_start):.3f} - {fmt(g_end):.3f}] ---")
    print(f"// Original: [{g_start} - {g_end}]")

    # Reconstruct text
    text = ''.join(w['word'] for w in sentence_words).strip()
    print(f"// Text: {text}")

    print("words: [")
    for j, w in enumerate(sentence_words):
        word_text = w['word']
        # Strip leading space only from first word
        if j == 0:
            word_text = word_text.lstrip()

        start = fmt(w['start'])
        end = fmt(w['end'])
        print(f"  {{ text: {json.dumps(word_text)}, startTime: {start}, endTime: {end} }},")

    print("],")

    s_start = fmt(sentence_words[0]['start'])
    s_end = fmt(sentence_words[-1]['end'])
    print(f"// startTime: {s_start}, endTime: {s_end}")
