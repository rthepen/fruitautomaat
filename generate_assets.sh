#!/bin/bash
set -e

echo "Generating mock audio files..."
# 1. spin.mp3 (very short clicking sound)
ffmpeg -y -f lavfi -i "sine=frequency=300:duration=0.08" -af "volume=5.0" -acodec libmp3lame sounds/spin.mp3 2>/dev/null

# 2. countdown.mp3 (sharp countdown beep)
ffmpeg -y -f lavfi -i "sine=frequency=800:duration=0.15" -af "volume=1.5" -acodec libmp3lame sounds/countdown.mp3 2>/dev/null

# 3. start.mp3 (start buzzer/whistle)
ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=0.6" -af "volume=2.0" -acodec libmp3lame sounds/start.mp3 2>/dev/null

# 4. stop.mp3 (stop horn)
ffmpeg -y -f lavfi -i "sine=frequency=450:duration=1.2" -af "volume=2.0" -acodec libmp3lame sounds/stop.mp3 2>/dev/null

echo "Generating sample video file..."
# Generate a simple 5-second MP4 video showing a moving test pattern
ffmpeg -y -f lavfi -i testsrc=duration=5:size=640x360:rate=25 -pix_fmt yuv420p videos/sample.mp4 2>/dev/null

echo "Mock assets generated successfully!"
ls -la sounds/
ls -la videos/
