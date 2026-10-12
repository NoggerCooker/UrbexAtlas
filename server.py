#!/usr/bin/env python3
"""Small dependency-free backend for the New Lost Place Map."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DB_PATH = ROOT / "lost_place_map.sqlite3"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8765"))


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS spots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                color TEXT NOT NULL DEFAULT '#d86b3f',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS arrows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
                to_spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
                label TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT '#d86b3f',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(from_spot_id, to_spot_id)
            );
            """
        )
        for table in ("spots", "arrows"):
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
            if "color" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN color TEXT NOT NULL DEFAULT '#d86b3f'")


def rows(sql, params=()):
    with connect() as db:
        return [dict(row) for row in db.execute(sql, params).fetchall()]


def body_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length > 1_000_000:
        raise ValueError("request too large")
    return json.loads(handler.rfile.read(length) or b"{}")


def number(value, field):
    value = float(value)
    if field == "latitude" and not -90 <= value <= 90:
        raise ValueError("latitude must be between -90 and 90")
    if field == "longitude" and not -180 <= value <= 180:
        raise ValueError("longitude must be between -180 and 180")
    return value


def color(value):
    value = str(value or "").strip().lower()
    if not re.fullmatch(r"#[0-9a-f]{6}", value):
        raise ValueError("color must be a six-digit hexadecimal value")
    return value


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            self.send_json({"spots": rows("SELECT * FROM spots ORDER BY id"), "arrows": rows("SELECT * FROM arrows ORDER BY id")})
            return
        if path.startswith("/api/"):
            self.send_json({"error": "not found"}, 404)
            return
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        file = (STATIC / relative).resolve()
        if STATIC not in file.parents or not file.is_file():
            self.send_json({"error": "not found"}, 404)
            return
        content_type = {".html": "text/html", ".css": "text/css", ".js": "application/javascript"}.get(file.suffix, "application/octet-stream")
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_HEAD(self):
        path = urlparse(self.path).path
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        file = (STATIC / relative).resolve()
        if STATIC not in file.parents or not file.is_file():
            self.send_response(404)
            self.end_headers()
            return
        content_type = {".html": "text/html", ".css": "text/css", ".js": "application/javascript"}.get(file.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(file.stat().st_size))
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = body_json(self)
            with connect() as db:
                if path == "/api/spots":
                    name = str(data.get("name", "")).strip()
                    if not name:
                        raise ValueError("name is required")
                    cursor = db.execute(
                        "INSERT INTO spots (name, description, latitude, longitude, color) VALUES (?, ?, ?, ?, ?)",
                        (name, str(data.get("description", "")).strip(), number(data["latitude"], "latitude"), number(data["longitude"], "longitude"), color(data.get("color", "#d86b3f"))),
                    )
                    spot_id = cursor.lastrowid
                    spot = dict(db.execute("SELECT * FROM spots WHERE id = ?", (spot_id,)).fetchone())
                    self.send_json(spot, 201)
                    return
                if path == "/api/arrows":
                    source = int(data["from_spot_id"])
                    target = int(data["to_spot_id"])
                    if source == target:
                        raise ValueError("an arrow needs two different spots")
                    cursor = db.execute("INSERT INTO arrows (from_spot_id, to_spot_id, label, color) VALUES (?, ?, ?, ?)", (source, target, str(data.get("label", "")).strip(), color(data.get("color", "#d86b3f"))))
                    arrow = dict(db.execute("SELECT * FROM arrows WHERE id = ?", (cursor.lastrowid,)).fetchone())
                    self.send_json(arrow, 201)
                    return
                raise KeyError(path)
        except sqlite3.IntegrityError as exc:
            self.send_json({"error": "This arrow already exists or references an unknown spot."}, 409)
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)

    def do_PATCH(self):
        path = urlparse(self.path).path
        try:
            item_id = int(path.rsplit("/", 1)[1])
            table = "spots" if path.startswith("/api/spots/") else "arrows" if path.startswith("/api/arrows/") else None
            if not table:
                raise KeyError(path)
            data = body_json(self)
            new_color = color(data["color"])
            with connect() as db:
                cursor = db.execute(f"UPDATE {table} SET color = ? WHERE id = ?", (new_color, item_id))
                if cursor.rowcount == 0:
                    self.send_json({"error": "not found"}, 404)
                else:
                    item = dict(db.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone())
                    self.send_json(item)
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            self.send_json({"error": "invalid color or item"}, 400)

    def do_DELETE(self):
        path = urlparse(self.path).path
        try:
            item_id = int(path.rsplit("/", 1)[1])
            table = "spots" if path.startswith("/api/spots/") else "arrows" if path.startswith("/api/arrows/") else None
            if not table:
                raise KeyError(path)
            with connect() as db:
                cursor = db.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
                if cursor.rowcount == 0:
                    self.send_json({"error": "not found"}, 404)
                else:
                    self.send_json({"ok": True})
        except (KeyError, ValueError):
            self.send_json({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    init_db()
    print(f"New Lost Place Map: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
