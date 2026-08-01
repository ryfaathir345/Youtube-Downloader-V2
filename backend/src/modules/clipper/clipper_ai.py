import os
import sys
import json
import asyncio
import warnings

# Suppress deprecation warnings from google generativeai
warnings.filterwarnings("ignore")

# Force UTF-8 on Windows stdout to handle emoji in viral_potential
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')
from typing import List, Dict, Any

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

SYSTEM_PROMPT = """Anda adalah editor video short-form berbahasa Indonesia, bukan peringkas subtitle.
Pahami konteks transcript dan pilih momen yang benar-benar penting atau viral.
Untuk edukasi, ambil konsep inti atau penjelasan yang actionable.
Untuk podcast, ambil opini kuat, debat, cerita personal, klaim mengejutkan, atau insight tajam.
Untuk hiburan, ambil punchline, momen lucu, reaksi, twist, atau energi viral.
Berikan juga penilaian potensi viral (virality_score: 1-100) dan label potensi viral (viral_potential: misal '🔥 High Viral Potential', '⚡ Potensi View Tinggi', '🚀 Momen Edukasi Viral').
Semua title, hook, reason, dan teks output wajib bahasa Indonesia natural.
Gunakan hanya transcript yang diberikan. Jangan mengarang fakta, judul, hook, timestamp, speaker, atau momen.
Klip harus non-overlap dan tersebar di beberapa bagian video.
Jawab HANYA dalam JSON valid dengan struktur:
{"clips": [{"title": "Judul", "hook": "Hook kalimat", "content_type": "edukasi/podcast/hiburan", "reason": "Alasan", "virality_score": 95, "viral_potential": "🔥 High Viral Potential", "start_time": 60.5, "end_time": 75.2, "duration_seconds": 15}]}
"""

def generate_user_prompt(transcript: str, target_count: int) -> str:
    # Memotong transkrip agar tidak melebihi limit ~6000 tokens dari Groq Free Tier
    transcript = transcript[:10000]
    return f"""Berikut adalah transcript video:
{transcript}

Pilih tepat {target_count} momen short-form terkuat dari transcript di atas.
Aturan:
- Tiap klip harus antara 15 hingga 60 detik.
- start_time dan end_time wajib dalam detik (float/int).
- Semua klip wajib non-overlap dan menyebar.
- Prioritaskan potongan yang punya setup dan payoff utuh.
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
            model="llama-3.1-8b-instant",
            temperature=0.3,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        clips = data.get("clips", [])
        for c in clips:
            c["source"] = "groq"
        return clips
    except Exception as e:
        print(f"Exception in Groq: {e}")
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
        print(f"Exception in Gemini: {e}")
        return []

def deduplicate_and_merge(groq_clips: List[Dict], gemini_clips: List[Dict], target_count: int) -> List[Dict]:
    # Simple ensemble logic: Combine all clips, sort by some metric (or just interleave), and deduplicate overlaps
    all_clips = groq_clips + gemini_clips

    # Sort clips primarily by start_time to check overlaps
    all_clips.sort(key=lambda x: x.get("start_time", 0))

    final_clips = []

    for clip in all_clips:
        start = float(clip.get("start_time", 0))
        end = float(clip.get("end_time", 0))

        # Check overlap with existing final_clips
        is_overlapping = False
        for fc in final_clips:
            fs = float(fc.get("start_time", 0))
            fe = float(fc.get("end_time", 0))
            # overlap condition
            if max(start, fs) < min(end, fe):
                is_overlapping = True
                # If overlap, we could bump up a "confidence_score" or just ignore
                # Here we just ignore the overlapping one to ensure distinct clips
                break

        if not is_overlapping and (end - start) >= 10:
            if "virality_score" not in clip or not isinstance(clip["virality_score"], (int, float)):
                clip["virality_score"] = 88 + (len(final_clips) * 3) % 10
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

    # Sort final clips by virality_score descending so highest score comes first
    final_clips.sort(key=lambda x: x.get("virality_score", 0), reverse=True)
    return final_clips[:target_count]

async def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python clipper_ai.py <transcript_file.txt> <num_clips>"}))
        sys.exit(1)

    transcript_file = sys.argv[1]
    num_clips = int(sys.argv[2])

    if not os.path.exists(transcript_file):
        print(json.dumps({"error": f"File not found: {transcript_file}"}))
        sys.exit(1)

    with open(transcript_file, "r", encoding="utf-8") as f:
        transcript_text = f.read()

    prompt = generate_user_prompt(transcript_text, num_clips)

    # Call both AI providers concurrently
    groq_task = asyncio.create_task(call_groq(prompt))
    gemini_task = asyncio.create_task(call_gemini(prompt))

    groq_clips, gemini_clips = await asyncio.gather(groq_task, gemini_task)

    if not groq_clips and not gemini_clips:
        print(json.dumps({"error": "Both Groq and Gemini failed to return valid clips", "groq_raw": groq_clips, "gemini_raw": gemini_clips}))
        sys.exit(1)

    final_clips = deduplicate_and_merge(groq_clips, gemini_clips, num_clips)

    print(json.dumps({
        "success": True,
        "clips": final_clips,
        "meta": {
            "groq_clip_count": len(groq_clips),
            "gemini_clip_count": len(gemini_clips),
            "final_clip_count": len(final_clips)
        }
    }, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
