import geopandas as gpd


# Load offline dataset
# force web version
forceWeb = False #True
try:
    if forceWeb:
        raise("forcing web")
    world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres'))
    # Select relevant columns
    world = world[['name', 'geometry']]
    postfix = "lowres"

    
except:
    print("naturalearth_lowres didn't work")
    # https://www.naturalearthdata.com/downloads/110m-cultural-vectors/ => redirected 
    boundarySrc = "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/110m/cultural/ne_110m_admin_0_boundary_lines_land.zip"
    try: 
        import requests
        import zipfile
        r = requests.get("https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip")
        print(r.status_code)
        if r.status_code != 200:
            raise("Request failed")    
        # Save the ZIP file to disk
        with open('natural_earth.zip', 'wb') as f:
            f.write(r.content)
        # extract all
        # Extract the contents of the ZIP file using zipfile
        with zipfile.ZipFile('natural_earth.zip', 'r') as zip_ref:
            zip_ref.extractall()
    
        base = "ne_110m_admin_0_countries"
        # Load the .prj file
        with open(f'{base}.prj', 'r') as f:
            proj = f.read()
        # Print the projection
        print("Projection:", proj)

        # Load the .shp file
        gdf = gpd.read_file(f'{base}.shp')
        # Load the .shx file (if it exists)
        gdf = gdf.sjoin(gpd.read_file(f'{base}.shx'), how='inner')
        # Print the geometry information
        print("Geometry Information:")
        print(gdf.geometry)

        # Set the CRS of the GDF to WGS 84 (should be already)
        gdf = gdf.to_crs('epsg:4326')
        print("Geometry Information wgs84:")
        print(gdf.geometry)

        world = gdf[["geometry","ADMIN_left"]]
        world = world.rename(columns={"ADMIN_left":"name"})
        postfix = "web"        

    except:
        print("naturalearth zip didn't work either")
        raise

centers = world.centroid
# compute centroids (ensure using geometry column) and add lon/lat columns
centroids = world.geometry.centroid
world["center_lon"] = centroids.x
world["center_lat"] = centroids.y

# add area as a size feature (approximate) by projecting to Web Mercator and measuring in m^2
world_area = world.to_crs(epsg=3857)
world["size"] = world_area.geometry.area

print("Num polygons:", len(world),len(world.name.unique()))
print("world with centers:")
print(world[["name", "size","center_lon", "center_lat"]])



# Convert to GeoJSON manually (avoids shapely 2.x array issue)
geojson_data = world.to_json()

# Save to file
output_path = f"world_polygons_{postfix}.geojson"
with open(output_path, "w") as f:
    f.write(geojson_data)

# keep only the largest feature for each name by sorting and dropping duplicates
world = world.sort_values('size', ascending=False).drop_duplicates(subset='name', keep='first').reset_index(drop=True)

# recompute centers (indexes changed) and update lon/lat
centroids = world.geometry.centroid
world["center_lon"] = centroids.x
world["center_lat"] = centroids.y

print("deduplicated world count:", len(world))

# save deduplicated GeoJSON (use 'deduped' to avoid lint/spell warnings)
output_path = f"world_polygons_{postfix}_deduped.geojson"
with open(output_path, "w") as f:
    f.write(world.to_json())
    
csv_path = f"world_names_{postfix}.csv"
names_df = world.reset_index()[["index", "name"]]
names_df.to_csv(csv_path, index=False)
print(f"Wrote {len(names_df)} names to {csv_path}")


