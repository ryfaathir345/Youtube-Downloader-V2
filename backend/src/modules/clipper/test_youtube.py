import os
import sys
import json
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

def download_audio_from_youtube(url: str) -> str:
    print(f"[*] Mengunduh audio dari {url}...")
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': 'temp_audio.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '16',
        }],
        'ffmpeg_location': r'C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe',
        'quiet': True,
        'no_warnings': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return "temp_audio.mp3"

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
    
    # 1. Download audio
    try:
        audio_file = download_audio_from_youtube(url)
    except Exception as e:
        print(f"Gagal mengunduh audio: {e}")
        print("Pastikan Anda memiliki 'ffmpeg' yang terinstall dan ada di PATH.")
        sys.exit(1)
        
    # 2. Transcribe
    try:
        transcript_text = transcribe_audio(audio_file)
        print(f"\n[*] Transkrip berhasil dibuat ({len(transcript_text)} karakter).")
    except Exception as e:
        print(f"Gagal transkripsi: {e}")
        sys.exit(1)
    finally:
        if os.path.exists(audio_file):
            os.remove(audio_file)
            
    # 3. Get Clips using existing ensemble logic
    print("[*] Mencari klip menggunakan Groq & Gemini (Ensemble)...")
    prompt = generate_user_prompt(transcript_text, num_clips)
    
    groq_task = asyncio.create_task(call_groq(prompt))
    gemini_task = asyncio.create_task(call_gemini(prompt))
    
    groq_clips, gemini_clips = await asyncio.gather(groq_task, gemini_task)
    
    final_clips = deduplicate_and_merge(groq_clips, gemini_clips, num_clips)
    
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
