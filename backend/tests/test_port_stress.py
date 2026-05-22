"""
Unit tests for port_stress.py — region & capacity lookups.

The PSI formula itself is DB-bound (needs Port and ShippingDensity rows);
these tests cover the static configuration tables that feed it.
"""
from app.services.port_stress import (
    CAPACITY_MULTIPLIERS,
    REGION_GROUPS,
    _get_region_for_port,
)


# ─── _get_region_for_port ───────────────────────────────────────────────────

class TestRegionLookup:
    def test_known_country_resolves(self):
        assert _get_region_for_port("CHN") == "East Asia"
        assert _get_region_for_port("DEU") == "North Europe"
        assert _get_region_for_port("BRA") == "South America"

    def test_unknown_country_falls_back_to_other(self):
        assert _get_region_for_port("XXX") == "Other"

    def test_empty_string_is_other(self):
        assert _get_region_for_port("") == "Other"


# ─── REGION_GROUPS structure ────────────────────────────────────────────────

class TestRegionGroups:
    def test_no_iso_appears_in_two_regions(self):
        """A country can only belong to one region or PSI peer comparison
        becomes ambiguous."""
        seen: dict[str, str] = {}
        for region, isos in REGION_GROUPS.items():
            for iso in isos:
                if iso in seen:
                    raise AssertionError(
                        f"ISO {iso!r} appears in both {seen[iso]!r} and {region!r}"
                    )
                seen[iso] = region

    def test_all_isos_are_three_letter_uppercase(self):
        for region, isos in REGION_GROUPS.items():
            for iso in isos:
                assert len(iso) == 3 and iso.isupper(), (
                    f"Bad ISO {iso!r} in region {region!r}"
                )

    def test_no_region_is_empty(self):
        for region, isos in REGION_GROUPS.items():
            assert len(isos) > 0, f"Region {region!r} has no members"


# ─── CAPACITY_MULTIPLIERS ───────────────────────────────────────────────────

class TestCapacityMultipliers:
    def test_default_none_key_present(self):
        """Code looks up port_type, which can be None — must have a fallback."""
        assert None in CAPACITY_MULTIPLIERS

    def test_all_multipliers_in_sensible_range(self):
        """Multipliers compress estimated capacity; values outside (0, 3) would
        give nonsensical utilization scores."""
        for port_type, mult in CAPACITY_MULTIPLIERS.items():
            assert 0 < mult < 3, (
                f"Multiplier for {port_type!r} = {mult} is out of range"
            )

    def test_known_port_types_present(self):
        for required in ("container", "bulk", "oil"):
            assert required in CAPACITY_MULTIPLIERS, (
                f"Missing multiplier for {required!r}"
            )
