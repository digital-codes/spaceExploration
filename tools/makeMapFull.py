import geopandas as gpd
import matplotlib.pyplot as plt
import math

# Load world map
world = gpd.read_file(gpd.datasets.get_path("naturalearth_lowres"))

# Convert to standard Mercator
world_merc = world.to_crs(epsg=3857)

# Scale Mercator meters → same 100-unit range as your JSON (x ∈ [–50,+50])
width = 100
scale_factor = width / (2 * 20037508.34)  # total world width (EPSG:3857)
world_merc["geometry"] = world_merc.scale(xfact=scale_factor, yfact=scale_factor, origin=(0, 0))

# Compute y-extent for ±85°
lat_limit = 85
y_extent = math.log(math.tan(math.pi/4 + math.radians(lat_limit)/2)) * (width / (2*math.pi))
x_min, x_max = -width/2, width/2
y_min, y_max = -y_extent, y_extent

# Plot
fig, ax = plt.subplots(figsize=(14, 7), facecolor="#d4ebff")
ax.set_facecolor("#a3c6e6")  # ocean

world_merc.plot(ax=ax, color="#e8d8a0", edgecolor="#333333", linewidth=0.4)

ax.set_xlim(x_min, x_max)
ax.set_ylim(y_min, y_max)

# Axis formatting
for spine in ["top", "right"]:
    ax.spines[spine].set_visible(False)
ax.spines["left"].set_visible(True)
ax.spines["bottom"].set_visible(True)
ax.xaxis.set_ticks_position("bottom")
ax.yaxis.set_ticks_position("left")

ax.set_xlabel("X (Mercator map units, width = 100)", fontsize=9)
ax.set_ylabel("Y (Mercator map units)", fontsize=9)
ax.set_title(
    "World Map — Mercator Projection (same scale as capitals JSON)\nLongitude –180→+180°, Latitude –85→+85°",
    fontsize=13, pad=12
)

plt.tight_layout()
plt.savefig("mercator_world_map_political_same_scale_full.png", dpi=1200, bbox_inches="tight")
plt.show()
