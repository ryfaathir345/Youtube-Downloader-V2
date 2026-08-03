import json
import math
import os
import re
import subprocess
import sys
import warnings

warnings.filterwarnings("ignore")

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

import cv2


def clamp(value, low, high):
    return max(low, min(high, value))


def even(value):
    value = int(round(value))
    return value if value % 2 == 0 else value + 1


# ─────────────────────────────────────────────────────────────────────────
# PILLARBOX / LETTERBOX DETECTION
# ─────────────────────────────────────────────────────────────────────────

def detect_active_region(video_path):
    """
    Run ffmpeg cropdetect on the first 5 seconds of the video and return
    (crop_w, crop_h, crop_x, crop_y) as integers, or None if:
      - ffmpeg is not available / errors out
      - no 'crop=W:H:X:Y' line is found in stderr output
    We parse the LAST crop= line because cropdetect needs a few frames to
    stabilise its black-level estimate.
    """
    # Locate ffmpeg the same way smart_crop is invoked (same Python env).
    # We accept either the env variable FFMPEG_PATH or plain 'ffmpeg' on PATH.
    ffmpeg_exe = os.environ.get("FFMPEG_PATH", "ffmpeg")
    try:
        proc = subprocess.run(
            [
                ffmpeg_exe, "-hide_banner",
                "-i", video_path,
                "-vf", "cropdetect=24:2:0",
                "-t", "5",
                "-f", "null", "-",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except Exception as exc:
        print(f"[letterbox] cropdetect failed: {exc}", file=sys.stderr)
        return None

    # cropdetect prints to stderr; find all crop= proposals and take the last.
    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", proc.stderr)
    if not matches:
        return None

    crop_w, crop_h, crop_x, crop_y = (int(v) for v in matches[-1])
    return crop_w, crop_h, crop_x, crop_y


def escaped_if_expr(points, max_x):
    """
    Build the FFmpeg crop-x expression from a list of (t, x) points.
    Every branch is wrapped in clamp(0, max_x) so extrapolation before the
    first point or floating point drift can never push crop_x out of bounds.
    """
    if not points:
        return "(iw-ow)/2"

    def clamped(x_expr):
        return f"min(max({x_expr}\\,0)\\,{max_x})"

    expr = clamped(str(points[-1][1]))
    for index in range(len(points) - 2, -1, -1):
        t0, x0 = points[index]
        t1, x1 = points[index + 1]
        duration = max(0.001, t1 - t0)
        interp = f"{x0}+({x1 - x0})*(t-{t0:.2f})/{duration:.2f}"
        expr = f"if(lt(t\\,{t1:.2f})\\,{clamped(interp)}\\,{expr})"

    return expr


# ─────────────────────────────────────────────────────────────────────────
# FACE DETECTION — frontal + profile + flipped-profile + CLAHE contrast fix
#
# Plain frontal Haar cascade alone misses a huge share of frames in
# podcast-style footage: guests are angled toward each other (not straight
# at camera), often wearing glasses, and studio lighting is low-contrast.
# Tested on a real 2-speaker podcast clip: frontal-only detected a face in
# only ~24% of sampled frames; frontal+profile+flip+CLAHE detected ~84%.
# ─────────────────────────────────────────────────────────────────────────

_frontal_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))


def detect_faces(gray_frame):
    """
    Returns a list of (x, y, w, h) boxes, deduplicated, using:
      - frontal cascade (faces looking roughly at camera)
      - profile cascade (faces turned to one side)
      - profile cascade on a horizontally flipped frame (catches the other side,
        since Haar's profile cascade only reliably catches one facing direction)
    All run on a CLAHE-equalized frame to help with dim/low-contrast studio lighting.
    """
    gray_eq = _clahe.apply(gray_frame)

    faces = list(_frontal_cascade.detectMultiScale(
        gray_eq, scaleFactor=1.1, minNeighbors=3, minSize=(24, 24)
    ))
    faces += list(_profile_cascade.detectMultiScale(
        gray_eq, scaleFactor=1.1, minNeighbors=3, minSize=(24, 24)
    ))

    flipped = cv2.flip(gray_eq, 1)
    w_frame = gray_eq.shape[1]
    for (x, y, fw, fh) in _profile_cascade.detectMultiScale(
        flipped, scaleFactor=1.1, minNeighbors=3, minSize=(24, 24)
    ):
        faces.append((w_frame - x - fw, y, fw, fh))

    # Deduplicate boxes that overlap heavily (frontal+profile can both fire
    # on the same face) by merging any box whose center falls inside another.
    merged = []
    for (x, y, w, h) in sorted(faces, key=lambda f: f[2] * f[3], reverse=True):
        cx, cy = x + w / 2, y + h / 2
        if any(mx <= cx <= mx + mw and my <= cy <= my + mh for (mx, my, mw, mh) in merged):
            continue
        merged.append((x, y, w, h))

    return merged


def pick_target_face(faces, prev_crop_x, scale_factor, target_width, max_x, crop_x_offset=0):
    """
    Choose which detected face to track this frame.

    Instead of always taking the single largest box (which flips between two
    podcast speakers whenever one leans in or turns slightly more toward
    camera), prefer whichever face's crop position is CLOSEST to where the
    crop currently is -- unless another face is significantly bigger
    (>40% larger area), in which case it's allowed to take over. This adds
    inertia so the crop doesn't jump every time box sizes wobble a little.

    crop_x_offset: horizontal offset (pixels in original frame) of the active
    region returned by detect_active_region().  cv2 always works on the FULL
    frame, so we subtract this offset before computing the crop position so
    that coordinates are relative to the content area, not the black bar.
    """
    if not faces:
        return None

    candidates = []
    for (x, y, w, h) in faces:
        # Subtract the pillarbox offset so the face centre is expressed in
        # active-content coordinates before scaling.
        content_center_x = (x + w / 2 - crop_x_offset) * scale_factor
        crop_x = int(round(clamp(content_center_x - (target_width / 2), 0, max_x)))
        candidates.append((crop_x, w * h))

    if prev_crop_x is None:
        # No prior position yet -> just take the largest face.
        return max(candidates, key=lambda c: c[1])[0]

    # Closest to current position, unless something notably bigger exists.
    closest = min(candidates, key=lambda c: abs(c[0] - prev_crop_x))
    biggest = max(candidates, key=lambda c: c[1])
    if biggest[1] > closest[1] * 1.4 and biggest[0] != closest[0]:
        return biggest[0]
    return closest[0]


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"ok": False, "error": "Missing arguments"}))
        return

    video_path = sys.argv[1]
    target_width = int(sys.argv[2])
    target_height = int(sys.argv[3])

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(json.dumps({"ok": False, "error": "Cannot open video"}))
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    source_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0
    source_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration = frame_count / fps if fps > 0 else 0

    if source_width <= 0 or source_height <= 0:
        print(json.dumps({"ok": False, "error": "Invalid video dimensions"}))
        return

    # ── Pillarbox / letterbox pre-processing ─────────────────────────────────
    # Run cropdetect on the first 5 s.  If significant black bars are found
    # (active width < 90% of frame width) we switch all geometry calculations
    # to the active-content dimensions and prepend a crop= filter to strip the
    # bars before the scale/face-crop pipeline runs.
    pillarbox_prefix = ""       # prepended to both tracked and fallback filters
    crop_x_offset    = 0        # horizontal bar width in original frame pixels
    source_width_eff  = source_width
    source_height_eff = source_height

    region = detect_active_region(video_path)
    if region is not None:
        crop_w, crop_h, crop_x, crop_y = region
        if crop_w < 0.9 * source_width:
            print(
                f"[letterbox] Pillarbox terdeteksi & dibuang: {crop_w}x{crop_h} "
                f"offset_x={crop_x} (dari frame asli {int(source_width)}x{int(source_height)})",
                file=sys.stderr,
            )
            source_width_eff  = crop_w
            source_height_eff = crop_h
            crop_x_offset     = crop_x
            # This filter is prepended before scale so FFmpeg sees only content pixels.
            pillarbox_prefix  = f"crop={crop_w}:{crop_h}:{crop_x}:0,"

    scaled_width = even(source_width_eff * target_height / source_height_eff)
    max_x = max(0, scaled_width - target_width)
    scale_factor = target_height / source_height_eff

    if max_x <= 0:
        print(json.dumps({
            "ok": True,
            "tracked": False,
            "filter": f"{pillarbox_prefix}scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
        }))
        return

    sample_step = max(1, int(round(fps * 0.5)))
    raw_points = []
    frame_index = 0
    prev_crop_x = None
    total_samples = 0
    detected_samples = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_index % sample_step != 0:
            frame_index += 1
            continue

        total_samples += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detect_faces(gray)

        if faces:
            detected_samples += 1
            crop_x = pick_target_face(
                faces, prev_crop_x, scale_factor, target_width, max_x,
                crop_x_offset=crop_x_offset,
            )
            timestamp = frame_index / fps
            raw_points.append((timestamp, crop_x))
            prev_crop_x = crop_x

        frame_index += 1

    cap.release()

    detection_rate = (detected_samples / total_samples * 100) if total_samples else 0
    print(f"[face-detect] {detected_samples}/{total_samples} sampled frames had a face ({detection_rate:.1f}%)", file=sys.stderr)

    if len(raw_points) < 2:
        print(json.dumps({
            "ok": True,
            "tracked": False,
            "detection_rate": round(detection_rate, 1),
            "filter": f"{pillarbox_prefix}scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
        }))
        return

    # Hold position across gaps > 1.5s instead of slowly panning across dead time
    GAP_THRESHOLD = 1.5
    gap_adjusted = [raw_points[0]]
    for t, x in raw_points[1:]:
        prev_t, prev_x = gap_adjusted[-1]
        if t - prev_t > GAP_THRESHOLD:
            gap_adjusted.append((t - 0.3, prev_x))
        gap_adjusted.append((t, x))
    raw_points = gap_adjusted

    smoothed = []
    previous = raw_points[0][1]
    for timestamp, crop_x in raw_points:
        previous = int(round((previous * 0.75) + (crop_x * 0.25)))
        smoothed.append((round(timestamp, 2), previous))

    # Virtual point at t=0 so the segment before the first detection holds
    # steady instead of being linearly extrapolated backward out of bounds.
    if smoothed[0][0] > 0:
        smoothed.insert(0, (0.0, smoothed[0][1]))

    max_points = 80
    if len(smoothed) > max_points:
        stride = math.ceil(len(smoothed) / max_points)
        last_point = smoothed[-1]
        smoothed = smoothed[::stride]
        if smoothed[-1] != last_point:
            smoothed.append(last_point)

    expression = escaped_if_expr(smoothed, max_x)
    video_filter = f"{pillarbox_prefix}scale=-2:{target_height},crop={target_width}:{target_height}:{expression}:0"

    print(json.dumps({
        "ok": True,
        "tracked": True,
        "duration": duration,
        "points": len(smoothed),
        "detection_rate": round(detection_rate, 1),
        "filter": video_filter,
    }))


if __name__ == "__main__":
    main()
