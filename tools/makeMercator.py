# requirements: geopandas, shapely, matplotlib, pillow

import os, json, math
import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.affinity import scale as shp_scale
from PIL import Image

# ---------- inputs / filenames (relative) ----------
CAPITALS_JSON = "capitals_mercator_with_iso.json"
FULL_IMG      = "mercator_world_full_plain.png"
FULL_IMG_RAW  = "mercator_world_full_raw.png"
CROPPED_IMG_RAW   = "mercator_world_cropped.png"
CROPPED_IMG   = "mercator_world_with_capitals_cropped.png"
PIXELS_JSON   = "capitals_on_cropped_image.json"

CENTERS = "countries_with_center_mercator.json"  # from makeMercator.py
CENTERS_CROP = "countries_with_center_mercator_cropped.json"  # from makeMercator.py

# ---------- load capitals + extents (authoritative) ----------
with open(CAPITALS_JSON, "r", encoding="utf-8") as f:
    jd = json.load(f)
capitals = jd["capitals"]
ext = jd["extents"]
X_MIN, X_MAX = ext["x_min"], ext["x_max"]    # expect -50..+50
Y_MIN, Y_MAX = ext["y_min"], ext["y_max"]    # ≈ ±49.8362
WIDTH_UNITS  = X_MAX - X_MIN                 # 100

# crop bounds in data units (no zoom; exact cut)
CROP_Y_TOP    =  40.0
CROP_Y_BOTTOM = -20.0
CROP_SPAN     = CROP_Y_TOP - CROP_Y_BOTTOM   # 60

# ---------- load world polygons and project ----------
world = gpd.read_file(gpd.datasets.get_path("naturalearth_lowres")).to_crs(epsg=3857)

# rescale Web Mercator meters -> your 100-unit frame
WEB_MERC_HALF = 20037508.342789244
scale_factor  = WIDTH_UNITS / (2.0 * WEB_MERC_HALF)
world["geometry"] = world["geometry"].apply(
    lambda g: shp_scale(g, xfact=scale_factor, yfact=scale_factor, origin=(0, 0))
)

# ---------- render FULL map (plain, no axes, equal units, no margins) ----------
fig_w = 10.0                                    # base height below will set the final width
# For the FULL frame, aspect ≈ 100 : (2*49.836...) ~ 1.003 — nearly square
fig_h = 10.0
fig, ax = plt.subplots(figsize=(fig_w, fig_h))
ax.set_axis_off()
fig.subplots_adjust(0, 0, 1, 1)
ax.set_aspect('equal', adjustable='box')        # <— enforce equal data units

# plot countries and markers
world.plot(ax=ax, color="#a9afb4", edgecolor="#000000", linewidth=1., zorder=1)

# exact full extents (same frame as your JSON)
ax.set_xlim(X_MIN, X_MAX)
ax.set_ylim(Y_MIN, Y_MAX)

# IMPORTANT: no bbox_inches='tight' so data->pixel mapping stays linear & full-frame
fig.savefig(FULL_IMG_RAW, dpi=300, bbox_inches=None, pad_inches=0)
plt.close(fig)

# ---------- crop vertically EXACTLY to Y=+40..-20 ----------
img = Image.open(FULL_IMG_RAW)
W, H = img.size

def y_to_px(y):   # top pixel row corresponds to Y_MAX
    return int((Y_MAX - y) / (Y_MAX - Y_MIN) * H)

top_px    = y_to_px(CROP_Y_TOP)
bottom_px = y_to_px(CROP_Y_BOTTOM)
if top_px > bottom_px:
    top_px, bottom_px = bottom_px, top_px

cropped = img.crop((0, top_px, W, bottom_px))
cropped.save(CROPPED_IMG_RAW, "PNG")


# --------- with markers ----------
fig_w = 10.0                                    # base height below will set the final width
# For the FULL frame, aspect ≈ 100 : (2*49.836...) ~ 1.003 — nearly square
fig_h = 10.0
fig, ax = plt.subplots(figsize=(fig_w, fig_h))
ax.set_axis_off()
fig.subplots_adjust(0, 0, 1, 1)
ax.set_aspect('equal', adjustable='box')        # <— enforce equal data units

# plot countries and markers
world.plot(ax=ax, color="#a9afb4", edgecolor="#000000", linewidth=0.5, zorder=1)

# capitals. only for test
for iso, c in capitals.items():
    ax.scatter(c["x"], c["y"], s=36, color="#ff9f1a", edgecolors="#0000c0", linewidths=1.0, zorder=5)

# load country centers (from makeMercator.py)
with open(CENTERS, "r", encoding="utf-8") as f:
    centers = json.load(f)

for item in centers:
    ax.scatter(item["center_mercator"][0], item["center_mercator"][1], s=50, color="#ffff1a", edgecolors="#0000c0", linewidths=1.0, zorder=10)


# exact full extents (same frame as your JSON)
ax.set_xlim(X_MIN, X_MAX)
ax.set_ylim(Y_MIN, Y_MAX)

# IMPORTANT: no bbox_inches='tight' so data->pixel mapping stays linear & full-frame
fig.savefig(FULL_IMG, dpi=300, bbox_inches=None, pad_inches=0)
plt.close(fig)


# ---------- crop vertically EXACTLY to Y=+40..-20 ----------
img = Image.open(FULL_IMG)
W, H = img.size

def y_to_px(y):   # top pixel row corresponds to Y_MAX
    return int((Y_MAX - y) / (Y_MAX - Y_MIN) * H)

top_px    = y_to_px(CROP_Y_TOP)
bottom_px = y_to_px(CROP_Y_BOTTOM)
if top_px > bottom_px:
    top_px, bottom_px = bottom_px, top_px

cropped = img.crop((0, top_px, W, bottom_px))
cropped.save(CROPPED_IMG, "PNG")




# ---------- pixel coordinates for capitals on the CROPPED image ----------
Hc = bottom_px - top_px

def x_to_px(x):
    return (x - X_MIN) / (X_MAX - X_MIN) * W

cap_pixels = {}
for iso, c in capitals.items():
    x, y = c["x"], c["y"]
    if not (CROP_Y_BOTTOM <= y <= CROP_Y_TOP):
        continue
    cap_pixels[iso] = {
        "country": c["country"],
        "capital": c["capital"],
        "x_data": x,                 # unchanged (you’re right)
        "y_data": y,
        "x_px": round(x_to_px(x), 2),
        "y_px": round(y_to_px(y) - top_px, 2)  # shift into cropped image coords
    }

for item in centers:
    x, y = item["center_mercator"]
    if not (CROP_Y_BOTTOM <= y <= CROP_Y_TOP):
        continue
    item["crop_x_px"] = round(x_to_px(x), 2)
    item["crop_y_px"] = round(y_to_px(y) - top_px, 2)
    item["center_mercator_cropped"] = [x, y - ((CROP_Y_TOP + CROP_Y_BOTTOM) / 2.0)]
with open(CENTERS_CROP, "w", encoding="utf-8") as f:
    json.dump(centers, f, ensure_ascii=False, indent=2) 

with open(PIXELS_JSON, "w", encoding="utf-8") as f:
    json.dump({
        "image": CROPPED_IMG,
        "image_size_px": [int(W), int(Hc)],
        "full_frame_extents": {"x_min": X_MIN, "x_max": X_MAX, "y_min": Y_MIN, "y_max": Y_MAX},
        "crop_y": {"top": CROP_Y_TOP, "bottom": CROP_Y_BOTTOM},
        "capitals_on_cropped_image": cap_pixels
    }, f, ensure_ascii=False, indent=2)

