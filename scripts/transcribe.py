"""
Download audio from YouTube and transcribe with Whisper (word-level timestamps).
Usage: python3 scripts/transcribe.py <youtube_url> [--model small]
Output: scripts/transcript_raw.json
"""

import sys
import os
import json
import argparse
import tempfile
import subprocess

def download_audio(url: str, out_path: str) -> str:
    """Download best audio track as mp3 via yt-dlp."""
    print(f"[1/3] Downloading audio from {url} …")
    cmd = [
        "yt-dlp",
        "-x",                          # extract audio only
        "--audio-format", "mp3",
        "--audio-quality", "0",        # best quality
        "--no-playlist",
        "-o", out_path,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("yt-dlp error:", result.stderr)
        sys.exit(1)
    # yt-dlp may append extension; find the file
    base = out_path.replace(".%(ext)s", "")
    for ext in ["mp3", "m4a", "webm", "opus"]:
        p = f"{base}.{ext}"
        if os.path.exists(p):
            print(f"   → saved to {p}")
            return p
    # fallback: just return original
    return out_path


def transcribe(audio_path: str, model_name: str) -> dict:
    import whisper
    print(f"[2/3] Loading Whisper model '{model_name}' …")
    model = whisper.load_model(model_name)
    print(f"[2/3] Transcribing {audio_path} (word timestamps enabled) …")
    result = model.transcribe(
        audio_path,
        language="en",
        word_timestamps=True,
        verbose=False,
    )
    return result


def build_output(result: dict) -> dict:
    """
    Flatten whisper output into a clean structure:
    {
      "duration": float,
      "segments": [
        {
          "id": int,
          "start": float,
          "end": float,
          "text": str,
          "words": [{"word": str, "start": float, "end": float, "probability": float}]
        }
      ]
    }
    """
    segments = []
    for seg in result.get("segments", []):
        words = []
        for w in seg.get("words", []):
            words.append({
                "word": w.get("word", ""),
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
                "probability": round(w.get("probability", 1.0), 3),
            })
        segments.append({
            "id": seg["id"],
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
            "words": words,
        })

    duration = result["segments"][-1]["end"] if result["segments"] else 0
    return {"duration": round(duration, 1), "segments": segments}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="YouTube URL")
    parser.add_argument("--model", default="small", help="Whisper model: tiny/base/small/medium/large")
    parser.add_argument("--out", default="scripts/transcript_raw.json")
    args = parser.parse_args()

    # audio output path
    audio_out = "scripts/audio.%(ext)s"

    audio_path = download_audio(args.url, audio_out)
    result = transcribe(audio_path, args.model)
    output = build_output(result)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[3/3] Saved {len(output['segments'])} segments → {args.out}")
    print(f"      Duration: {output['duration']}s")
    print(f"\nFirst 3 segments:")
    for seg in output["segments"][:3]:
        print(f"  [{seg['start']:.1f}-{seg['end']:.1f}] {seg['text']}")


if __name__ == "__main__":
    main()
