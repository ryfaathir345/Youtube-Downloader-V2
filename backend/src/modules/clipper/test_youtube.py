import os
import sys
import json
import uuid
import asyncio
import subprocess
import warnings

warnings.filterwarnings("ignore")

# Force UTF-8 on Windows stdout to handle emoji in viral_potential
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

# Path to ffmpeg binary
FFMPEG_PATH = r'C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'

# Output directory for clip files - resolves to backend/clips/
CLIPS_OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'clips')


def download_audio_from_youtube(url: str, session_id: str) -> str:
    print(f"[*] Mengunduh audio dari {url}...")
    audio_path = f"temp_audio_{session_id}.mp3"
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'temp_audio_{session_id}.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '16',
        }],
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return audio_path


def download_video_from_youtube(url: str, session_id: str) -> str:
    """Download video (video+audio) from YouTube in 720p max"""
    print("[*] Mengunduh video untuk dipotong...")
    video_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"temp_video_{session_id}")
    ydl_opts = {
        'format': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
        'outtmpl': video_path + '.%(ext)s',
        'merge_output_format': 'mp4',
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    # Find the downloaded file
    for ext in ['mp4', 'mkv', 'webm']:
        candidate = video_path + '.' + ext
        if os.path.exists(candidate):
            return candidate

    return video_path + '.mp4'


def cut_clip_with_ffmpeg(video_path: str, start: float, end: float, output_path: str) -> bool:
    """Cut a video clip using FFmpeg with accurate timestamps"""
    try:
        result = subprocess.run([
            FFMPEG_PATH, '-y',
            '-ss', str(start),
            '-to', str(end),
            '-i', video_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            output_path
        ], capture_output=True, text=True, encoding='utf-8', errors='replace')
        return result.returncode == 0
    except Exception as e:
        print(f"FFmpeg error: {e}", file=sys.stderr)
        return False


def transcribe_audio(audio_path: str) -> str:
    print("[*] Melakukan transkripsi audio menggunakan Groq Whisper...")
    if not GROQ_API_KEY:
        print("Error: GROQ_API_KEY belum di-set!")
        sys.exit(1)
        
    client = groq.Groq(api_key=GROQ_API_KEY)
    
    with open(audio_path, "rb") as file:
        transcription = client.audio.transcriptions.create(
            file=(audio_path, file.read()),
            model="whisper-large-v3",
            prompt="Video berbahasa Indonesia.",
            response_format="json",
            language="id"
        )
    return transcription.text


async def main():
    if len(sys.argv) < 3:
        print("Usage: python test_youtube.py <YOUTUBE_URL> <NUM_CLIPS>")
        sys.exit(1)
        
    url = sys.argv[1]
    num_clips = int(sys.argv[2])

    session_id = str(uuid.uuid4())[:8]
    
    # 1. Download audio
    audio_file = None
    try:
        audio_file = download_audio_from_youtube(url, session_id)
    except Exception as e:
        print(json.dumps({"error": f"Gagal mengunduh audio: {str(e)}"}))
        sys.exit(1)
        
    # 2. Transcribe
    try:
        transcript_text = transcribe_audio(audio_file)
        print(f"[*] Transkrip berhasil dibuat ({len(transcript_text)} karakter).")
    except Exception as e:
        print(json.dumps({"error": f"Gagal transkripsi: {str(e)}"}))
        sys.exit(1)
    finally:
        if audio_file and os.path.exists(audio_file):
            os.remove(audio_file)
            
    # 3. Get Clips using existing ensemble logic
    print("[*] Mencari klip menggunakan Groq & Gemini (Ensemble)...")
    prompt = generate_user_prompt(transcript_text, num_clips)
    
    groq_task = asyncio.create_task(call_groq(prompt))
    gemini_task = asyncio.create_task(call_gemini(prompt))
    
    groq_clips, gemini_clips = await asyncio.gather(groq_task, gemini_task)
    final_clips = deduplicate_and_merge(groq_clips, gemini_clips, num_clips)

    # 4. Download full video and cut each clip
    video_file = None
    try:
        os.makedirs(CLIPS_OUTPUT_DIR, exist_ok=True)
        video_file = download_video_from_youtube(url, session_id)

        print(f"[*] Memotong {len(final_clips)} klip dengan FFmpeg...")
        for i, clip in enumerate(final_clips):
            clip_filename = f"clip_{session_id}_{i}.mp4"
            clip_output_path = os.path.join(CLIPS_OUTPUT_DIR, clip_filename)

            start = float(clip.get('start_time', 0))
            end = float(clip.get('end_time', 0))

            success = cut_clip_with_ffmpeg(video_file, start, end, clip_output_path)
            if success:
                clip['clip_url'] = f"/clips/{clip_filename}"
                print(f"[*] Klip {i+1}/{len(final_clips)} berhasil dipotong: {clip_filename}")
            else:
                print(f"[!] Gagal memotong klip {i+1}", file=sys.stderr)
                clip['clip_url'] = None
    except Exception as e:
        print(f"[!] Peringatan: Gagal memotong video: {str(e)}", file=sys.stderr)
        for clip in final_clips:
            clip['clip_url'] = None
    finally:
        # Cleanup temp video
        if video_file and os.path.exists(video_file):
            os.remove(video_file)

    print("\n=== HASIL KLIP ===")
    print(json.dumps({
        "success": True,
        "clips": final_clips,
        "meta": {
            "groq_clip_count": len(groq_clips),
            "gemini_clip_count": len(gemini_clips),
            "final_clip_count": len(final_clips)
        }
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    asyncio.run(main())

