import numpy as np
from numba import njit, prange
import time
import pandas as pd
import sys
import signal 
import json
import random 

# ============================================================
# Pairwise repulsive force (graph-like)
# ============================================================

@njit(inline='always', fastmath=True)
def pair_force(rij, r2, k_rep=1.0):
    """
    Simple inverse-square repulsive force between two particles.
    F = k_rep * rij / (r^2 + eps)

    Parameters
    ----------
    rij : (3,) float
        Displacement vector r_j - r_i.
    r2 : float
        Squared distance between i and j.
    k_rep : float
        Repulsion constant.

    Returns
    -------
    (3,) float
        Force on particle i (points away from j).
    """
    eps = 1e-6
    inv_r = 1.0 / np.sqrt(r2 + eps)
    fmag = k_rep * inv_r * inv_r
    return -rij * fmag  # push away


# ============================================================
# Compute total forces
# ============================================================

@njit(parallel=True, fastmath=True)
def compute_forces(pos, rcut, attr_pos, attr_k):
    """
    Compute total forces on all particles:
      - pairwise repulsion (for layout spacing)
      - multiple private attractors per particle

    Parameters
    ----------
    pos : (N,3)
        Particle positions.
    rcut : float
        Cutoff distance for pairwise interactions.
    attr_pos : (N,A,3)
        Attractor positions for each particle (A per particle).
    attr_k : (N,A,3)
        Per-axis strengths for each attractor (A per particle).

    Returns
    -------
    forces : (N,3)
        Total force on each particle.
    """
    n = pos.shape[0]
    amax = attr_pos.shape[1]
    forces = np.zeros_like(pos)
    rc2 = rcut * rcut

    # Pairwise repulsion
    for i in prange(n):
        fi = np.zeros(3, dtype=pos.dtype)
        pi = pos[i]
        for j in range(n):
            if j == i:
                continue
            rij = pos[j] - pi
            r2 = rij[0]*rij[0] + rij[1]*rij[1] + rij[2]*rij[2]
            if r2 < rc2:
                fi += pair_force(rij, r2)
        forces[i] = fi

    # Add particle-specific attractor pulls
    for i in prange(n):
        px, py, pz = pos[i]
        for a in range(amax):
            kx, ky, kz = attr_k[i,a]
            ax, ay, az = attr_pos[i,a]
            if kx != 0.0:
                forces[i,0] += -kx * (px - ax)
            if ky != 0.0:
                forces[i,1] += -ky * (py - ay)
            if kz != 0.0:
                forces[i,2] += -kz * (pz - az)
        if py < 1:  # diameter 1
            # ground plane repulsion
            forces[i,1] += 10 * (1 - py)  # push up

    return forces


# ============================================================
# Position update (no physics)
# ============================================================

@njit(parallel=True, fastmath=True)
def apply_forces(pos, forces, step_size=0.05, max_disp=1.0, min_force=1e-2):
    """
    Move particles in direction of total force, scaled down
    for stability.

    Parameters
    ----------
    pos : (N,3)
        Particle positions.
    forces : (N,3)
        Total forces from compute_forces().
    step_size : float
        Global scale for movement per iteration.
    max_disp : float
        Maximum distance a particle can move in one step.
    """
    n = pos.shape[0]
    for i in prange(n):
        f = forces[i]
        norm = np.sqrt(f[0]*f[0] + f[1]*f[1] + f[2]*f[2])
        if norm > min_force:
            scale = min(step_size, max_disp / norm)
            pos[i,0] += f[0] * scale
            pos[i,1] += f[1] * scale
            pos[i,2] += f[2] * scale


# ============================================================
# Main force-directed relaxation loop
# ============================================================

if __name__ == "__main__":
    # ------------------------------------------------------------
    # 1. Initialization
    # ------------------------------------------------------------
    np.random.seed(0)
    A = 9              # attractors per particle. max 6 countries. gravity, buoyancy, cluster (1)
    rcut = 25.0        # cutoff radius for pairwise repulsion
    step_size = [0.005,0.001]   # global movement scaling
    max_disp = [0.02,0.001]     # per-step max displacement
    max_steps = 100000   # iteration limit
    report_every = 100 # log frequency
    force_threshold = 10 # 1e-2  # stop if total residual force < this

    df = pd.read_json("mcMatch_full.json")# [:500]
    N = len(df.index)

    force_threshold *= N/300

    # initialize positions and attractors
    pos = np.zeros((N, 3), dtype=np.float32)
    attr_pos = np.zeros((N, A, 3), dtype=np.float32)
    attr_k   = np.zeros((N, A, 3), dtype=np.float32)
    for i in range(N):
        attractors = df.iloc[i].attractors[:A - 3]  # leave 3 attractors for gravity, age and cluster
        # position from first attractor + b value        
        pos[i,0] = attractors[0]["x"]
        pos[i,1] = df.iloc[i].b
        pos[i,2] = attractors[0]["z"]
        # attractors, up to 6, set unused to 0 
        for a in range(len(attractors)):
            attr_pos[i,a] = np.array([attractors[a]["x"], df.iloc[i].b, attractors[a]["z"]], dtype=float)
            attr_k[i,a] = np.array([1.0, 0.0, 1.0], dtype=float) # pull on x and z only
        # unused attractors are set to 0 by default
        # gravity attractor (pull down on y)
        attr_k[i,A-3] = np.array([0.0, 1.0, 0.0], dtype=float)  # y only
        attr_pos[i,A-3] = np.array([0.0, 0.0, 0.0], dtype=float)  # ground level
        # age attractor (pull up on y) / buoyance
        attr_k[i,A-2] = np.array([0.0, 1.0, 0.0], dtype=float)  # y only
        attr_pos[i,A-2] = np.array([0.0, df.iloc[i].b, 0.0], dtype=float)  # ground level
        # cluster attractor (pull all)
        attr_k[i,A-1] = np.array([0.0, 0.0, 0.0], dtype=float)  # all axes
        attr_pos[i,A-1] = np.array([0.0, 0.0, 0.0], dtype=float)  # center of space
        
    print(f"Initialized {N} particles.")
    nshow = min(10, N)
    print(f"Showing first {nshow} particles (pos, attractor positions and strengths, df row):")
    for i in range(nshow):
        print(f"Particle {i}: pos = {pos[i].tolist()}")
        for a in range(attr_pos.shape[1]):
            print(f"  attractor[{a}] pos = {attr_pos[i,a].tolist()}, k = {attr_k[i,a].tolist()}")

    # ------------------------------------------------------------
    # install a SIGINT handler that sets a flag so we can exit cleanly
    # ------------------------------------------------------------
    _stop_flag = {"stop": False}
    _orig_sigint = signal.getsignal(signal.SIGINT)


    def _sigint_handler(signum, frame):
        _stop_flag["stop"] = True
        print("\nSIGINT received — will stop after the current step...")


    signal.signal(signal.SIGINT, _sigint_handler)



    # ------------------------------------------------------------
    # 3. Simulation Loop
    # ------------------------------------------------------------
    print(f"Force-directed relaxation with {N} particles, {A} attractors each...")
    t0 = time.time()

    converged = False
    force_range = 0  # index for step_size and max_disp
    try:

        for step_i in range(1, max_steps + 1):
            # Compute all forces (pairwise + individual attractors)
            forces = compute_forces(pos, rcut, attr_pos, attr_k)
            apply_forces(pos, forces, step_size[force_range], max_disp[force_range])

            # debug:
            #print(("forces: " + " {:8.4f}"*3).format(*forces[0] ))
            #print(("pos:    " + " {:8.4f}"*3).format(*pos[0] )  )

            # Compute convergence metric: total residual force
            total_force = np.sum(np.linalg.norm(forces, axis=1))

            if total_force < 50:
                force_range = 1  # switch to finer steps
            else:
                force_range = 0  # switch to coarser steps

            # record best position, at minimal force
            if step_i > 1 and total_force < best_force:
                best_force = total_force
                best_pos = pos.copy()
            else:
                best_force = total_force
                best_pos = pos.copy()

            # Print progress
            if step_i % report_every == 0 or step_i == 1:
                print(f"Step {step_i:5d} | total |F| = {total_force:.4e}")

            # Convergence check
            if total_force < force_threshold:
                print(f"Converged at step {step_i}")
                converged = True
                break
            
            if _stop_flag["stop"]:
                print("Stop requested, breaking simulation loop.")
                break

    except KeyboardInterrupt:
        print("\nKeyboardInterrupt received — stopping simulation...")
        _stop_flag["stop"] = True   

    finally:
        # restore original SIGINT handler
        signal.signal(signal.SIGINT, _orig_sigint)



    t1 = time.time()
    print(f"Finished in {t1 - t0:.2f} s")

    print(f"Final {N} particles.")
    nshow = min(10, N)
    print(f"Showing first {nshow} particles (pos, attractor positions and strengths, df row):")
    for i in range(nshow):
        print(f"Particle {i}: pos = {pos[i].tolist()}")


    print("Convergence status:", "Converged" if converged else "Not converged")
    
    objects_json = []

    for i in range(N):
        obj_entry = {
            "mesh": None,
            "idx": int(df.iloc[i].movie_id),
            "name": f"obj{i+1}",
            "emissive": False,
            "map": None,
            "img": "img/textures/poster.png",
            "xpos": float(best_pos[i][0]),
            "ypos": float(best_pos[i][1]),
            "zpos": float(best_pos[i][2]),
            "parm_a": float(attr_k[i][A-3][1]),
            "parm_b": float(attr_pos[i][A-2][1]),
            "parm_c": float(attr_k[i][-1][0]),
            "diameter": 1.0,
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

