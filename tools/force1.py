#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Plot the smooth hyperbolic force between two spheres.

Two curves are shown:
  1️⃣ Force vs. normalized distance  (d / (r₁+r₂))
  2️⃣ Force vs. absolute distance    (d in the same units as the radii)

The force:
  • diverges at d = 1.5·(r₁+r₂)
  • decays hyperbolically for 1.5·Σr < d < 3·Σr
  • smoothly tapers to ≈0 as d → 3·Σr
  • is exactly zero for d ≥ 3·Σr
"""

import math
import numpy as np
import matplotlib.pyplot as plt
from typing import Tuple

# ----------------------------------------------------------------------
# 1️⃣ Smooth hyperbolic force (same definition as before)
def sphere_force_smooth(
    pos1: Tuple[float, float, float],
    radius1: float,
    pos2: Tuple[float, float, float],
    radius2: float,
    fc1: float,
    *,
    singularity_cap: float = 1e12
) -> Tuple[float, float, float]:
    """Force vector on sphere 1 caused by sphere 2."""
    # Vector between centres
    dx = pos2[0] - pos1[0]
    dy = pos2[1] - pos1[1]
    dz = pos2[2] - pos1[2]
    d = math.sqrt(dx*dx + dy*dy + dz*dz)

    r_sum = radius1 + radius2
    d_min = 1.5 * r_sum          # singular distance
    d_max = 3.0 * r_sum          # outer cutoff

    # No interaction beyond the cutoff
    if d >= d_max:
        return (0.0, 0.0, 0.0)

    # Magnitude
    if d <= d_min:
        mag = singularity_cap
    else:
        # Hyperbolic core
        mag = fc1 / (d - d_min)
        # Linear fade‑out to zero at d_max
        fade = (d_max - d) / (d_max - d_min)
        mag *= fade

    # Unit direction (guard against d == 0)
    if d == 0.0:
        ux, uy, uz = 0.0, 0.0, 0.0
    else:
        inv_d = 1.0 / d
        ux, uy, uz = dx * inv_d, dy * inv_d, dz * inv_d

    return (mag * ux, mag * uy, mag * uz)


# ----------------------------------------------------------------------
def force_magnitude(vec: Tuple[float, float, float]) -> float:
    """Scalar magnitude of a 3‑D vector."""
    return math.sqrt(vec[0]**2 + vec[1]**2 + vec[2]**2)


# ----------------------------------------------------------------------
def main():
    # ----- User‑adjustable parameters ---------------------------------
    radius1 = 1.0               # radius of sphere 1 (any length unit)
    radius2 = 1.0               # radius of sphere 2
    fc1     = 10.0              # global force constant (tunable)
    pos1    = (0.0, 0.0, 0.0)   # keep sphere 1 at the origin

    r_sum = radius1 + radius2

    # Sampling range: from just above the singular point up to 4·Σr
    d_start = 1.5 * r_sum
    d_end   = 4.0 * r_sum
    distances = np.linspace(d_start * 1.001, d_end, 600)   # avoid exact singularity

    forces = []          # force magnitude for each sampled distance
    for d in distances:
        pos2 = (d, 0.0, 0.0)                # place sphere 2 on the x‑axis
        vec  = sphere_force_smooth(pos1, radius1, pos2, radius2, fc1)
        forces.append(force_magnitude(vec))

    forces = np.array(forces)
    forcesX10 = np.clip(np.array(forces * 10),a_min=None, a_max=forces.max())
    

    # ----- Plot --------------------------------------------------------
    plt.figure(figsize=(9, 5))

    # 1️⃣ Normalized distance curve
    plt.plot(
        distances / r_sum,            # x = d / Σr
        forces,
        label="Force vs. normalized distance",
        color="#0066CC",
        linewidth=2,
    )

    # 2️⃣ normalized, force factor 10
    plt.plot(
        distances / r_sum,       
        forcesX10,
        label="Force * 10 vs. normlaized distance",
        color="#50d050",
        linewidth=2,
        linestyle="--",
    )

    # Axes labels
    plt.xlabel("Distance")
    plt.ylabel("Force magnitude (arbitrary units)")

    # Add vertical guides for the key points (1.5·Σr and 3·Σr)
    plt.axvline(1.5, color="red", linestyle=":", lw=1,
                label="Singular point (1.5·Σr)")
    plt.axvline(3.0, color="green", linestyle=":", lw=1,
                label="Outer cutoff (3·Σr)")

    plt.title("Smooth hyperbolic force between two spheres")
    plt.grid(True, which="both", ls="--", lw=0.5, alpha=0.7)
    plt.legend(loc="upper right")
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()

    
