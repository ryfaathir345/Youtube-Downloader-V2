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

from clipper_ai import generate_user_prompt, call_groq, call_gemini, call_openrouter, snap_to_segments, deduplicate_and_merge

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

def emit_progress(stage: str, percent: int, detail: str = ""):
    progress_data = {
        "type": "progress",
        "stage": stage,
        "percent": percent,
        "detail": detail
    }
    print(f"\n=== PROGRESS === {json.dumps(progress_data)}", flush=True)

# Paths
FFMPEG_PATH      = r'C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
SCRIPT_DIR       = os.path.dirname(os.path.abspath(__file__))
SMART_CROP_PATH  = os.path.join(SCRIPT_DIR, '..', 'face-focus', 'smart_crop.py')
CLIPS_OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', '..', '..', 'clips')

# Target dimensions for 9:16 vertical format (short-form)
TARGET_W = 1080
TARGET_H = 1920


# ─────────────────────────────────────────────────────────────────────────────
# DOWNLOAD
# ─────────────────────────────────────────────────────────────────────────────

def download_audio_from_youtube(url: str, session_id: str) -> str:
    print(f"[*] Mengunduh audio dari {url}...")
    audio_path = f"temp_audio_{session_id}.mp3"
    def ydl_hook(d):
        if d['status'] == 'downloading':
            percent_str = d.get('_percent_str', '0%').strip('\x1b[0;94m% ')
            try:
                percent = int(float(percent_str))
                emit_progress("Downloading Media", percent, f"Mengunduh audio... {percent_str}%")
            except:
                pass

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'temp_audio_{session_id}.%(ext)s',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '16'}],
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [ydl_hook],
        # Use android client — works without JS runtime and bypasses most 403s
        'extractor_args': {'youtube': {'player_client': ['android', 'mweb']}},
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        },
        'nocheckcertificate': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return audio_path


def download_video_from_youtube(url: str, session_id: str) -> str:
    """Download video (video+audio) up to 1080p — tanpa android client agar bisa ambil resolusi penuh."""
    print("[*] Mengunduh video untuk diproses...")
    video_base = os.path.join(SCRIPT_DIR, f"temp_video_{session_id}")
    def ydl_hook(d):
        if d['status'] == 'downloading':
            percent_str = d.get('_percent_str', '0%').strip('\x1b[0;94m% ')
            try:
                percent = int(float(percent_str))
                emit_progress("Downloading Media", percent, f"Mengunduh video utama... {percent_str}%")
            except:
                pass

    ydl_opts = {
        # Ambil video terbaik hingga 1080p (mp4/webm) + audio terbaik, merge jadi mp4
        'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/bestvideo[height<=1080]/best[height<=1080]/best',
        'outtmpl': video_base + '.%(ext)s',
        'merge_output_format': 'mp4',
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [ydl_hook],
        # Tidak pakai android client — biarkan yt-dlp memilih client terbaik (web/innertube)
        # agar bisa mengambil stream hingga 1080p
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        },
        'nocheckcertificate': True,
        'retries': 5,
        'fragment_retries': 5,
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
    emit_progress("Transcribing Audio", 0, "Memulai transkripsi Whisper API...")
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

    emit_progress("Transcribing Audio", 100, "Transkripsi selesai")
    return {'text': result.text, 'segments': segments}


import time

# ─────────────────────────────────────────────────────────────────────────────
# TRANSCRIPTION & ASS SUBTITLE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

COLOR_PRESETS = {
    "white_black": {"primary": "&H00FFFFFF", "outline": "&H00000000"},
    "yellow_black": {"primary": "&H0000FFFF", "outline": "&H00000000"},
    "cyan_black": {"primary": "&H00FFFF00", "outline": "&H00000000"},
    "green_black": {"primary": "&H0000FF00", "outline": "&H00000000"},
}

FONT_PRESETS = ["Arial", "Poppins", "Montserrat", "Roboto", "Courier New"]
SIZE_PRESETS = {"small": 36, "medium": 48, "large": 64}


def format_ass_time(seconds: float) -> str:
    """Format seconds into ASS timestamp H:MM:SS.cs (centiseconds)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        s += cs // 100
        cs %= 100
        if s >= 60:
            m += s // 60
            s %= 60
            if m >= 60:
                h += m // 60
                m %= 60
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass_header(style_config: dict, position_config: str) -> str:
    """Build dynamic ASS header [V4+ Styles] based on user settings."""
    font = style_config.get("font", "Arial") if isinstance(style_config, dict) else "Arial"
    if font not in FONT_PRESETS:
        font = "Arial"

    color_key = style_config.get("color", "white_black") if isinstance(style_config, dict) else "white_black"
    colors = COLOR_PRESETS.get(color_key, COLOR_PRESETS["white_black"])

    size_val = style_config.get("size", "medium") if isinstance(style_config, dict) else "medium"
    if isinstance(size_val, int):
        font_size = size_val
    else:
        font_size = SIZE_PRESETS.get(size_val, 24)

    bold_flag = style_config.get("bold", True) if isinstance(style_config, dict) else True
    bold_val = 1 if bold_flag else 0

    # Subtitle position mapping to ASS Alignment and MarginV:
    # Atas -> Alignment=8, MarginV=80
    # Tengah -> Alignment=5, MarginV=0
    # Bawah -> Alignment=2, MarginV=60
    pos_lower = str(position_config).lower()
    if pos_lower == "top" or pos_lower == "atas":
        alignment = 8
        margin_v = 80
    elif pos_lower == "middle" or pos_lower == "tengah":
        alignment = 5
        margin_v = 0
    else:  # bottom / bawah
        alignment = 2
        margin_v = 60

    return (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {TARGET_W}\n"
        f"PlayResY: {TARGET_H}\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{font},{font_size},{colors['primary']},&H00000000,{colors['outline']},&H80000000,{bold_val},0,0,0,100,100,0,0,1,3,0,{alignment},20,20,{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )


TYPING_REVEAL_DELAY = 0.06  # detik — kompensasi word-timestamp Whisper yang cenderung early-bias


def words_to_ass_events(words: list, typing_animation: bool = False, max_words_per_line: int = 4) -> list:
    """Group word-level timestamps into ASS Dialogue event lines, optionally with typewriter effect."""
    events = []
    i = 0
    while i < len(words):
        group = words[i:i + max_words_per_line]
        if not group:
            break

        if not typing_animation:
            try:
                start_t = float(group[0].get('start', 0) if isinstance(group[0], dict) else group[0].start)
                end_t   = float(group[-1].get('end', 0)   if isinstance(group[-1], dict) else group[-1].end)
                text    = ' '.join(
                    w.get('word', '') if isinstance(w, dict) else w.word
                    for w in group
                ).strip()
                if text:
                    if end_t <= start_t:
                        end_t = start_t + 0.5
                    events.append(f"Dialogue: 0,{format_ass_time(start_t)},{format_ass_time(end_t)},Default,,0,0,0,,{text}")
            except Exception:
                pass
        else:
            # Typewriter animation (cumulative words event by event)
            try:
                group_words = []
                for w in group:
                    w_text = (w.get('word', '') if isinstance(w, dict) else w.word).strip()
                    w_start = float(w.get('start', 0) if isinstance(w, dict) else w.start)
                    w_end = float(w.get('end', 0) if isinstance(w, dict) else w.end)
                    group_words.append((w_text, w_start, w_end))

                # Geser sedikit titik "reveal" tiap kata ke depan untuk
                # mengompensasi word-timestamp Whisper yang sering early-bias.
                # Di-clamp supaya tidak melebihi waktu selesai kata itu sendiri.
                reveal_times = []
                for (_, w_start, w_end) in group_words:
                    reveal = w_start + TYPING_REVEAL_DELAY
                    if w_end > w_start:
                        reveal = min(reveal, w_end)
                    reveal_times.append(reveal)

                for k in range(len(group_words)):
                    _, _, w_end = group_words[k]
                    event_start = reveal_times[k]
                    if k < len(group_words) - 1:
                        event_end = max(reveal_times[k + 1], event_start + 0.1)
                    else:
                        event_end = max(w_end + TYPING_REVEAL_DELAY, event_start + 0.3)

                    cum_text = ' '.join(gw[0] for gw in group_words[:k + 1]).strip()
                    if cum_text:
                        events.append(f"Dialogue: 0,{format_ass_time(event_start)},{format_ass_time(event_end)},Default,,0,0,0,,{cum_text}")
            except Exception:
                pass

        i += max_words_per_line
    return events


def _extract_audio_for_groq(clip_path: str, audio_path: str, bitrate: str = "64k") -> bool:
    """
    Extract a small mono MP3 from a video clip using FFmpeg.
    Returns True on success, False on failure.
    """
    result = subprocess.run([
        FFMPEG_PATH, '-y',
        '-i', clip_path,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'libmp3lame',
        '-b:a', bitrate,
        audio_path,
    ], capture_output=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        print(f"  [subtitle] FFmpeg audio extract failed: {result.stderr[-200:]}", file=sys.stderr)
    return result.returncode == 0


def transcribe_clip_to_ass(
    clip_path: str,
    ass_path: str,
    style_config: dict = None,
    position_config: str = "top",
    typing_animation: bool = False,
    audio_extract_path: str = None,
) -> tuple:
    """
    Transcribe a short clip with word-level timestamps and write an ASS file.
    Extracts audio-only MP3 before uploading to Groq to avoid 413 errors on
    large video files.  Includes 1x retry for transient Groq errors and
    handles silent clips gracefully.
    Returns (has_subtitle: bool, subtitle_error: str | None).
    """
    print(f"  [subtitle] Membuat ASS subtitle untuk {os.path.basename(clip_path)}...")
    if not GROQ_API_KEY:
        return False, "GROQ_API_KEY tidak dikonfigurasi"

    if style_config is None:
        style_config = {}

    abs_clip_path = os.path.abspath(clip_path)
    abs_ass_path  = os.path.abspath(ass_path)

    # ── Audio extraction (avoid 413 by never sending raw video to Groq) ──────
    upload_path = abs_clip_path          # fallback: use video directly
    upload_name = os.path.basename(abs_clip_path)

    if audio_extract_path is not None:
        abs_audio_path = os.path.abspath(audio_extract_path)
        extracted = _extract_audio_for_groq(abs_clip_path, abs_audio_path, bitrate="64k")
        if not extracted:
            return False, "Gagal ekstrak audio dari klip untuk transkripsi"

        # Safety-net: if even 64k audio is still > 24 MB, retry at 32k
        MAX_GROQ_BYTES = 24 * 1024 * 1024   # 24 MB
        if os.path.getsize(abs_audio_path) > MAX_GROQ_BYTES:
            print("  [subtitle] Audio file > 24 MB, retrying extraction at 32k bitrate...", file=sys.stderr)
            extracted = _extract_audio_for_groq(abs_clip_path, abs_audio_path, bitrate="32k")
            if not extracted:
                return False, "Gagal ekstrak audio (32k retry) dari klip untuk transkripsi"
            if os.path.getsize(abs_audio_path) > MAX_GROQ_BYTES:
                return False, "Audio hasil ekstraksi masih melebihi batas ukuran Groq (>24 MB) bahkan setelah downgrade bitrate"

        upload_path = abs_audio_path
        upload_name = os.path.basename(abs_audio_path)
    else:
        print("  [subtitle] Peringatan: audio_extract_path tidak diberikan, mengirim video langsung ke Groq.", file=sys.stderr)

    # ── Groq Whisper transcription ────────────────────────────────────────────
    client = groq.Groq(api_key=GROQ_API_KEY)
    max_attempts = 2
    last_error = None
    result = None

    for attempt in range(1, max_attempts + 1):
        try:
            with open(upload_path, "rb") as f:
                result = client.audio.transcriptions.create(
                    file=(upload_name, f.read()),
                    model="whisper-large-v3",
                    response_format="verbose_json",
                    timestamp_granularities=["word"],
                    language="id",
                )
            last_error = None
            break
        except Exception as e:
            last_error = e
            err_str = str(e)
            is_transient = any(kw in err_str.lower() for kw in ["timeout", "500", "502", "503", "504", "connection", "rate_limit", "429"]) or isinstance(e, (groq.APIConnectionError, groq.APIStatusError))
            if is_transient and attempt < max_attempts:
                print(f"  [subtitle] Error sementara ({e}), mencoba ulang (retry 1x)...", file=sys.stderr)
                time.sleep(1.5)
                continue
            else:
                print(f"  [subtitle] Gagal transkripsi klip (attempt {attempt}/{max_attempts}): {e}", file=sys.stderr)
                break

    if last_error is not None:
        return False, f"Groq Whisper error: {str(last_error)}"

    words    = getattr(result, 'words',    None) or []
    segments = getattr(result, 'segments', None) or []
    full_text = getattr(result, 'text', '').strip()

    # Silent / no speech check (valid non-error condition)
    if not words and not segments and not full_text:
        print("  [subtitle] Klip senyap / tanpa suara terdeteksi (kondisi valid, skip subtitle).")
        return False, None

    header = build_ass_header(style_config, position_config)

    if words:
        events = words_to_ass_events(words, typing_animation=typing_animation)
    elif segments:
        events = []
        for seg in segments:
            start_t = float(seg.get('start', 0) if isinstance(seg, dict) else seg.start)
            end_t   = float(seg.get('end',   0) if isinstance(seg, dict) else seg.end)
            text    = (seg.get('text', '') if isinstance(seg, dict) else seg.text).strip()
            if text:
                events.append(f"Dialogue: 0,{format_ass_time(start_t)},{format_ass_time(end_t)},Default,,0,0,0,,{text}")
    else:
        events = []

    if not events:
        print("  [subtitle] Hasil transkripsi kosong (skip subtitle).")
        return False, None

    try:
        with open(abs_ass_path, 'w', encoding='utf-8') as f:
            f.write(header + '\n'.join(events) + '\n')
        return True, None
    except Exception as e:
        return False, f"Gagal menulis file ASS: {str(e)}"



# ─────────────────────────────────────────────────────────────────────────────
# FACE TRACKING SMART CROP
# ─────────────────────────────────────────────────────────────────────────────

def run_smart_crop(video_path: str) -> str:
    """
    Run smart_crop.py on a clip to get a face-tracking 9:16 FFmpeg filter string.
    Falls back to a simple centre crop if face tracking fails or cv2 not available.
    """
    # Correct center-crop fallback that guarantees 1080x1920 output:
    # scale agar tinggi minimal TARGET_H, lebar minimal TARGET_W, lalu crop tengah
    fallback = f"scale='if(gt(iw/ih,{TARGET_W}/{TARGET_H}),{-2},{TARGET_W})':-2,scale=-2:{TARGET_H},crop={TARGET_W}:{TARGET_H}"
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
        '-preset', 'superfast',
        '-crf', '14',                   # hampir lossless untuk intermediate
        '-avoid_negative_ts', 'make_zero',
        raw_output,
    ], capture_output=True, encoding='utf-8', errors='replace')

    if result.returncode != 0:
        print(f"  [cut] FFmpeg stderr: {result.stderr[-300:]}", file=sys.stderr)
    return result.returncode == 0


def produce_final_clip(raw_clip: str, ass_path: str, crop_filter: str, output_path: str) -> bool:
    """
    Step 3 — Re-encode with smart crop + burned ASS subtitle in one FFmpeg pass.
    Dynamic subtitle styles and positions are embedded in the ASS file header.
    """
    abs_ass = os.path.abspath(ass_path)
    has_ass = os.path.exists(abs_ass) and os.path.getsize(abs_ass) > 20

    if has_ass:
        # Escape Windows path for FFmpeg filter
        ass_ffmpeg_path = abs_ass.replace('\\', '/').replace(':', '\\:')
        vf = f"{crop_filter},subtitles='{ass_ffmpeg_path}'"
    else:
        vf = crop_filter

    result = subprocess.run([
        FFMPEG_PATH, '-y',
        '-i', raw_clip,
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'slow',              # slow preset = encoder terbaik = kualitas lebih tajam
        '-crf', '16',                   # crf 16 = kualitas sangat tinggi, tidak terasa compressed
        '-maxrate', '8M',               # pastikan bitrate tidak drop di bawah standar HD
        '-bufsize', '16M',
        '-c:a', 'aac',
        '-b:a', '192k',                 # audio bitrate yang baik
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
    start_time_real = time.time()
    
    if len(sys.argv) < 3:
        print("Usage: python test_youtube.py <YOUTUBE_URL> <NUM_CLIPS> [TARGET_DURATION] [ASPECT_RATIO] [SUBTITLE_CONFIG_JSON]")
        sys.exit(1)

    url       = sys.argv[1]
    num_clips = int(sys.argv[2])
    target_duration = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    aspect_ratio = sys.argv[4] if len(sys.argv) > 4 else "9:16"

    subtitle_config_raw = sys.argv[5] if len(sys.argv) > 5 else "{}"
    try:
        subtitle_config = json.loads(subtitle_config_raw)
    except Exception:
        subtitle_config = {}

    subtitle_style = subtitle_config.get("style", {})
    subtitle_position = subtitle_config.get("position", "top")
    typing_animation = subtitle_config.get("typingAnimation", False)
    # Debug: confirm frontend value arrives correctly as Python bool (not str)
    print(f"[debug] typing_animation = {typing_animation!r}  (type: {type(typing_animation).__name__})", file=sys.stderr)

    session_id = str(uuid.uuid4())[:8]

    global TARGET_W, TARGET_H
    if aspect_ratio == "16:9":
        TARGET_W = 1920
        TARGET_H = 1080
    else:
        TARGET_W = 1080
        TARGET_H = 1920

    print(f"[*] Starting job: url={url}, clips={num_clips}, duration={target_duration}s, aspect={aspect_ratio}, position={subtitle_position}, typingAnimation={typing_animation}")

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
    print("[*] Mencari klip menggunakan Groq, Gemini & OpenRouter (Ensemble)...")
    emit_progress("Analyzing with AI Models", 0, "Menganalisis menggunakan 3 AI Models...")
    prompt = generate_user_prompt(
        segments=transcript_segments,
        target_count=num_clips,
        target_duration=target_duration
    )
    groq_task   = asyncio.create_task(call_groq(prompt))
    gemini_task = asyncio.create_task(call_gemini(prompt))
    openrouter_task = asyncio.create_task(call_openrouter(prompt))

    completed_ai = 0
    def ai_done_cb(t):
        nonlocal completed_ai
        completed_ai += 1
        emit_progress("Analyzing with AI Models", int(completed_ai / 3 * 100), f"Model AI {completed_ai}/3 selesai")

    groq_task.add_done_callback(ai_done_cb)
    gemini_task.add_done_callback(ai_done_cb)
    openrouter_task.add_done_callback(ai_done_cb)

    groq_clips, gemini_clips, or_clips = await asyncio.gather(groq_task, gemini_task, openrouter_task)

    all_raw_clips = groq_clips + gemini_clips + or_clips
    snapped_clips = snap_to_segments(
        clips=all_raw_clips,
        segments=transcript_segments
    )
    final_clips = deduplicate_and_merge(
        all_clips=snapped_clips,
        target_count=num_clips,
        target_duration=target_duration
    )

    # ── 4. Download full video ───────────────────────────────────────────────
    video_file = None
    try:
        os.makedirs(CLIPS_OUTPUT_DIR, exist_ok=True)
        video_file = download_video_from_youtube(url, session_id)

        print(f"[*] Memproses {len(final_clips)} klip: crop {aspect_ratio} + subtitle...")
        emit_progress("Cutting Viral Clips", 0, f"Mempersiapkan render 0/{len(final_clips)} klip")

        for i, clip in enumerate(final_clips):
            clip_label = f"Klip {i+1}/{len(final_clips)}"
            start = float(clip.get('start_time', 0))
            end   = float(clip.get('end_time',   0))
            emit_progress("Cutting Viral Clips", int(i / len(final_clips) * 100), f"Merender klip {i+1} dari {len(final_clips)}")

            # Temp files for this clip
            raw_clip_path      = os.path.abspath(os.path.join(SCRIPT_DIR, f"temp_raw_{session_id}_{i}.mp4"))
            ass_path           = os.path.abspath(os.path.join(SCRIPT_DIR, f"temp_sub_{session_id}_{i}.ass"))
            audio_extract_path = os.path.abspath(os.path.join(SCRIPT_DIR, f"temp_sub_audio_{session_id}_{i}.mp3"))
            final_path         = os.path.abspath(os.path.join(CLIPS_OUTPUT_DIR, f"clip_{session_id}_{i}.mp4"))

            try:
                # Step A — Cut raw clip (stream copy, fast)
                print(f"  [{clip_label}] Memotong segmen {start:.1f}s–{end:.1f}s...")
                if not cut_raw_clip(video_file, start, end, raw_clip_path):
                    raise RuntimeError("Gagal memotong raw clip")

                # Step B — Face-tracking smart crop filter
                if aspect_ratio == "16:9":
                    print(f"  [{clip_label}] Format 16:9 dipilih, skip face tracking.")
                    crop_filter = f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2"
                else:
                    print(f"  [{clip_label}] Analisis face tracking...")
                    crop_filter = run_smart_crop(raw_clip_path)

                # Step C — Subtitle via Groq Whisper (word timestamps) into ASS
                # audio_extract_path is passed so transcribe_clip_to_ass sends a small
                # audio-only MP3 instead of the raw video, avoiding 413 errors.
                sub_ok, sub_err = transcribe_clip_to_ass(
                    raw_clip_path,
                    ass_path,
                    style_config=subtitle_style,
                    position_config=subtitle_position,
                    typing_animation=typing_animation,
                    audio_extract_path=audio_extract_path,
                )

                # Step D — Final render: crop + burn subtitle
                print(f"  [{clip_label}] Render final {aspect_ratio} + ASS subtitle...")
                ok = produce_final_clip(raw_clip_path, ass_path, crop_filter, final_path)

                if ok:
                    clip['clip_url'] = f"/clips/clip_{session_id}_{i}.mp4"
                    clip['has_subtitle'] = sub_ok
                    clip['subtitle_error'] = sub_err
                    print(f"  [{clip_label}] ✓ Selesai → clip_{session_id}_{i}.mp4 (Subtitle ok: {sub_ok})")
                else:
                    raise RuntimeError("Render final gagal")

            except Exception as e:
                print(f"  [{clip_label}] ✗ Error: {e}", file=sys.stderr)
                clip['clip_url'] = None
                clip['has_subtitle'] = False
                clip['subtitle_error'] = str(e)
            finally:
                # Cleanup temp files for this clip (including extracted audio)
                for tmp in [raw_clip_path, ass_path, audio_extract_path]:
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
            clip.setdefault('subtitle_error', str(e))
    finally:
        if video_file and os.path.exists(video_file):
            try:
                os.remove(video_file)
            except Exception:
                pass

    elapsed_time = round(time.time() - start_time_real, 2)
    
    emit_progress("Cutting Viral Clips", 100, f"Selesai merender {len(final_clips)} klip!")
    print("\n=== HASIL KLIP ===")
    print(json.dumps({
        "success": True,
        "clips": final_clips,
        "meta": {
            "groq_clip_count":  len(groq_clips),
            "gemini_clip_count": len(gemini_clips),
            "openrouter_clip_count": len(or_clips),
            "final_clip_count":  len(final_clips),
            "format": f"{TARGET_W}x{TARGET_H} ({aspect_ratio})",
            "processing_time_seconds": elapsed_time
        }
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
