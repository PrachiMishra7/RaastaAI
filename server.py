import cv2
import os
import time
import json
import threading
import numpy as np
from flask import Flask, Response, render_template, jsonify, redirect, request, url_for
from werkzeug.utils import secure_filename
from src.video_processor import VideoProcessor
from config import SAMPLE_VIDEOS_DIR

app = Flask(__name__)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Global state for telemetry
telemetry_data = {
    "speed": 0,
    "ttc": 5.0,
    "metrics": {
        "vehicles": 0,
        "pedestrians": 0,
        "cyclists": 0,
        "trucks": 0,
        "buses": 0,
        "traffic_lights": 0,
        "risk_score": 0,
        "risk_status": "NORMAL",
        "lane_status": "Stable",
        "lane_confidence": "High"
    },
    "alerts": []
}
telemetry_lock = threading.Lock()

processor = VideoProcessor()
current_video_path = str(SAMPLE_VIDEOS_DIR / "VID20260704115232.mp4")
current_video_name = os.path.basename(current_video_path)
video_rotation_angle = 0
restart_video_flag = False

def _to_plain_json(value):
    if isinstance(value, dict):
        return {k: _to_plain_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain_json(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (np.ndarray,)):
        return value.tolist()
    return value


def generate_frames():
    global telemetry_data, current_video_path, video_rotation_angle, restart_video_flag
    cap = None
    active_path = current_video_path
    last_alert_time = 0

    while True:
        if active_path != current_video_path or restart_video_flag:
            if cap is not None:
                cap.release()
            active_path = current_video_path
            cap = cv2.VideoCapture(active_path)
            restart_video_flag = False
            
        if cap is None:
            cap = cv2.VideoCapture(active_path)

        if not cap.isOpened():
            time.sleep(0.2)
            continue

        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
            
        if video_rotation_angle == 90:
            frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        elif video_rotation_angle == 180:
            frame = cv2.rotate(frame, cv2.ROTATE_180)
        elif video_rotation_angle == 270:
            frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

        processed_frame, metrics = processor.process_frame(frame)
        
        # Update telemetry data safely
        with telemetry_lock:
            import random
            import math
            import time
            # Simulate a realistic speed that accelerates and decelerates between 10 km/h and 110 km/h
            speed = int(60 + 50 * math.sin(time.time() * 0.2) + random.randint(-2, 2))
            speed = max(0, speed)
            risk_score = metrics.get('risk_score', 0)
            ttc = max(0.5, 3.5 - (risk_score / 30.0)) if risk_score > 0 else 5.0 + random.random()
            
            telemetry_data['speed'] = speed
            telemetry_data['ttc'] = round(ttc, 1)
            telemetry_data['metrics'] = _to_plain_json(metrics)
            
            # Simple alert generation
            current_time = time.time()
            if metrics.get('risk_status') == 'CRITICAL' and current_time - last_alert_time > 3:
                alert = {"time": time.strftime("%H:%M:%S"), "message": "VEHICLE AHEAD", "level": "CRITICAL"}
                telemetry_data['alerts'].insert(0, alert)
                telemetry_data['alerts'] = telemetry_data['alerts'][:5] # keep last 5
                last_alert_time = current_time
        
        # Encode frame to JPEG
        ret, buffer = cv2.imencode('.jpg', processed_frame)
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        
        # Yield the frame in MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
               
        # Small sleep to simulate realistic 30 FPS if the processor is too fast
        time.sleep(0.01)

@app.route('/')
def index():
    return render_template('index.html', current_video_name=current_video_name)

@app.route('/upload_video', methods=['POST'])
def upload_video():
    global current_video_path, current_video_name
    file = request.files.get('video')
    if file and file.filename:
        filename = secure_filename(file.filename)
        if not filename:
            return redirect(url_for('index'))
        save_path = os.path.join(UPLOAD_DIR, filename)
        file.save(save_path)
        current_video_path = save_path
        current_video_name = filename
    return redirect(url_for('index'))

@app.route('/delete_video', methods=['POST'])
def delete_video():
    global current_video_path, current_video_name, video_rotation_angle
    
    current_video_path = str(SAMPLE_VIDEOS_DIR / "VID20260704115232.mp4")
    current_video_name = os.path.basename(current_video_path)
    video_rotation_angle = 0
    
    return redirect(url_for('index'))

@app.route('/restart_video', methods=['POST'])
def restart_video():
    global restart_video_flag
    restart_video_flag = True
    return redirect(url_for('index'))

@app.route('/rotate_video', methods=['POST'])
def rotate_video():
    global video_rotation_angle
    video_rotation_angle = (video_rotation_angle + 90) % 360
    return redirect(url_for('index'))

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/telemetry')
def telemetry():
    with telemetry_lock:
        return jsonify(telemetry_data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
