"""
Unit tests for energy_corridor.py — energy weights configuration.

ECEI's risk classification depends entirely on these weights being correct
and well-formed.
"""
from app.services.energy_corridor import ENERGY_WEIGHTS


class TestEnergyWeights:
    def test_required_chokepoints_present(self):
        """Every strategic chokepoint named in the project plan must have an
        energy weight, or ECEI silently treats it as zero-weight."""
        required = {
            "Strait of Hormuz",
            "Strait of Malacca",
            "Suez Canal",
            "Bab el-Mandeb",
            "Panama Canal",
            "English Channel",
        }
        assert required.issubset(set(ENERGY_WEIGHTS.keys()))

    def test_weights_have_required_keys(self):
        for chokepoint, weights in ENERGY_WEIGHTS.items():
            assert "oil_share" in weights, f"{chokepoint}: missing oil_share"
            assert "lng_share" in weights, f"{chokepoint}: missing lng_share"

    def test_share_percentages_in_zero_to_hundred(self):
        for chokepoint, weights in ENERGY_WEIGHTS.items():
            assert 0 <= weights["oil_share"] <= 100, (
                f"{chokepoint}: oil_share={weights['oil_share']} out of range"
            )
            assert 0 <= weights["lng_share"] <= 100, (
                f"{chokepoint}: lng_share={weights['lng_share']} out of range"
            )

    def test_hormuz_is_most_energy_intensive(self):
        """Sanity check against published EIA/IEA figures: Strait of Hormuz
        carries the highest combined oil+LNG share globally."""
        combined = {
            cp: w["oil_share"] + w["lng_share"]
            for cp, w in ENERGY_WEIGHTS.items()
        }
        top = max(combined, key=combined.get)
        assert top == "Strait of Hormuz", (
            f"Expected Hormuz to dominate, got {top!r} with {combined[top]}%"
        )
