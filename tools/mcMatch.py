import pandas as pd
import random

m = pd.read_json("movies_rich.json")
c = pd.read_json("countries_with_center_mercator_cropped.json")

print(m.info())
print(c.info())

# split comma-separated ids into lists, strip whitespace and remove empty strings
c["movie_id"] = c["ids"].fillna("").astype(str).str.split(",").apply(lambda lst: [s.strip() for s in lst if s.strip()])

# explode so there's one row per id and convert to nullable integer, dropping invalid entries
c = c.explode("movie_id").reset_index(drop=True)
c["movie_id"] = pd.to_numeric(c["movie_id"], errors="coerce").astype(pd.Int64Dtype())
c = c[c["movie_id"].notna()].reset_index(drop=True)

print(c.info())

# merge on movie_id
mc = pd.merge(m, c, how="inner", left_index=True, right_on="movie_id", suffixes=("_movie", "_country"))
print(mc.info())
mc.to_json("mcMatched.json", orient="records", indent=2)


# create attractors list for each object
# group mc by movie_id
# for each group create a list of dicts with properties like:
# x: from center_mercator"[0]
# y: from center_mercator"[1]
# w: from 1 / group size
attractors = mc.groupby("movie_id").agg(list).reset_index()
attractors["attractors"] = attractors["center_mercator_cropped"].apply(lambda lst: [
    {"x": item[0], "z": item[1], "w": 1 / len(lst)} for item in lst
])  
# add the attractors list to the dataframe
mc = mc.merge(attractors[["movie_id", "attractors"]], on="movie_id", how="left")
# select first row per movie_id to avoid duplicates
mc = mc.drop_duplicates(subset=["movie_id"]).reset_index(drop=True)

# add the following columns to mc:
# i=i, a=prop_a[i], b=prop_b[i], c=clusters[i], d=diam[i]

# print(mc.columns)

mc["i"] = mc.index
mc["a"] = [random.uniform(-.1,.1) for _ in range(len(mc))]  # a: random float between -0.1 and 0.1

# b from age
mc["b"] = [
    (pd.to_numeric(y, errors="coerce") - 1990) + random.uniform(-0.1, 0.1)
    for y in mc["JAHR"]
]
mc["d"] = 1  # d: constant value of 1
# c: cluster assignment, 2 objects in c=1, 3 objects in c=2
mc["c"] = mc["movie_id"]   # cluster assignment based on movie_id

mc.to_json("mcMatch_full.json", orient="records", indent=2)
