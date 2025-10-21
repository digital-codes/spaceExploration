import requests, math, json

def mercator_projection(lat, lon, width=100):
    """
    Convert lat/lon (degrees) to Mercator x/y with extent in x = width units.
    0,0 = Equator/Greenwich.
    """
    x = lon / 360.0 * width
    lat = max(-85.0, min(85.0, lat))  # clamp to avoid infinity
    lat_rad = math.radians(lat)
    y = math.log(math.tan(math.pi / 4 + lat_rad / 2)) * (width / (2 * math.pi))
    return x, y

def get_capital_coords(country_input):
    """
    Query Wikidata for a country's capital, ISO code, and coordinates.
    Input can be country name or code.
    """
    query = f"""
    SELECT ?country ?countryLabel ?countryCode ?capitalLabel ?coord
    WHERE {{
      ?country wdt:P31 wd:Q6256;
               (rdfs:label|skos:altLabel) "{country_input}"@en;
               wdt:P297 ?countryCode;
               wdt:P36 ?capital.
      ?capital wdt:P625 ?coord.
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    """

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    r = requests.get(url, params={"query": query}, headers=headers)
    r.raise_for_status()
    data = r.json()

    if not data["results"]["bindings"]:
        return None

    result = data["results"]["bindings"][0]
    coord = result["coord"]["value"].replace("Point(", "").replace(")", "")
    lon, lat = map(float, coord.split())
    x, y = mercator_projection(lat, lon)

    return {
        "country": result["countryLabel"]["value"],
        "iso2": result["countryCode"]["value"],
        "capital": result["capitalLabel"]["value"],
        "lat": lat,
        "lon": lon,
        "x": round(x, 6),
        "y": round(y, 6)
    }

# Example list of countries
countries = ["United States", "Argentina", "Australia", "India", "Japan",
             "China", "Russia", "Germany", "Israel", "South Africa","Canada","Morocco"]

results = {}
for c in countries:
    print(f"Fetching {c}...")
    info = get_capital_coords(c)
    if info:
        results[info["iso2"]] = info

# Compute Mercator extents for reference
width = 100
lat_limit = 85
y_extent = math.log(math.tan(math.pi/4 + math.radians(lat_limit)/2)) * (width / (2 * math.pi))
extents = {
    "x_min": -width/2,
    "x_max": width/2,
    "y_min": -y_extent,
    "y_max": y_extent
}

output = {
    "projection": "Mercator",
    "extent_units": "width=100 (x), origin=Equator/Greenwich",
    "extents": extents,
    "capitals": results
}

with open("capitals_mercator_with_iso.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("\n✅ Saved to capitals_mercator_with_iso.json")

