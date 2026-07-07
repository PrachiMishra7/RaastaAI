import cv2
import numpy as np
import time
from src.detector import ObjectDetector
from src.risk_engine import RiskEngine
from src.warning_engine import WarningEngine
from src.lane_detector import LaneDetector
from config import COLORS, CLASS_COLORS

class VideoProcessor:
    def __init__(self):
        self.detector = ObjectDetector()
        self.risk_engine = RiskEngine()
        self.warning_engine = WarningEngine()
        self.lane_detector = LaneDetector()
        
        # Optimization state
        self.frame_count = 0
        self.last_detections = []
        self.last_risk_score = 0
        self.last_highest_risk = "SAFE"
        self.last_lane_status = "Stable"
        self.last_lane_conf = "High"
        
    def process_frame(self, frame):
        self.frame_count += 1
        
        # 1. Resize for performance (reduce to 640 width to significantly speed up processing)
        h, w = frame.shape[:2]
        if w > 640:
            scale = 640 / w
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        h, w = frame.shape[:2]
        
        # --- HEAVY PROCESSING (Every 3rd frame to prevent lag) ---
        if self.frame_count % 3 == 1:
            self.last_detections = self.detector.detect(frame)
            self.last_highest_risk, self.last_risk_score = self.risk_engine.evaluate_risk(self.last_detections, frame.shape)
            
            # Simple lane detection mock (runs less often)
            if self.frame_count % 6 == 1:
                lane_mask, lane_data = self.lane_detector.detect_lanes(frame)
                self.last_lane_status = lane_data.get("lane_status", "Stable")
                self.last_lane_conf = lane_data.get("confidence", "High")
        
        detections = self.last_detections
        highest_risk = self.last_highest_risk
        risk_score = self.last_risk_score
        
        # Generate warnings
        current_warning, warning_text = self.warning_engine.process_state(highest_risk, detections)
        
        # Draw driving corridor (Filled Polygon with transparency)
        corridor_poly = self.risk_engine.get_driving_corridor(frame.shape)
        overlay = frame.copy()
        cv2.fillPoly(overlay, [corridor_poly], COLORS['CORRIDOR_FILL'])
        # Add text for DRIVING CORRIDOR
        text_x = int(w * 0.40)
        text_y = int(h * 0.85)
        cv2.putText(overlay, "DRIVING CORRIDOR", (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, COLORS['CORRIDOR'], 2)
        
        frame = cv2.addWeighted(overlay, 0.3, frame, 0.7, 0)
        # Outline for corridor
        cv2.polylines(frame, [corridor_poly], isClosed=True, color=COLORS['CORRIDOR'], thickness=2)
        
        vehicles = 0
        pedestrians = 0
        cyclists = 0
        trucks = 0
        buses = 0
        traffic_lights = 0
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            cls_name = det['class_name']
            cls_lower = cls_name.lower()
            conf = det['conf']
            
            if cls_lower == 'car':
                vehicles += 1
            elif cls_lower == 'person':
                pedestrians += 1
            elif cls_lower == 'bicycle':
                cyclists += 1
            elif cls_lower == 'truck':
                trucks += 1
            elif cls_lower == 'bus':
                buses += 1
            elif cls_lower == 'traffic light':
                traffic_lights += 1
                
            color = CLASS_COLORS.get(cls_name, COLORS['SAFE'])
            
            # Box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Label
            label = f"{cls_name} {conf:.2f}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            # Label background
            cv2.rectangle(frame, (x1, y1 - 25), (x1 + tw + 10, y1), color, -1)
            cv2.putText(frame, label, (x1 + 5, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
        metrics = {
            'detections': detections,
            'total_objects': len(detections),
            'vehicles': vehicles,
            'pedestrians': pedestrians,
            'cyclists': cyclists,
            'trucks': trucks,
            'buses': buses,
            'traffic_lights': traffic_lights,
            'risk_status': current_warning,
            'warning_text': warning_text,
            'risk_score': risk_score,
            'lane_status': self.last_lane_status,
            'lane_confidence': self.last_lane_conf
        }
        
        return frame, metrics
