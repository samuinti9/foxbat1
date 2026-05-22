import sqlite3
import time
import io
import logging
from typing import Any, Dict, List

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import inch

logger = logging.getLogger(__name__)

from data_hub import DB_PATH

DEFAULT_DB = DB_PATH


def get_historical_stats(db_path: str = DEFAULT_DB) -> List[Dict[str, Any]]:
    """Return the last 60 historical summary stats from `flight_stats`.

    Each entry is a dict with keys: `time`, `total_flights`, `avg_speed`, `avg_altitude`.
    """
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute(
                "SELECT timestamp, total_flights, avg_speed, avg_altitude FROM flight_stats ORDER BY timestamp DESC LIMIT 60"
            )
            rows = c.fetchall()

        return [
            {
                'time': time.strftime('%H:%M', time.localtime(row[0])),
                'total_flights': row[1],
                'avg_speed': row[2],
                'avg_altitude': row[3],
            }
            for row in reversed(rows)
        ]
    except sqlite3.Error as e:
        logger.exception("Failed to fetch historical stats: %s", e)
        return []


def get_replay_data(minutes_ago: int, db_path: str = DEFAULT_DB) -> List[Dict[str, Any]]:
    """Return replay data from `flight_archive` from the last `minutes_ago` minutes.

    Each entry is a dict with `time`, `timestamp`, `callsign`, `lat`, `lon`, `heading`, `altitude`.
    """
    try:
        target_time = time.time() - (minutes_ago * 60)
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute(
                "SELECT timestamp, callsign, lat, lon, heading, altitude FROM flight_archive WHERE timestamp >= ? ORDER BY timestamp ASC",
                (target_time,),
            )
            rows = c.fetchall()

        return [
            {
                'time': time.strftime('%H:%M:%S', time.localtime(row[0])),
                'timestamp': row[0],
                'callsign': row[1],
                'lat': row[2],
                'lon': row[3],
                'heading': row[4],
                'altitude': row[5],
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        logger.exception("Failed to fetch replay data: %s", e)
        return []


def generate_pdf_report(db_path: str = DEFAULT_DB) -> io.BytesIO:
    """Generate a PDF report summarizing the latest flight stats and return a BytesIO buffer.

    Returns an empty PDF buffer even if DB access fails; exceptions are logged.
    """
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute(
                "SELECT total_flights, avg_speed, avg_altitude FROM flight_stats ORDER BY timestamp DESC LIMIT 1"
            )
            last_stats = c.fetchone()
    except sqlite3.Error as e:
        logger.exception("Failed to fetch latest stats for PDF report: %s", e)
        last_stats = None

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # Header
    p.setFillColor(colors.HexColor("#0f172a"))
    p.rect(0, 0, width, height, fill=1)
    p.setFont("Helvetica-Bold", 24)
    p.setFillColor(colors.HexColor("#38bdf8"))
    p.drawString(1 * inch, height - 1 * inch, "FOXBAT - INTEL REPORT")

    p.setStrokeColor(colors.HexColor("#38bdf8"))
    p.line(1 * inch, height - 1.2 * inch,
           width - 1 * inch, height - 1.2 * inch)

    # Content
    p.setFont("Helvetica", 12)
    p.setFillColor(colors.white)
    p.drawString(1 * inch, height - 1.6 * inch,
                 f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    p.drawString(1 * inch, height - 1.8 * inch,
                 "Security Classification: TACTICAL / LEVEL 4")

    p.setFont("Helvetica-Bold", 16)
    p.drawString(1 * inch, height - 2.5 * inch, "Airspace Summary Metrics")

    p.setFont("Helvetica", 12)
    if last_stats:
        p.drawString(1.2 * inch, height - 2.8 * inch,
                     f"- Active Targets Tracked: {last_stats[0]}")
        try:
            p.drawString(1.2 * inch, height - 3.0 * inch,
                         f"- Mean Airspeed: {round(last_stats[1], 2)} km/h")
            p.drawString(1.2 * inch, height - 3.2 * inch,
                         f"- Average Altitude: {round(last_stats[2], 2)} meters")
        except Exception:
            # guard against unexpected types in DB
            logger.exception(
                "Unexpected data types in last_stats: %s", last_stats)
    else:
        p.drawString(1.2 * inch, height - 2.8 * inch,
                     "- Data currently initializing.")

    # Footer
    p.setFont("Helvetica-Oblique", 8)
    p.setFillColor(colors.HexColor("#94a3b8"))
    p.drawCentredString(width / 2, 0.5 * inch,
                        "CONFIDENTIAL - GLOBAL FOXBAT AWARENESS")

    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer
