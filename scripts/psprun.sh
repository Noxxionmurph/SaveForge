#!/bin/bash
# Boot a PSP disc in PPSSPP's headless build with scripted button presses and screenshots, to check a save in the real game.
# Build PPSSPPHeadless from https://github.com/hrydgard/ppsspp (cmake -DHEADLESS=ON -DHEADLESS_CROSS=ON; needs libgl-dev,
# libegl-dev, libglu1-mesa-dev), put the save folder in MEMSTICK/PSP/SAVEDATA/, then:
#   scripts/psprun.sh PPSSPPHeadless DISC.iso MEMSTICK SECONDS "PRESSES" "SHOT_TIMES" OUTDIR
# PRESSES is SECONDS:MASK:DURATION,... in emulated time. Masks: select 0x1 (1), start 0x8 (8), up 16, right 32, down 64,
# left 128, L 256, R 512, triangle 4096, circle 8192, cross 16384, square 32768.
# Final Fantasy (US): START at 8, 10, 12 and 14 s skips to the title; cross at 17 opens Load Game; cross at 20 loads File 1;
# triangle at 26 opens the menu (cross confirms, circle goes back). The game writes saves to MEMSTICK straight away.
set -e
BIN=$1; DISC=$2; MS=$3; END=$4; PRESS=$5; SHOTS=$6; OUT=$7
mkdir -p "$OUT"
list=$(for t in $SHOTS; do printf "%s:%s/shot-%s.png," "$t" "$OUT" "$t"; done)
"$BIN" --memstick="$MS" --graphics=software --timeout-emulated="$END" --timeout-wall=600 ${PRESS:+--press=$PRESS} \
  --screenshot-at="${list%,}" "$DISC"
