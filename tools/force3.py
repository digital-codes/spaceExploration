import sys
import numpy as np
from dataclasses import dataclass, field
import plotly.graph_objects as go
import json 
import random 
import pandas as pd
import concurrent.futures

# ----------------------------
# Model configuration
# ----------------------------

np.random.seed(42)

N = 8  # number of objects

# Global constants (tune as needed)
GLOBAL_ATTRACTOR_K   = 0.16     # attractor force scale
GLOBAL_CLUSTER_K     = 0.02     # cluster attraction scale
GLOBAL_REPULSIVE_K   = .2      # repulsion scale
GLOBAL_GRAVITY_K     = 0.2     # used for gravity (opposite directions)
GLOBAL_BUOYANCY_K    = 1.      # used for buoyancy (opposite directions)
DT                    = 0.04     # integration time step
DAMPING               = 0.90     # velocity damping for stability
FORCE_THRESHOLD       = .1      # stop when max |force| < threshold
MAX_STEPS             = 100000     # hard cap to avoid runaway sims
EPS                   = 1e-6     # small epsilon for numerical safety


# ----------------------------
# Helpers
# ----------------------------

@dataclass
class Body:
    i: int
    a: float
    b: float
    c: float
    d: float
    pos: np.ndarray = field(default_factory=lambda: np.zeros(3))
    vel: np.ndarray = field(default_factory=lambda: np.zeros(3))
    attractors: list = field(default_factory=list)

def to_vec(x, z):
    """Return a 3D vector on the x/z plane (y=0)."""
    return np.array([x, 0.0, z], dtype=float)

def norm(v):
    return np.linalg.norm(v) + 0.0

df = pd.read_json("mcMatch_full.json")

bodies = []
# iterate over df and create Body instances
for i, row in df[:100].iterrows():
    att = row["attractors"] 
    body = Body(i=i, a=row["a"], b=row["b"], c=row["c"], d=row["d"], 
        attractors=att, pos=np.array([att[0]["x"], att[0]["z"], row["b"]], dtype=float), 
        vel=np.array([0.0, 0.0, 0.1], dtype=float))
    bodies.append(body)
    
# Initial positions (random)
N = len(bodies)

#clusters = df.c.to_list()
diam     = df.d.to_list()

# clusters are groups of objects with same c value
clusters = {}
for i, c in enumerate(clusters):
    if c not in clusters:
        clusters[c] = []
    clusters[c].append(bodies[i])

# ----------------------------
# Force computation
# ----------------------------

def compute_forces():
    """
    Returns array of shape (N, 3) with total force on each body,
    using the rules specified in the prompt.
    """

    F = np.zeros_like([b.pos for b in bodies], dtype=float)  # shape (N, 3)

    # --- 1) Attractor forces (x/z plane only) ---
    # f_vec = w * GLOBAL_ATTRACTOR_K * (attractor_position - object_position)_xz

    def _body_attractor_force(b):
        p = b.pos
        total = np.zeros(3, dtype=float)
        for att in b.attractors:
            att_pos = to_vec(att["x"], att["z"])
            delta_xz = (att_pos - p) * np.array([1, 0, 1], dtype=float)
            total += att["w"] * GLOBAL_ATTRACTOR_K * delta_xz
        return b.i, total

    # Parallelize per-body attractor accumulation using threads (numpy releases GIL on heavy ops)
    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, vec in ex.map(_body_attractor_force, bodies):
            F[idx] += vec

    # --- 2) Intra-cluster pairwise attraction on x/z ---
    # f_vec = GLOBAL_CLUSTER_K * (c_i + c_j) * (p_j - p_i)_xz
    # check all pairs in same cluster
    def _cluster_forces(cluster):
        """Compute pairwise intra-cluster x/z attraction forces for one cluster."""
        res = []
        L = len(cluster)
        for i in range(L):
            for j in range(i + 1, L):
                bi = cluster[i]
                bj = cluster[j]
                delta = bj.pos - bi.pos
                delta_xz = delta * np.array([1, 0, 1], dtype=float)
                strength = GLOBAL_CLUSTER_K * (bi.c + bj.c)
                f = strength * delta_xz
                res.append((bi.i, f))
                res.append((bj.i, -f))
        return res

    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        # map over clusters in parallel, then accumulate results in the main thread
        for pair_list in ex.map(_cluster_forces, list(clusters.values())):
            for idx, vec in pair_list:
                F[idx] += vec
                
    # --- 3) Pairwise repulsion in full 3D ---
    # Parallelized pairwise repulsion in full 3D (compute per-body against all others)
    # f_mag = GLOBAL_REPULSIVE_K / (dist - 0.7 * (d_i + d_j)); direction = away from the other body
    def _repulse_body(b):
        total = np.zeros(3, dtype=float)
        for bj in bodies:
            if bj.i == b.i:
                continue
            rij = b.pos - bj.pos
            dist = norm(rij)
            denom = max(EPS, dist - 0.7 * (b.d + bj.d))
            mag = GLOBAL_REPULSIVE_K / denom
            dir_ij = rij / max(dist, EPS)
            total += mag * dir_ij
        return b.i, total

    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, vec in ex.map(_repulse_body, bodies):
            F[idx] += vec
            
    # --- 4) Gravity-like toward y=0 (negative y only) ---
    # f_y = -GLOBAL_GRAVITY_K * a_i
    def _gravity_body(b):
        val = -GLOBAL_GRAVITY_K * (10 + b.a) * b.pos[1] if b.pos[1] >= 0 else 10000.0
        return b.i, np.array([0.0, val, 0.0], dtype=float)

    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, vec in ex.map(_gravity_body, bodies):
            F[idx] += vec

    # --- 5) Buoyancy-like opposite (positive y only) ---
    # f_y += +GLOBAL_GRAVITY_K * b_i
    def _buoyancy_body(b):
        val = GLOBAL_BUOYANCY_K * (10 + b.b) if b.pos[1] >= 0 else 10000.0
        return b.i, np.array([0.0, val, 0.0], dtype=float)

    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, vec in ex.map(_buoyancy_body, bodies):
            F[idx] += vec

    return F

# ----------------------------
# Simulation loop (damped Euler)
# ----------------------------

converged = False
for step in range(1, MAX_STEPS + 1):
    if step % 10 == 0:
        print(f"Step {step:4d}...", end="\r")
    forces = compute_forces()
    max_force = np.max(np.linalg.norm(forces, axis=1))

    # print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
    # Stop if residual forces are small
    if max_force < FORCE_THRESHOLD:
        converged = True
        print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
        break

    # Integrate (unit mass)
    # Parallelized integration (damped Euler) per body
    def _integrate_body(b):
        new_vel = DAMPING * b.vel + DT * forces[b.i]
        new_pos = b.pos + DT * new_vel
        return b.i, new_vel, new_pos

    max_workers = min(32, max(1, len(bodies)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, new_vel, new_pos in ex.map(_integrate_body, bodies):
            bodies[idx].vel = new_vel
            bodies[idx].pos = new_pos

# ----------------------------
# Results
# ----------------------------

np.set_printoptions(precision=4, suppress=True)

#print("Final positions (x, y, z):")
#for i in range(N):
#    print(f"  Obj {i+1}: {bodies[i].pos}")


objects_json = []

for i, b in enumerate(bodies):
    obj_entry = {
        "mesh": None,
        "name": f"obj{i+1}",
        "emissive": False,
        "map": None,
        "img": "img/textures/poster.png",
        "xpos": float(b.pos[0]),
        "ypos": float(b.pos[1]),
        "zpos": float(b.pos[2]),
        "parm_a": float(b.a),
        "parm_b": float(b.b),
        "parm_c": float(b.c),
        "diameter": float(b.d),
        "rotation": {
            "speed": random.uniform(0, .1),
            "angle": random.uniform(0,6.2),
            "active": True
        },
        "orbit": {
            "radius": random.randint(3,20),
            "speed": random.uniform(0, .01),
            "angle": .1,
            "active": True
        }
    }
    objects_json.append(obj_entry)

# Write to file
with open("objects.json", "w") as f:
    json.dump(objects_json, f, indent=4)

sys.exit()

# ----------------------------
# Visualization with Plotly
# ----------------------------
fig = go.Figure()

# Transform coordinates: (x, z, y)
pos = np.array([b.pos for b in bodies])
x = pos[:, 0]
y_ground = pos[:, 2]   # z-axis in simulation → horizontal ground axis
z_up = pos[:, 1]       # y in simulation → vertical axis
z_up = pos[:, 1]       # y in simulation → vertical axis

# Scatter plot for objects
fig.add_trace(go.Scatter3d(
    x=x,
    y=y_ground,
    z=z_up,
    mode='markers+text',
    marker=dict(
        size=diam * 20,
        color=clusters,
        colorscale='Viridis',
        opacity=0.8,
        line=dict(width=1, color='black')
    ),
    text=[f"Obj {i+1}<br>c={int(clusters[i])}" for i in range(N)],
    textposition="top center",
    name="Objects"
))

# Attractors as red Xs on the ground (y=0 in sim → z=0 in plot)
for i, b in enumerate(bodies):
    for att in b.attractors:
        fig.add_trace(go.Scatter3d(
            x=[att["x"]],
            y=[att["z"]],
            z=[0],
            mode='markers',
            marker=dict(size=6, color='red', symbol='x'),
            name=f"Attractor Obj {i+1}"
        ))

# Add a transparent ground plane for reference
plane_size = 15
fig.add_trace(go.Surface(
    x=np.linspace(-plane_size, plane_size, 2),
    y=np.linspace(-plane_size, plane_size, 2),
    z=np.zeros((2,2)),
    showscale=False,
    opacity=0.15,
    colorscale=[[0, "lightgray"], [1, "lightgray"]],
    name="Ground plane"
))

fig.update_layout(
    scene=dict(
        xaxis_title='X (ground)',
        yaxis_title='Z (ground)',
        zaxis_title='Y (up/down)',
        aspectmode='data',
        camera=dict(
            eye=dict(x=1.2, y=1.2, z=0.8)
        )
    ),
    title="3D Object System (XZ = Ground, Y = Up/Down)",
    width=900,
    height=700,
    showlegend=False
)

fig.show()
