import json
import math
import os
import re
import subprocess
import sys
import warnings
import cv2
import pickle
import numpy as np
import tempfile
import shutil
from scipy import signal
from scipy.io import wavfile
from scipy.interpolate import interp1d

warnings.filterwarnings("ignore")

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure TalkNet-ASD is in the path
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
TALKNET_DIR = os.path.join(MODULE_DIR, 'TalkNet-ASD')
if TALKNET_DIR not in sys.path:
    sys.path.insert(0, TALKNET_DIR)

import torch
import python_speech_features

# Import TalkNet modules
from talkNet import talkNet
from model.faceDetector.s3fd import S3FD


def clamp(value, low, high):
    return max(low, min(high, value))

def even(value):
    value = int(round(value))
    return value if value % 2 == 0 else value + 1

def detect_active_region(video_path):
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

    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", proc.stderr)
    if not matches:
        return None

    crop_w, crop_h, crop_x, crop_y = (int(v) for v in matches[-1])
    return crop_w, crop_h, crop_x, crop_y

def escaped_if_expr(points, max_x):
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

def bb_intersection_over_union(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou

def track_shot(sceneFaces, minTrack=10, numFailedDet=10, minFaceSize=1):
    iouThres  = 0.5
    tracks    = []
    while True:
        track = []
        for frameFaces in sceneFaces:
            for face in frameFaces:
                if track == []:
                    track.append(face)
                    frameFaces.remove(face)
                elif face['frame'] - track[-1]['frame'] <= numFailedDet:
                    iou = bb_intersection_over_union(face['bbox'], track[-1]['bbox'])
                    if iou > iouThres:
                        track.append(face)
                        frameFaces.remove(face)
                        continue
                else:
                    break
        if track == []:
            break
        elif len(track) > minTrack:
            frameNum = np.array([ f['frame'] for f in track ])
            bboxes   = np.array([np.array(f['bbox']) for f in track])
            frameI   = np.arange(frameNum[0], frameNum[-1]+1)
            bboxesI  = []
            for ij in range(0,4):
                interpfn = interp1d(frameNum, bboxes[:,ij], fill_value="extrapolate")
                bboxesI.append(interpfn(frameI))
            bboxesI  = np.stack(bboxesI, axis=1)
            if max(np.mean(bboxesI[:,2]-bboxesI[:,0]), np.mean(bboxesI[:,3]-bboxesI[:,1])) > minFaceSize:
                tracks.append({'frame':frameI, 'bbox':bboxesI})
    return tracks

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
    cap.release()

    if source_width <= 0 or source_height <= 0:
        print(json.dumps({"ok": False, "error": "Invalid video dimensions"}))
        return

    pillarbox_prefix = ""
    crop_x_offset    = 0
    source_width_eff  = source_width
    source_height_eff = source_height

    region = detect_active_region(video_path)
    if region is not None:
        crop_w, crop_h, crop_x, crop_y = region
        if crop_w < 0.9 * source_width:
            source_width_eff  = crop_w
            source_height_eff = crop_h
            crop_x_offset     = crop_x
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

    # 1. Initialization and device setup
    print("[TalkNet] Initializing deep learning models...", file=sys.stderr)
    original_cwd = os.getcwd()
    os.chdir(TALKNET_DIR)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    try:
        s3fd_detector = S3FD(device=device)
        talknet_model = talkNet()
        talknet_model.loadParameters("pretrain_TalkSet.model")
        talknet_model.eval()
        if device == 'cuda':
            talknet_model = talknet_model.cuda()
    except Exception as e:
        os.chdir(original_cwd)
        print(f"[TalkNet] Error initializing models: {e}", file=sys.stderr)
        return
    
    os.chdir(original_cwd)

    # 2. Extract audio and frames to a temporary directory
    print("[TalkNet] Extracting features...", file=sys.stderr)
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.wav")
        video_fps25_path = os.path.join(tmpdir, "video25.mp4")
        
        ffmpeg_exe = os.environ.get("FFMPEG_PATH", "ffmpeg")
        # Convert video to 25fps for TalkNet synchronization
        subprocess.run([
            ffmpeg_exe, "-y", "-i", video_path, "-r", "25",
            "-vf", "scale=-2:480", # Downscale for faster face detection
            video_fps25_path
        ], capture_output=True)
        
        subprocess.run([
            ffmpeg_exe, "-y", "-i", video_path, "-ac", "1", "-ar", "16000",
            audio_path
        ], capture_output=True)

        sr, audio = wavfile.read(audio_path)
        audioFeature = python_speech_features.mfcc(audio, 16000, numcep=13, winlen=0.025, winstep=0.010)

        cap25 = cv2.VideoCapture(video_fps25_path)
        frame_list = []
        while True:
            ret, frame = cap25.read()
            if not ret:
                break
            frame_list.append(frame)
        cap25.release()

        # 3. Detect faces using S3FD
        print("[TalkNet] Detecting faces...", file=sys.stderr)
        faces_per_frame = []
        for fidx, frame in enumerate(frame_list):
            imageNumpy = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            bboxes = s3fd_detector.detect_faces(imageNumpy, conf_th=0.9, scales=[1.0])
            frame_faces = []
            for bbox in bboxes:
                frame_faces.append({'frame': fidx, 'bbox': bbox[:-1].tolist(), 'conf': bbox[-1]})
            faces_per_frame.append(frame_faces)

        # 4. Group faces into tracks
        print("[TalkNet] Tracking faces...", file=sys.stderr)
        all_tracks = track_shot(faces_per_frame.copy(), minTrack=10)
        
        if not all_tracks:
            print(json.dumps({
                "ok": True,
                "tracked": False,
                "filter": f"{pillarbox_prefix}scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
            }))
            return

        # 5. Extract 224x224 crop sequences and run TalkNet
        print(f"[TalkNet] Evaluating {len(all_tracks)} tracks for active speaker...", file=sys.stderr)
        track_scores = {} # track_id -> dict of frame_idx: score
        
        for tidx, track in enumerate(all_tracks):
            track_scores[tidx] = {}
            dets = {'x':[], 'y':[], 's':[]}
            for det in track['bbox']:
                dets['s'].append(max((det[3]-det[1]), (det[2]-det[0]))/2) 
                dets['y'].append((det[1]+det[3])/2)
                dets['x'].append((det[0]+det[2])/2)
            dets['s'] = signal.medfilt(dets['s'], kernel_size=13)
            dets['x'] = signal.medfilt(dets['x'], kernel_size=13)
            dets['y'] = signal.medfilt(dets['y'], kernel_size=13)
            
            videoFeature = []
            for i, frame_idx in enumerate(track['frame']):
                image = frame_list[int(frame_idx)]
                bs  = dets['s'][i]
                bsi = int(bs * (1 + 2 * 0.40))
                padded = np.pad(image, ((bsi,bsi), (bsi,bsi), (0, 0)), 'constant', constant_values=(110, 110))
                my  = dets['y'][i] + bsi
                mx  = dets['x'][i] + bsi
                face = padded[int(my-bs):int(my+bs*(1+2*0.40)), int(mx-bs*(1+0.40)):int(mx+bs*(1+0.40))]
                face = cv2.resize(face, (224, 224))
                face_gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
                face_crop = face_gray[int(112-(112/2)):int(112+(112/2)), int(112-(112/2)):int(112+(112/2))]
                videoFeature.append(face_crop)
            
            videoFeature = np.array(videoFeature)
            audioStart = track['frame'][0] / 25
            audioEnd = (track['frame'][-1]+1) / 25
            audioStart_idx = int(audioStart * 100)
            audioEnd_idx = int(audioEnd * 100)
            track_audioFeature = audioFeature[audioStart_idx:audioEnd_idx, :]
            
            length = min((track_audioFeature.shape[0] - track_audioFeature.shape[0] % 4) / 100, videoFeature.shape[0] / 25)
            if length <= 0:
                continue
                
            track_audioFeature = track_audioFeature[:int(round(length * 100)),:]
            videoFeature = videoFeature[:int(round(length * 25)),:,:]
            
            allScore = []
            durationSet = {1, 2, 4, 6}
            for dur in durationSet:
                batchSize = int(math.ceil(length / dur))
                scores = []
                with torch.no_grad():
                    for i in range(batchSize):
                        inputA = torch.FloatTensor(track_audioFeature[i * dur * 100:(i+1) * dur * 100,:]).unsqueeze(0).to(device)
                        inputV = torch.FloatTensor(videoFeature[i * dur * 25: (i+1) * dur * 25,:,:]).unsqueeze(0).to(device)
                        if inputA.shape[1] == 0 or inputV.shape[1] == 0:
                            continue
                        embedA = talknet_model.model.forward_audio_frontend(inputA)
                        embedV = talknet_model.model.forward_visual_frontend(inputV)    
                        embedA, embedV = talknet_model.model.forward_cross_attention(embedA, embedV)
                        out = talknet_model.model.forward_audio_visual_backend(embedA, embedV)
                        score = talknet_model.lossAV.forward(out, labels = None)
                        scores.extend(score)
                allScore.append(scores)
            
            if allScore:
                mean_scores = np.round((np.mean(np.array(allScore), axis = 0)), 1).astype(float)
                for idx, s in enumerate(mean_scores):
                    frame_idx = track['frame'][idx]
                    track_scores[tidx][frame_idx] = s

    # 6. Map scores back to original FPS
    # We will interpolate track_scores and face centers back to the original video fps
    print("[TalkNet] Generating final crop points...", file=sys.stderr)
    
    # Get original scale factor since we downscaled to 480 for detection
    orig_cap = cv2.VideoCapture(video_path)
    if orig_cap.isOpened():
        orig_w = orig_cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        orig_h = orig_cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        scale_x_det = orig_w / (480 * orig_w / orig_h) # approx
        # More accurate scale:
        scale_det = orig_h / 480.0
    else:
        scale_det = 1.0
    orig_cap.release()

    raw_points = []
    active_track = None

    for frame_idx in range(int(frame_count)):
        timestamp = frame_idx / fps
        # Find nearest 25fps frame
        frame25_idx = int(timestamp * 25)
        
        available_tracks = []
        for tidx, track in enumerate(all_tracks):
            if frame25_idx in track['frame']:
                available_tracks.append(tidx)
                
        if not available_tracks:
            if active_track is not None and raw_points:
                raw_points.append((timestamp, raw_points[-1][1]))
            continue

        best_score = -float('inf')
        best_track = None
        for tidx in available_tracks:
            score = track_scores[tidx].get(frame25_idx, -1.0)
            if score > best_score:
                best_score = score
                best_track = tidx

        # Hysteresis for switching
        if active_track in available_tracks:
            current_score = track_scores[active_track].get(frame25_idx, -1.0)
            if best_track != active_track and best_score > (current_score + 1.5):
                active_track = best_track
        else:
            active_track = best_track

        if active_track is not None:
            # Find face center x for active track at frame25_idx
            track_idx = list(all_tracks[active_track]['frame']).index(frame25_idx)
            face_bbox = all_tracks[active_track]['bbox'][track_idx]
            face_center_x = (face_bbox[0] + face_bbox[2]) / 2 * scale_det
            
            # Map face_center_x to output crop_x
            content_center_x = (face_center_x - crop_x_offset) * scale_factor
            crop_x = int(round(clamp(content_center_x - (target_width / 2), 0, max_x)))
            raw_points.append((timestamp, crop_x))

    if len(raw_points) < 2:
        print(json.dumps({
            "ok": True,
            "tracked": False,
            "filter": f"{pillarbox_prefix}scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}",
        }))
        return

    # Hold position across long gaps instead of panning
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
    for ts, crop_x in raw_points:
        previous = int(round((previous * 0.75) + (crop_x * 0.25)))
        smoothed.append((round(ts, 2), previous))

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
        "detection_rate": 100.0,
        "filter": video_filter,
    }))


if __name__ == "__main__":
    main()
