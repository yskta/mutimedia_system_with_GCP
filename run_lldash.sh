#!/bin/bash

# LL-DASH streaming with GPAC
# Requirements:
# - Segment duration: 6 seconds
# - Fragment duration: 0.2 seconds
# - Target latency: 2 seconds
# - Low latency mode enabled

cd public/video

gpac --tfdt_traf flist:srcs=testvideo.mp4:floop=-1 reframer:rt=on \
  -o ll_dash/out.mpd:segdur=6:cdur=0.2:asto=5.8:profile=live:dmode=dynamic \
  @ -o http://localhost:8080/:rdirs=ll_dash