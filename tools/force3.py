import numpy as np
from dataclasses import dataclass, field
import plotly.graph_objects as go
import json 
import random 
import pandas as pd
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
for i, row in df[:10].iterrows():
    att = row["attractors"] 
    body = Body(i=i, a=row["a"], b=row["b"], c=row["c"], d=row["d"], 
        attractors=att, pos=np.array([att[0]["x"], att[0]["z"], row["b"]], dtype=float), 
        vel=np.array([0.0, 0.0, 0.1], dtype=float))
    bodies.append(body)
    
# Initial positions (random)
N = len(bodies)

clusters = df.c.to_list()
diam     = df.d.to_list()


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
    for b in bodies:
        p = b.pos
        for att in b.attractors:
            att_pos = to_vec(att["x"], att["z"])
            delta_xz = (att_pos - p) * np.array([1, 0, 1], dtype=float)  # zero out y
            F[b.i] += att["w"] * GLOBAL_ATTRACTOR_K * delta_xz

    # --- 2) Intra-cluster pairwise attraction on x/z ---
    # f_vec = GLOBAL_CLUSTER_K * (c_i + c_j) * (p_j - p_i)_xz
    for i in range(N):
        for j in range(i+1, N):
            if bodies[i].c == bodies[j].c:
                delta = bodies[j].pos - bodies[i].pos
                delta_xz = delta * np.array([1, 0, 1], dtype=float)
                strength = GLOBAL_CLUSTER_K * (bodies[i].c + bodies[j].c)
                F[i] +=  strength * delta_xz
                F[j] += -strength * delta_xz  # equal & opposite

    # --- 3) Pairwise repulsion in full 3D ---
    # f_mag = GLOBAL_REPULSIVE_K / (dist - 1.5 * (d_i + d_j)); direction = away from the other body
    for i in range(N):
        for j in range(i+1, N):
            rij = bodies[i].pos - bodies[j].pos
            dist = norm(rij)
            # Avoid divide by zero; also handle very small denominator to keep things finite
            denom = max(EPS, dist - .7 * (bodies[i].d + bodies[j].d))
            mag = GLOBAL_REPULSIVE_K / denom
            # Direction for i is away from j
            dir_ij = rij / max(dist, EPS)
            f_vec = mag * dir_ij
            F[i] += f_vec
            F[j] -= f_vec  # equal & opposite

    # --- 4) Gravity-like toward y=0 (negative y only) ---
    # f_y = -GLOBAL_GRAVITY_K * a_i
    for b in bodies:
        F[b.i][1] += -GLOBAL_GRAVITY_K * (10 + b.a) * b.pos[1] if b.pos[1] >= 0 else 10000.0

    # --- 5) Buoyancy-like opposite (positive y only) ---
    # f_y += +GLOBAL_GRAVITY_K * b_i
    for b in bodies:
        F[b.i][1] += +GLOBAL_BUOYANCY_K * (10 + b.b) if b.pos[1] >= 0 else 10000.0

    return F

# ----------------------------
# Simulation loop (damped Euler)
# ----------------------------

converged = False
for step in range(1, MAX_STEPS + 1):
    forces = compute_forces()
    max_force = np.max(np.linalg.norm(forces, axis=1))

    # print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
    # Stop if residual forces are small
    if max_force < FORCE_THRESHOLD:
        converged = True
        print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
        break

    # Integrate (unit mass)
    for b in bodies:
        b.vel = DAMPING * b.vel + DT * forces[b.i]
        b.pos = b.pos + DT * b.vel

# ----------------------------
# Results
# ----------------------------

np.set_printoptions(precision=4, suppress=True)

print("Final positions (x, y, z):")
for i in range(N):
    print(f"  Obj {i+1}: {bodies[i].pos}")

print("\nProperties:")
for i in range(N):
    print(f"  Obj {i+1}: a={bodies[i].a:.3f}, b={bodies[i].b:.3f}, c={int(bodies[i].c)}, diameter={bodies[i].d:.3f}")

print("\nAttractors (per object, on x/z plane):")
for i in range(N):
    A = [{"x":att['x'], "z":att['z'], "w":att['w']} for att in bodies[i].attractors]
    print(f"  Obj {i+1}: {A}")


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
