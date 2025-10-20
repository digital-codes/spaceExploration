import numpy as np
from dataclasses import dataclass, field
import plotly.graph_objects as go
import json 
import random 
# ----------------------------
# Model configuration
# ----------------------------

np.random.seed(42)

N = 8  # number of objects

# Global constants (tune as needed)
GLOBAL_ATTRACTOR_K   = 0.16     # attractor force scale
GLOBAL_CLUSTER_K     = 0.02     # cluster attraction scale
GLOBAL_REPULSIVE_K   = .5      # repulsion scale
GLOBAL_GRAVITY_K     = 0.2     # used for gravity (opposite directions)
GLOBAL_BUOYANCY_K    = 1.      # used for buoyancy (opposite directions)
DT                    = 0.04     # integration time step
DAMPING               = 0.90     # velocity damping for stability
FORCE_THRESHOLD       = .1      # stop when max |force| < threshold
MAX_STEPS             = 10000     # hard cap to avoid runaway sims
EPS                   = 1e-6     # small epsilon for numerical safety

# ----------------------------
# Input data from the prompt
# ----------------------------

# Attractors per object (note: given {x:..., y:...} are interpreted as {x:..., z:...} for ground plane)
raw_attractors = {
    1:  [{"x":3, "y":2, "w":1}, {"x":1, "y":3, "w":2}],
    2:  [{"x":1, "y":12,"w":3}],
    3:  [{"x":5, "y":0, "w":1}, {"x":1, "y":1, "w":3}],
    4:  [{"x":1, "y":1, "w":1}],
    5:  [{"x":0, "y":2, "w":5}, {"x":3, "y":3, "w":2}],
    6:  [{"x":5, "y":5, "w":3}],
    7:  [{"x":5, "y":5, "w":3}],
    8:  [{"x":5, "y":5, "w":3}],
}

# Random properties a, b; fixed cluster c and diameter
# Cluster membership: 2 objects in c=1, 3 objects in c=2 (as requested)
clusters = np.array([1, 1, 2, 2, 2,3,3,3], dtype=float)  # c values
prop_a   = np.random.uniform(-.1,.1, size=N)     # gravity-like
prop_b   = np.random.uniform(-3,6, size=N)     # buoyancy-like
diam     = np.random.uniform(5.0, 5.0, size=N)     # diameters (random, can be set explicitly)

# Initial positions (random)
pos = np.random.uniform(-2.0, 2.0, size=(N, 3))
vel = np.zeros((N, 3))

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
    attractors: list = field(default_factory=list)

def to_vec(x, z):
    """Return a 3D vector on the x/z plane (y=0)."""
    return np.array([x, 0.0, z], dtype=float)

def norm(v):
    return np.linalg.norm(v) + 0.0

# Build bodies with per-object attractors mapped to x/z
bodies = []
for i in range(N):
    # Convert given "y" to "z" for ground plane
    att = [ {"x":a["x"], "z":a["y"], "w":a["w"]} for a in raw_attractors.get(i+1, []) ]
    body = Body(i=i, a=prop_a[i], b=prop_b[i], c=clusters[i], d=diam[i], attractors=att)
    #if clusters[i] == 3:
        #body.a = 10.
        #body.b = 10.1
    bodies.append(body)

# ----------------------------
# Force computation
# ----------------------------

def compute_forces(positions):
    """
    Returns array of shape (N, 3) with total force on each body,
    using the rules specified in the prompt.
    """
    F = np.zeros_like(positions)

    # --- 1) Attractor forces (x/z plane only) ---
    # f_vec = w * GLOBAL_ATTRACTOR_K * (attractor_position - object_position)_xz
    for b in bodies:
        p = positions[b.i]
        for att in b.attractors:
            att_pos = to_vec(att["x"], att["z"])
            delta_xz = (att_pos - p) * np.array([1, 0, 1], dtype=float)  # zero out y
            F[b.i] += att["w"] * GLOBAL_ATTRACTOR_K * delta_xz

    # --- 2) Intra-cluster pairwise attraction on x/z ---
    # f_vec = GLOBAL_CLUSTER_K * (c_i + c_j) * (p_j - p_i)_xz
    for i in range(N):
        for j in range(i+1, N):
            if bodies[i].c == bodies[j].c:
                delta = positions[j] - positions[i]
                delta_xz = delta * np.array([1, 0, 1], dtype=float)
                strength = GLOBAL_CLUSTER_K * (bodies[i].c + bodies[j].c)
                F[i] +=  strength * delta_xz
                F[j] += -strength * delta_xz  # equal & opposite

    # --- 3) Pairwise repulsion in full 3D ---
    # f_mag = GLOBAL_REPULSIVE_K / (dist - 1.5 * (d_i + d_j)); direction = away from the other body
    for i in range(N):
        for j in range(i+1, N):
            rij = positions[i] - positions[j]
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
        F[b.i][1] += -GLOBAL_GRAVITY_K * (10 + b.a) * positions[b.i][1] if positions[b.i][1] >= 0 else 10000.0

    # --- 5) Buoyancy-like opposite (positive y only) ---
    # f_y += +GLOBAL_GRAVITY_K * b_i
    for b in bodies:
        F[b.i][1] += +GLOBAL_BUOYANCY_K * (10 + b.b) if positions[b.i][1] >= 0 else 10000.0

    return F

# ----------------------------
# Simulation loop (damped Euler)
# ----------------------------

converged = False
for step in range(1, MAX_STEPS + 1):
    forces = compute_forces(pos)
    max_force = np.max(np.linalg.norm(forces, axis=1))

    # print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
    # Stop if residual forces are small
    if max_force < FORCE_THRESHOLD:
        converged = True
        print(f"Step {step:4d}  |  max residual force: {max_force:.6f}")
        break

    # Integrate (unit mass)
    vel = DAMPING * vel + DT * forces
    pos = pos + DT * vel

# ----------------------------
# Results
# ----------------------------

np.set_printoptions(precision=4, suppress=True)

print(f"Converged: {converged} at step {step}  |  max residual force: {max_force:.6f}\n")
print("Final positions (x, y, z):")
for i in range(N):
    print(f"  Obj {i+1}: {pos[i]}")

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
        "diameter": float(b.d),
        "xpos": float(pos[i, 0]),
        "ypos": float(pos[i, 1]),
        "zpos": float(pos[i, 2]),
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
x = pos[:, 0]
y_ground = pos[:, 2]   # z-axis in simulation → horizontal ground axis
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
