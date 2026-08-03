import os
import sys
import json
import asyncio
import warnings
import urllib.request
from typing import List, Dict, Any

# Suppress deprecation warnings from google generativeai
warnings.filterwarnings("ignore")

# Force UTF-8 on Windows stdout to handle emoji in viral_potential
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure required libraries are installed:
# pip install groq google-generativeai

try:
    import groq
    import google.generativeai as genai
except ImportError:
    print(json.dumps({"error": "Missing required libraries (groq, google.generativeai)"}))
    sys.exit(1)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

SYSTEM_PROMPT = """Anda adalah editor video short-form berbahasa Indonesia, bukan peringkas subtitle.
Pahami konteks transcript dan pilih momen yang benar-benar penting atau viral.
Untuk edukasi, ambil konsep inti atau penjelasan yang actionable.
Untuk podcast, ambil opini kuat, debat, cerita personal, klaim mengejutkan, atau insight tajam.
Untuk hiburan, ambil punchline, momen lucu, reaksi, twist, atau energi viral.
Berikan juga penilaian potensi viral (virality_score: 1-100) dan label potensi viral.

PENTING — ATURAN TIMESTAMP:
- Transcript diberikan dalam format: [MM:SS --> MM:SS] teks
- Nilai start_time dan end_time WAJIB diambil langsung dari angka waktu yang tertulis di transcript
- DILARANG keras mengarang, mengira-ngira, atau menginterpolasi timestamp
- Contoh: jika kamu pilih segmen [01:23 --> 01:38], maka start_time=83.0, end_time=98.0
- Pastikan klip yang dipilih benar-benar berisi konten yang sesuai dengan title dan hook-nya

Semua title, hook, reason wajib bahasa Indonesia natural.
Klip harus non-overlap dan tersebar di beberapa bagian video.
Jawab HANYA dalam JSON valid:
{"clips": [{"title": "Judul", "hook": "Hook kalimat", "content_type": "edukasi/podcast/hiburan", "reason": "Alasan", "virality_score": 95, "viral_potential": "🔥 High Viral Potential", "start_time": 83.0, "end_time": 98.0, "duration_seconds": 15}]}
"""


def format_segments_for_prompt(segments: List[Dict]) -> str:
    """Format Whisper segment timestamps into a human+AI readable transcript."""
    lines = []
    for seg in segments:
        start = seg.get('start', 0)
        end   = seg.get('end',   0)
        text  = seg.get('text', '').strip()
        if not text:
            continue
        m_s, s_s = divmod(int(start), 60)
        m_e, s_e = divmod(int(end),   60)
        line = f"[{m_s:02d}:{s_s:02d} --> {m_e:02d}:{s_e:02d}] {text}"
        lines.append(line)
    return '\n'.join(lines)


def generate_user_prompt(segments: List[Dict], target_count: int, target_duration: int) -> str:
    transcript_formatted = format_segments_for_prompt(segments)

    return f"""Berikut adalah transcript video dengan TIMESTAMP NYATA dari transkripsi otomatis:

{transcript_formatted}

Pilih tepat {target_count} momen short-form terkuat dari transcript di atas.
Aturan:
- Target durasi tiap klip adalah {target_duration} detik (toleransi ±3 detik).
- start_time dan end_time HARUS diambil dari nilai detik di timestamp [MM:SS --> MM:SS] di atas.
- Semua klip non-overlap dan menyebar di berbagai bagian video.
- Pastikan isi klip (start→end) benar-benar berisi konten yang sesuai title dan hook.
"""

async def call_groq(prompt: str) -> List[Dict]:
    if not GROQ_API_KEY:
        return []
    try:
        client = groq.AsyncGroq(api_key=GROQ_API_KEY)
        response = await client.chat.completions.create(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            model="openai/gpt-oss-20b",
            temperature=0.3,
            max_tokens=3000,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        clips = data.get("clips", [])
        for c in clips:
            c["source"] = "groq"
        return clips
    except Exception as e:
        print(f"Exception in Groq: {e}", file=sys.stderr)
        return []

async def call_gemini(prompt: str) -> List[Dict]:
    if not GEMINI_API_KEY:
        return []
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            'gemini-3.6-flash',
            system_instruction=SYSTEM_PROMPT
        )
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3
            )
        )
        data = json.loads(response.text)
        clips = data.get("clips", [])
        for c in clips:
            c["source"] = "gemini"
        return clips
    except Exception as e:
        print(f"Exception in Gemini: {e}", file=sys.stderr)
        return []

def _openrouter_sync(prompt: str) -> List[Dict]:
    if not OPENROUTER_API_KEY:
        return []
    try:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "google/gemma-2-9b-it:free",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3
        }
        req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"]
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            parsed = json.loads(content.strip())
            clips = parsed.get("clips", [])
            for c in clips:
                c["source"] = "openrouter"
            return clips
    except Exception as e:
        print(f"Exception in OpenRouter: {e}", file=sys.stderr)
        return []

async def call_openrouter(prompt: str) -> List[Dict]:
    return await asyncio.to_thread(_openrouter_sync, prompt)

def chunk_segments(segments: List[Dict], max_duration_sec: int = 240) -> List[List[Dict]]:
    chunks = []
    current_chunk = []
    current_start = -1

    for seg in segments:
        if current_start == -1:
            current_start = seg.get('start', 0)

        current_chunk.append(seg)
        end = seg.get('end', 0)

        if end - current_start >= max_duration_sec:
            chunks.append(current_chunk)
            current_chunk = []
            current_start = -1

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

def snap_to_segments(clips: List[Dict], segments: List[Dict]) -> List[Dict]:
    snapped_clips = []
    if not segments:
        return clips

    for clip in clips:
        st = float(clip.get("start_time", 0))
        et = float(clip.get("end_time", 0))

        # Find closest start segment
        closest_start_seg = min(segments, key=lambda s: abs(s.get('start', 0) - st))
        # Find closest end segment
        closest_end_seg = min(segments, key=lambda s: abs(s.get('end', 0) - et))

        actual_start = closest_start_seg.get('start', 0)
        actual_end = closest_end_seg.get('end', 0)

        if actual_end <= actual_start:
            continue

        clip["start_time"] = actual_start
        clip["end_time"] = actual_end
        clip["duration_seconds"] = actual_end - actual_start
        snapped_clips.append(clip)

    return snapped_clips

def deduplicate_and_merge(all_clips: List[Dict], target_count: int, target_duration: int) -> List[Dict]:
    # Sort clips primarily by virality_score descending
    for clip in all_clips:
        if "virality_score" not in clip or not isinstance(clip["virality_score"], (int, float)):
            clip["virality_score"] = 80

    all_clips.sort(key=lambda x: x.get("virality_score", 0), reverse=True)

    final_clips = []

    for clip in all_clips:
        start = float(clip.get("start_time", 0))
        end = float(clip.get("end_time", 0))
        duration = end - start

        # Validate duration is within target_duration - 3 to target_duration + 5
        if not (target_duration - 3 <= duration <= target_duration + 5):
            continue

        # Check overlap with existing final_clips
        is_overlapping = False
        for fc in final_clips:
            fs = float(fc.get("start_time", 0))
            fe = float(fc.get("end_time", 0))
            # overlap condition
            if max(start, fs) < min(end, fe):
                is_overlapping = True
                break

        if not is_overlapping:
            if "viral_potential" not in clip or not clip["viral_potential"]:
                score = clip["virality_score"]
                if score >= 90:
                    clip["viral_potential"] = "🔥 High Views Potential"
                elif score >= 80:
                    clip["viral_potential"] = "⚡ Momen Viral Tinggi"
                else:
                    clip["viral_potential"] = "🚀 Trending Candidate"
            final_clips.append(clip)

        if len(final_clips) >= target_count:
            break

    # Sort final clips chronologically
    final_clips.sort(key=lambda x: x.get("start_time", 0))
    return final_clips

async def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python clipper_ai.py <transcript_file.json> <num_clips> <target_duration>"}))
        sys.exit(1)

    transcript_file = sys.argv[1]
    num_clips = int(sys.argv[2])
    target_duration = int(sys.argv[3])

    if not os.path.exists(transcript_file):
        print(json.dumps({"error": f"File not found: {transcript_file}"}))
        sys.exit(1)

    try:
        with open(transcript_file, "r", encoding="utf-8") as f:
            segments = json.load(f)
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse JSON transcript: {e}"}))
        sys.exit(1)

    # Chunk segments (~4 mins max)
    chunks = chunk_segments(segments, max_duration_sec=240)

    # Request proportional amount of clips per chunk
    clips_per_chunk = max(1, num_clips // max(1, len(chunks)))
    if clips_per_chunk == 1 and num_clips > len(chunks):
        clips_per_chunk = 2

    all_raw_clips = []

    for chunk in chunks:
        prompt = generate_user_prompt(
            segments=chunk,
            target_count=clips_per_chunk,
            target_duration=target_duration
        )

        # Call AI providers concurrently
        groq_task = asyncio.create_task(call_groq(prompt))
        gemini_task = asyncio.create_task(call_gemini(prompt))
        openrouter_task = asyncio.create_task(call_openrouter(prompt))

        res = await asyncio.gather(groq_task, gemini_task, openrouter_task)
        for provider_clips in res:
            all_raw_clips.extend(provider_clips)

    if not all_raw_clips:
        print(json.dumps({"error": "All AI providers failed to return valid clips"}))
        sys.exit(1)

    # Snap timestamps to actual Whisper segments
    snapped_clips = snap_to_segments(all_raw_clips, segments)

    # Dedup & merge & sort
    final_clips = deduplicate_and_merge(
        all_clips=snapped_clips,
        target_count=num_clips,
        target_duration=target_duration
    )

    print(json.dumps({
        "success": True,
        "clips": final_clips,
        "meta": {
            "raw_clip_count": len(all_raw_clips),
            "final_clip_count": len(final_clips)
        }
    }, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
