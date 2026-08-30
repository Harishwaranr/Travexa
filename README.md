# Travexa 
link : https://travexa-wdi4.onrender.com

# Travexa — images

Drop images into `images/` with EXACTLY these filenames (.jpg, .png, or .webp).

Anything missing falls back to a pale-blue gradient card, so the layout never breaks —
it just looks emptier than it should.

## Present
local.jpg · international.jpg · goa.jpg · jaipur.jpg · munnar.jpg ·
rishikesh.jpg · japan.jpg · france.jpg · morocco.jpg

## Still needed
- `kerala.jpg` — backwaters, houseboats
- `andaman.jpg` — coastline, diving, islands
- `italy.jpg` — Rome, coastline, food
- `thailand.jpg` — islands, street food, beaches
- `iceland.jpg` — glaciers, northern lights, waterfalls

Landscape crops around 1600×1000 work best. `local.jpg`, `japan.jpg` and `jaipur.jpg`
are also the three hero scenes, so those three carry the most weight — use the
strongest images you have there.


---

# Travexa — hero video

`video/travel-journey.mp4` drives the scroll-controlled hero. Scroll position sets
`video.currentTime`; nothing else ever moves it.

If you swap in a different clip, keep the same path and re-encode it for scrubbing
first (see notes below) — a normal MP4 will stutter badly when scrubbed, because the
browser has to decode from the nearest keyframe on every single seek.

    ffmpeg -i your-clip.mp4 -an -c:v libx264 -profile:v main -preset slow \
      -g 1 -keyint_min 1 -sc_threshold 0 -bf 0 -crf 27 \
      -pix_fmt yuv420p -movflags +faststart video/travel-journey.mp4

The hero's scroll length is derived from the clip's duration (about 28vh of scrolling
per second), so a longer or shorter video adjusts itself — no CSS edit needed.
