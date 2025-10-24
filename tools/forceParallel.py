import numpy as np
from numba import njit, prange
import time

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

    return forces


# ============================================================
# Position update (no physics)
# ============================================================

@njit(parallel=True, fastmath=True)
def apply_forces(pos, forces, step_size=0.05, max_disp=1.0):
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
        if norm > 1e-12:
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
    N = 2000           # number of particles/nodes
    A = 7              # attractors per particle
    rcut = 20.0        # cutoff radius for pairwise repulsion
    step_size = 0.05   # global movement scaling
    max_disp = 1.0     # per-step max displacement
    max_steps = 20000   # iteration limit
    report_every = 100 # log frequency
    force_threshold = 1 # 1e-2  # stop if total residual force < this

    # Random initial positions in [0,100]^3
    pos = np.random.rand(N,3).astype(np.float32) * 100.0

    # ------------------------------------------------------------
    # 2. Generate per-particle attractors
    # ------------------------------------------------------------
    # Each particle gets A attractors with different offsets and strengths.
    attr_pos = np.zeros((N, A, 3), dtype=np.float32)
    attr_k   = np.zeros((N, A, 3), dtype=np.float32)

    for i in range(N):
        center = np.array([50.0, 50.0, 50.0], dtype=np.float32)
        for a in range(A):
            # Slight random offset for each attractor
            offset = np.random.uniform(-20, 20, 3).astype(np.float32)
            attr_pos[i,a] = center + offset
            # Each attractor may pull on some axes more than others
            k = np.random.uniform(0.0, 0.1, 3).astype(np.float32)
            # randomly zero out one or more axes
            mask = np.random.rand(3) < 0.3
            k[mask] = 0.0
            attr_k[i,a] = k

    # ------------------------------------------------------------
    # 3. Simulation Loop
    # ------------------------------------------------------------
    print(f"Force-directed relaxation with {N} particles, {A} attractors each...")
    t0 = time.time()

    for step_i in range(1, max_steps + 1):
        # Compute all forces (pairwise + individual attractors)
        forces = compute_forces(pos, rcut, attr_pos, attr_k)
        apply_forces(pos, forces, step_size, max_disp)

        # Compute convergence metric: total residual force
        total_force = np.sum(np.linalg.norm(forces, axis=1))

        # Print progress
        if step_i % report_every == 0 or step_i == 1:
            print(f"Step {step_i:5d} | total |F| = {total_force:.4e}")

        # Convergence check
        if total_force < force_threshold:
            print(f"Converged at step {step_i}")
            break

    t1 = time.time()
    print(f"Finished in {t1 - t0:.2f} s")
