from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import data_hub
import sqlite3

# Import Blueprints (Hard Separation)
from hub_blueprint import hub_bp
from analytics_blueprint import analytics_bp

app = Flask(__name__)
CORS(app)

# --- SYSTEM REGISTRATION ---
# All API logic is now physically removed from this file.
app.register_blueprint(hub_bp, url_prefix='/api/hub')
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')

# Initialize DB via DataHub
data_hub.init_db()

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/radar')
def index():
    return render_template('index.html')

@app.route('/analytics')
def analytics():
    return render_template('analytics.html')

@app.route('/tactical-data')
def tactical_data():
    return render_template('tactical_data.html')

@app.route('/api/status')
def system_status():
    return jsonify({
        "status": "OPERATIONAL",
        "subsystems": ["DATA_HUB", "ANALYTICS_ENGINE"],
        "architecture": "FLASK_BLUEPRINTS"
    })

@app.route('/api/reset', methods=['POST'])
def reset_database():
    """Wipe all historical flight logs from the database."""
    try:
        with sqlite3.connect(data_hub.DB_PATH) as conn:
            conn.execute("DELETE FROM flight_stats")
            conn.execute("DELETE FROM flight_archive")
            conn.commit()
        return jsonify({"success": True, "message": "Database wiped successfully."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    # Running on 8080 as requested in previous sessions
    app.run(host='0.0.0.0', port=8080, debug=True)
