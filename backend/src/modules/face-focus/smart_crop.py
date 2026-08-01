import json
import math
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage", "app", "python-tools")))

import cv2


def clamp(value, low, high):
    return max(low, min(high, value))


def even(value):
    value = int(round(value))
    return value if value % 2 == 0 else value + 1


def escaped_if_expr(points):
    if not points:
        return "(iw-ow)/2"

    expr = str(points[-1][1])
    for index in range(len(points) - 2, -1, -1):
        t0, x0 = points[index]
        t1, x1 = points[index + 1]
        duration = max(0.001, t1 - t0)
        interp = f"{x0}+({x1 - x0})*(t-{t0:.2f})/{duration:.2f}"
        expr = f"if(lt(t\\,{t1:.2f})\\,{interp}\\,{expr})"

    return expr


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

    scaled_width = even(source_width * target_height / source_height)
    max_x = max(0, scaled_width - target_width)
    scale_factor = target_height / source_height

    if max_x <= 0:
        print(json.dumps({
            "ok": True,
            "tracked": False,
            "filter": f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
        }))
        return

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_detector = cv2.CascadeClassifier(cascade_path)

    sample_step = max(1, int(round(fps * 0.5)))
    raw_points = []
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_index % sample_step != 0:
            frame_index += 1
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(36, 36))

        if len(faces) > 0:
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]
            center_x = (x + (w / 2)) * scale_factor
            crop_x = int(round(clamp(center_x - (target_width / 2), 0, max_x)))
            timestamp = frame_index / fps
            raw_points.append((timestamp, crop_x))

        frame_index += 1

    cap.release()

    if len(raw_points) < 2:
        print(json.dumps({
            "ok": True,
            "tracked": False,
            "filter": f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
        }))
        return

    smoothed = []
    previous = raw_points[0][1]
    for timestamp, crop_x in raw_points:
        previous = int(round((previous * 0.75) + (crop_x * 0.25)))
        smoothed.append((round(timestamp, 2), previous))

    max_points = 80
    if len(smoothed) > max_points:
        stride = math.ceil(len(smoothed) / max_points)
        smoothed = smoothed[::stride]

    expression = escaped_if_expr(smoothed)
    video_filter = f"scale=-2:{target_height},crop={target_width}:{target_height}:{expression}:0"

    print(json.dumps({
        "ok": True,
        "tracked": True,
        "duration": duration,
        "points": len(smoothed),
        "filter": video_filter,
    }))


if __name__ == "__main__":
    main()
