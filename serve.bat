@echo off
REM Fire up a local server and open the palace. Webcam won't work off file://,
REM so this is the way in. Ctrl+C in this window to kill it.
echo Starting MIND PALACE on http://localhost:8000
start "" http://localhost:8000
python -m http.server 8000
