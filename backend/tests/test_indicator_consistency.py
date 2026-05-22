"""
Cross-module consistency between CORRIDOR_LANES (tfii) and ENERGY_WEIGHTS
(energy_corridor). A mismatch causes ECEI to silently drop contributions or
score nothing against unmapped lanes.
"""
from app.services.energy_corridor import ENERGY_WEIGHTS
from app.services.tfii import CORRIDOR_LANES


def test_every_corridor_lane_has_energy_weight():
    """energy_corridor iterates CORRIDOR_LANES and looks up ENERGY_WEIGHTS.
    A lane without a weight silently contributes 0 to ECEI."""
    missing = set(CORRIDOR_LANES.keys()) - set(ENERGY_WEIGHTS.keys())
    assert not missing, f"Lanes without energy weights: {missing}"


def test_every_energy_weight_has_a_lane():
    """An energy weight for a lane that nobody routes through is dead config
    and will mislead anyone maintaining the file."""
    missing = set(ENERGY_WEIGHTS.keys()) - set(CORRIDOR_LANES.keys())
    assert not missing, f"Energy weights with no corridor lane: {missing}"
