import geopandas as gpd
import json

# Load offline dataset
world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres'))

# Select relevant columns
world = world[['name', 'continent', 'pop_est', 'geometry']]

# Convert to GeoJSON manually (avoids shapely 2.x array issue)
geojson_data = world.to_json()

# Save to file
output_path = "world_population.geojson"
with open(output_path, "w") as f:
    f.write(geojson_data)


