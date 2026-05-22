from flask import Blueprint, jsonify, send_file
import analytics_engine
import time

analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/stats')
def get_stats():
    data = analytics_engine.get_historical_stats()
    
    # --- NEW FEATURE: TREND ANALYSIS ---
    # Compares last 5 mins to the previous 5 mins
    trend = "STABLE"
    if len(data) >= 10:
        recent_avg = sum(d['total_flights'] for d in data[:5]) / 5
        previous_avg = sum(d['total_flights'] for d in data[5:10]) / 5
        if recent_avg > previous_avg * 1.1: trend = "INCREASING_TRAFFIC"
        elif recent_avg < previous_avg * 0.9: trend = "DECREASING_TRAFFIC"

    return jsonify({
        "metrics": data,
        "traffic_trend": trend,
        "analysis_period": "60_MINUTES"
    })

@analytics_bp.route('/history/<int:minutes_ago>')
def get_history(minutes_ago):
    data = analytics_engine.get_replay_data(minutes_ago)
    return jsonify({
        "status": "ARCHIVE_RETRIEVED",
        "points": len(data),
        "data": data
    })

@analytics_bp.route('/report')
def generate_report():
    buffer = analytics_engine.generate_pdf_report()
    return send_file(buffer, as_attachment=True, download_name=f"FOXBAT_Report_{int(time.time())}.pdf", mimetype='application/pdf')
