#!/usr/bin/env bash
# Records the Play Console background-location demo video on a running emulator.
# Usage: record-location-video.sh <apk> <output-dir>
set -uo pipefail
APK=$1
OUT=$2
MAESTRO="$HOME/.maestro/bin/maestro"
mkdir -p "$OUT"

adb install -r "$APK"
adb emu geo fix 54.4035 24.4958          # Al Reem Island, Abu Dhabi
adb shell settings put system show_touches 1

start_rec() { adb shell "screenrecord --bit-rate 8000000 --time-limit 180 /sdcard/$1.mp4" & sleep 1; }
stop_rec() { adb shell pkill -INT screenrecord; sleep 4; adb pull "/sdcard/$1.mp4" "$OUT/$1.mp4"; }
snap() {
  adb exec-out screencap -p > "$OUT/$1.png"
  echo "--- texts on screen at $1 ---"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml | grep -o 'text="[^"]*"' | grep -v 'text=""' | head -60
}

status=0

start_rec part1
"$MAESTRO" test .maestro/location-video/1-staff.yaml || { status=1; snap fail-staff; }
# Show the persistent "on duty" notification.
adb shell cmd statusbar expand-notifications; sleep 5; snap notification
adb shell cmd statusbar collapse; sleep 2
stop_rec part1

if [ $status -eq 0 ]; then
  start_rec part2
  "$MAESTRO" test .maestro/location-video/2-customer.yaml || { status=1; snap fail-customer; }
  stop_rec part2
fi

cd "$OUT"
ls part*.mp4 | sed "s/.*/file '&'/" > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -vf "fps=30,scale=720:-2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart Xtreme-Home-Partner-background-location.mp4
ls -la
exit $status
