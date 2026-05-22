"""
Unit tests for tfii.py — corridor lane lookup logic.

The DB-bound TFII computation is not covered here (models use PostGIS); these
tests focus on the lane-mapping logic that drives the index.
"""
from app.services.tfii import CORRIDOR_LANES, _corridor_uses_lane


# ─── _corridor_uses_lane ────────────────────────────────────────────────────

class TestCorridorUsesLane:
    def test_forward_pair_matches(self):
        assert _corridor_uses_lane("CHN", "DEU", "Suez Canal") is True

    def test_reverse_pair_also_matches(self):
        """Lookup is bidirectional — DEU exporting to CHN should also count."""
        assert _corridor_uses_lane("DEU", "CHN", "Suez Canal") is True

    def test_unrelated_pair_does_not_match(self):
        assert _corridor_uses_lane("BRA", "ARG", "Suez Canal") is False

    def test_unknown_lane_returns_false(self):
        assert _corridor_uses_lane("CHN", "DEU", "Nonexistent Lane") is False

    def test_self_pair_not_in_any_lane(self):
        for lane in CORRIDOR_LANES:
            assert _corridor_uses_lane("FRA", "FRA", lane) is False


# ─── CORRIDOR_LANES structure ───────────────────────────────────────────────

class TestCorridorLanesStructure:
    def test_six_chokepoints_defined(self):
        """Plan tracks 5 chokepoints + English Channel as commercial route."""
        expected = {
            "Strait of Hormuz",
            "Suez Canal",
            "Panama Canal",
            "Strait of Malacca",
            "Bab el-Mandeb",
            "English Channel",
        }
        assert set(CORRIDOR_LANES.keys()) == expected

    def test_no_lane_is_empty(self):
        for lane, pairs in CORRIDOR_LANES.items():
            assert len(pairs) > 0, f"Lane {lane!r} has no corridor pairs"

    def test_all_iso_codes_are_three_letter_uppercase(self):
        for lane, pairs in CORRIDOR_LANES.items():
            for exporter, importer in pairs:
                assert len(exporter) == 3 and exporter.isupper(), (
                    f"Bad ISO {exporter!r} in lane {lane!r}"
                )
                assert len(importer) == 3 and importer.isupper(), (
                    f"Bad ISO {importer!r} in lane {lane!r}"
                )

    def test_no_self_pairs_in_lanes(self):
        for lane, pairs in CORRIDOR_LANES.items():
            for exporter, importer in pairs:
                assert exporter != importer, (
                    f"Self-pair {exporter}->{importer} in lane {lane!r}"
                )

    def test_no_duplicate_pairs_within_lane(self):
        for lane, pairs in CORRIDOR_LANES.items():
            assert len(pairs) == len(set(pairs)), (
                f"Duplicate pair in lane {lane!r}"
            )
