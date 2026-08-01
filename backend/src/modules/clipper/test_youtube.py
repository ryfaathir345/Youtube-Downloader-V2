import os
import sys
import json
import uuid
import asyncio
import subprocess
import tempfile
import warnings

warnings.filterwarnings("ignore")

# Force UTF-8 on Windows stdout to handle emoji
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

try:
    import yt_dlp
    import groq
except ImportError:
    print("Harap install dependencies terlebih dahulu: pip install yt-dlp groq google-generativeai")
    sys.exit(1)

from clipper_ai import generate_user_prompt, call_groq, call_gemini, deduplicate_and_merge

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Paths
FFMPEG_PATH      = r'C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
SCRIPT_DIR       = os.path.dirname(os.path.abspath(__file__))
SMART_CROP_PATH  = os.path.join(SCRIPT_DIR, '..', 'face-focus', 'smart_crop.py')
CLIPS_OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', '..', '..', 'clips')

# Target dimensions for 9:16 vertical format (short-form)
TARGET_W = 720
TARGET_H = 1280


# ─────────────────────────────────────────────────────────────────────────────
# DOWNLOAD
# ─────────────────────────────────────────────────────────────────────────────

def download_audio_from_youtube(url: str, session_id: str) -> str:
    print(f"[*] Mengunduh audio dari {url}...")
    audio_path = f"temp_audio_{session_id}.mp3"
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'temp_audio_{session_id}.%(ext)s',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '16'}],
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return audio_path


def download_video_from_youtube(url: str, session_id: str) -> str:
    """Download video (video+audio) in 720p max."""
    print("[*] Mengunduh video untuk diproses...")
    video_base = os.path.join(SCRIPT_DIR, f"temp_video_{session_id}")
    ydl_opts = {
        'format': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
        'outtmpl': video_base + '.%(ext)s',
        'merge_output_format': 'mp4',
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    for ext in ['mp4', 'mkv', 'webm']:
        candidate = video_base + '.' + ext
        if os.path.exists(candidate):
            return candidate
    return video_base + '.mp4'


# ─────────────────────────────────────────────────────────────────────────────
# TRANSCRIPTION
# ─────────────────────────────────────────────────────────────────────────────

def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe full audio using Groq Whisper with segment-level timestamps.
    Returns dict with 'text' (str) and 'segments' (list of {start, end, text}).
    """
    print("[*] Transkripsi audio menggunakan Groq Whisper (verbose_json + timestamps)...")
    if not GROQ_API_KEY:
        print("Error: GROQ_API_KEY belum di-set!")
        sys.exit(1)
    client = groq.Groq(api_key=GROQ_API_KEY)
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=(audio_path, f.read()),
            model="whisper-large-v3",
            prompt="Video berbahasa Indonesia.",
            response_format="verbose_json",
            timestamp_granularities=["segment"],
            language="id",
        )

    # Normalise segments (Groq may return objects or dicts)
    raw_segments = getattr(result, 'segments', None) or []
    segments = []
    for seg in raw_segments:
        if isinstance(seg, dict):
            segments.append({'start': seg.get('start', 0), 'end': seg.get('end', 0), 'text': seg.get('text', '')})
        else:
            segments.append({'start': getattr(seg, 'start', 0), 'end': getattr(seg, 'end', 0), 'text': getattr(seg, 'text', '')})

    return {'text': result.text, 'segments': segments}


def transcribe_clip_to_srt(clip_path: str, srt_path: str) -> bool:
    """
    Transcribe a short clip with word-level timestamps and write an SRT file.
    Uses Groq Whisper verbose_json + word timestamps.
    """
    print(f"  [subtitle] Membuat subtitle untuk {os.path.basename(clip_path)}...")
    if not GROQ_API_KEY:
        return False
    try:
        client = groq.Groq(api_key=GROQ_API_KEY)
        with open(clip_path, "rb") as f:
            result = client.audio.transcriptions.create(
                file=(os.path.basename(clip_path), f.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
                timestamp_granularities=["word"],
                language="id",
            )

        words = getattr(result, 'words', None) or []
        if not words:
            # Fallback: use segments if words not available
            segments = getattr(result, 'segments', []) or []
            lines = []
            for i, seg in enumerate(segments, 1):
                start = format_srt_time(seg.get('start', 0))
                end = format_srt_time(seg.get('end', 0))
                text = seg.get('text', '').strip()
                if text:
                    lines.append(f"{i}\n{start} --> {end}\n{text}\n")
        else:
            lines = words_to_srt_lines(words)

        with open(srt_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        return True
    except Exception as e:
        print(f"  [subtitle] Gagal: {e}", file=sys.stderr)
        return False


def words_to_srt_lines(words: list, max_words_per_line: int = 4) -> list:
    """Group word-level timestamps into subtitle lines."""
    lines = []
    i = 0
    idx = 1
    while i < len(words):
        group = words[i:i + max_words_per_line]
        try:
            start_t = float(group[0].get('start', 0) if isinstance(group[0], dict) else group[0].start)
            end_t   = float(group[-1].get('end', 0)   if isinstance(group[-1], dict) else group[-1].end)
            text    = ' '.join(
                w.get('word', '') if isinstance(w, dict) else w.word
                for w in group
            ).strip()
        except Exception:
            i += max_words_per_line
            continue

        if text:
            start_str = format_srt_time(start_t)
            end_str   = format_srt_time(end_t)
            lines.append(f"{idx}\n{start_str} --> {end_str}\n{text}\n")
            idx += 1
        i += max_words_per_line
    return lines


def format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ─────────────────────────────────────────────────────────────────────────────
# FACE TRACKING SMART CROP
# ─────────────────────────────────────────────────────────────────────────────

def run_smart_crop(video_path: str) -> str:
    """
    Run smart_crop.py on a clip to get a face-tracking 9:16 FFmpeg filter string.
    Falls back to a simple centre crop if face tracking fails or cv2 not available.
    """
    fallback = f"scale=-2:{TARGET_H},crop={TARGET_W}:{TARGET_H}:(iw-ow)/2:0"
    try:
        result = subprocess.run(
            [sys.executable, SMART_CROP_PATH, video_path, str(TARGET_W), str(TARGET_H)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=120,
        )
        if result.returncode != 0:
            print(f"  [face-track] smart_crop.py error: {result.stderr[:200]}", file=sys.stderr)
            return fallback

        data = json.loads(result.stdout.strip())
        if data.get('ok') and data.get('filter'):
            tracked = data.get('tracked', False)
            print(f"  [face-track] {'Face tracked' if tracked else 'Centre crop (no face)'}: {data['filter'][:80]}...")
            return data['filter']
        return fallback
    except Exception as e:
        print(f"  [face-track] Fallback ke centre crop: {e}", file=sys.stderr)
        return fallback


# ─────────────────────────────────────────────────────────────────────────────
# FFmpeg PIPELINE: CUT → CROP 9:16 + SUBTITLE BURN-IN
# ─────────────────────────────────────────────────────────────────────────────

def cut_raw_clip(video_path: str, start: float, end: float, raw_output: str) -> bool:
    """
    Frame-accurate cut using two-step seeking.

    Teknik: fast-seek ke ~10 detik sebelum target (keyframe aligned, sangat cepat),
    lalu decode frame-by-frame 10 detik terakhir menuju titik yang tepat.

    Ini jauh lebih akurat dari -c copy (yang hanya cut di keyframe setiap 2-5 detik).
    """
    PRECISE_WINDOW = 10.0   # detik window decode frame-by-frame
    duration = end - start

    # Step 1: fast-seek ke titik aman sebelum start
    fast_seek_to   = max(0.0, start - PRECISE_WINDOW)
    # Step 2: dari titik itu, decode presisi sejauh sisa detik ke start
    precise_offset = start - fast_seek_to  # 0..PRECISE_WINDOW

    result = subprocess.run([
        FFMPEG_PATH, '-y',
        '-ss', f'{fast_seek_to:.3f}',   # fast-seek (keyframe aligned)
        '-i', video_path,
        '-ss', f'{precise_offset:.3f}', # precise-seek dari titik fast-seek
        '-t',  f'{duration:.3f}',       # durasi tepat
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'ultrafast',         # cepat karena ini hanya file temp
        '-avoid_negative_ts', 'make_zero',
        raw_output,
    ], capture_output=True, encoding='utf-8', errors='replace')

    if result.returncode != 0:
        print(f"  [cut] FFmpeg stderr: {result.stderr[-300:]}", file=sys.stderr)
    return result.returncode == 0


def produce_final_clip(raw_clip: str, srt_path: str, crop_filter: str, output_path: str) -> bool:
    """
    Step 3 — Re-encode with 9:16 smart crop + burned subtitle in one FFmpeg pass.
    Subtitle style: white bold text, black outline, bottom-centre.
    """
    # Build subtitle filter string (use absolute path with forward slashes to avoid issues)
    srt_abs = srt_path.replace('\\', '/').replace(':', '\\:')

    subtitle_style = (
        "FontName=Arial,"
        "Bold=1,"
        "FontSize=20,"
        "PrimaryColour=&H00FFFFFF,"    # white fill
        "OutlineColour=&H00000000,"    # black outline
        "Outline=4,"
        "Shadow=0,"
        "Alignment=8,"                 # TOP-centre — tidak menutupi wajah
        "MarginV=80"                   # 80px dari atas
    )

    has_srt = os.path.exists(srt_path) and os.path.getsize(srt_path) > 10
    if has_srt:
        vf = f"{crop_filter},subtitles='{srt_abs}':force_style='{subtitle_style}'"
    else:
        vf = crop_filter

    result = subprocess.run([
        FFMPEG_PATH, '-y',
        '-i', raw_clip,
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        output_path,
    ], capture_output=True, encoding='utf-8', errors='replace')

    if result.returncode != 0:
        print(f"  [ffmpeg] stderr: {result.stderr[-400:]}", file=sys.stderr)
    return result.returncode == 0


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    if len(sys.argv) < 3:
        print("Usage: python test_youtube.py <YOUTUBE_URL> <NUM_CLIPS>")
        sys.exit(1)

    url       = sys.argv[1]
    num_clips = int(sys.argv[2])
    session_id = str(uuid.uuid4())[:8]

    # ── 1. Download audio ────────────────────────────────────────────────────
    audio_file = None
    try:
        audio_file = download_audio_from_youtube(url, session_id)
    except Exception as e:
        print(json.dumps({"error": f"Gagal mengunduh audio: {str(e)}"}))
        sys.exit(1)

    # ── 2. Transcribe full audio with timestamps ─────────────────────────────
    try:
        transcript_result = transcribe_audio(audio_file)
        transcript_text = transcript_result['text']
        transcript_segments = transcript_result['segments']
        print(f"[*] Transkrip selesai: {len(transcript_text)} karakter, {len(transcript_segments)} segmen dengan timestamp.")
    except Exception as e:
        print(json.dumps({"error": f"Gagal transkripsi: {str(e)}"}))
        sys.exit(1)
    finally:
        if audio_file and os.path.exists(audio_file):
            os.remove(audio_file)

    # ── 3. AI: pilih klip terbaik dengan timestamp nyata dari Whisper ─────────
    print("[*] Mencari klip menggunakan Groq & Gemini (Ensemble)...")
    prompt = generate_user_prompt(transcript_text, num_clips, segments=transcript_segments)
    groq_task   = asyncio.create_task(call_groq(prompt))
    gemini_task = asyncio.create_task(call_gemini(prompt))
    groq_clips, gemini_clips = await asyncio.gather(groq_task, gemini_task)
    final_clips = deduplicate_and_merge(groq_clips, gemini_clips, num_clips)

    # ── 4. Download full video ───────────────────────────────────────────────
    video_file = None
    try:
        os.makedirs(CLIPS_OUTPUT_DIR, exist_ok=True)
        video_file = download_video_from_youtube(url, session_id)

        print(f"[*] Memproses {len(final_clips)} klip: crop 9:16 + face tracking + subtitle...")

        for i, clip in enumerate(final_clips):
            clip_label = f"Klip {i+1}/{len(final_clips)}"
            start = float(clip.get('start_time', 0))
            end   = float(clip.get('end_time',   0))

            # Temp files for this clip
            raw_clip_path = os.path.join(SCRIPT_DIR, f"temp_raw_{session_id}_{i}.mp4")
            srt_path      = os.path.join(SCRIPT_DIR, f"temp_sub_{session_id}_{i}.srt")
            final_path    = os.path.join(CLIPS_OUTPUT_DIR, f"clip_{session_id}_{i}.mp4")

            try:
                # Step A — Cut raw clip (stream copy, fast)
                print(f"  [{clip_label}] Memotong segmen {start:.1f}s–{end:.1f}s...")
                if not cut_raw_clip(video_file, start, end, raw_clip_path):
                    raise RuntimeError("Gagal memotong raw clip")

                # Step B — Face-tracking smart crop filter
                print(f"  [{clip_label}] Analisis face tracking...")
                crop_filter = run_smart_crop(raw_clip_path)

                # Step C — Subtitle via Groq Whisper (word timestamps)
                sub_ok = transcribe_clip_to_srt(raw_clip_path, srt_path)

                # Step D — Final render: crop 9:16 + burn subtitle
                print(f"  [{clip_label}] Render final 9:16 + subtitle...")
                ok = produce_final_clip(raw_clip_path, srt_path, crop_filter, final_path)

                if ok:
                    clip['clip_url'] = f"/clips/clip_{session_id}_{i}.mp4"
                    clip['has_subtitle'] = sub_ok
                    print(f"  [{clip_label}] ✓ Selesai → clip_{session_id}_{i}.mp4")
                else:
                    raise RuntimeError("Render final gagal")

            except Exception as e:
                print(f"  [{clip_label}] ✗ Error: {e}", file=sys.stderr)
                clip['clip_url'] = None
                clip['has_subtitle'] = False
            finally:
                # Cleanup temp files for this clip
                for tmp in [raw_clip_path, srt_path]:
                    if os.path.exists(tmp):
                        try:
                            os.remove(tmp)
                        except Exception:
                            pass

    except Exception as e:
        print(f"[!] Error pipeline: {str(e)}", file=sys.stderr)
        for clip in final_clips:
            clip.setdefault('clip_url', None)
            clip.setdefault('has_subtitle', False)
    finally:
        if video_file and os.path.exists(video_file):
            try:
                os.remove(video_file)
            except Exception:
                pass

    print("\n=== HASIL KLIP ===")
    print(json.dumps({
        "success": True,
        "clips": final_clips,
        "meta": {
            "groq_clip_count":  len(groq_clips),
            "gemini_clip_count": len(gemini_clips),
            "final_clip_count":  len(final_clips),
            "format": f"{TARGET_W}x{TARGET_H} (9:16)",
        }
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
