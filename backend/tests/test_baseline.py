"""
Unit tests for baseline.py — pure math helpers.

These functions back every z-score and trend classification surfaced to users
under the "proprietary indicators" banner. A silent bug here corrupts every
indicator simultaneously.
"""
import math

import pytest

from app.services.baseline import (
    _classify_z,
    _growth_rate,
    _mean,
    _std,
    _trend_direction,
    _z_score,
)


# ─── _mean ──────────────────────────────────────────────────────────────────

class TestMean:
    def test_empty_returns_zero(self):
        assert _mean([]) == 0.0

    def test_single_element(self):
        assert _mean([5.0]) == 5.0

    def test_simple_average(self):
        assert _mean([1, 2, 3, 4, 5]) == 3.0

    def test_negative_values(self):
        assert _mean([-2, -1, 0, 1, 2]) == 0.0

    def test_floats(self):
        assert _mean([0.1, 0.2, 0.3]) == pytest.approx(0.2)


# ─── _std ───────────────────────────────────────────────────────────────────

class TestStd:
    def test_empty_returns_zero(self):
        assert _std([]) == 0.0

    def test_single_element_returns_zero(self):
        """n-1 in denominator would div-by-zero; code guards with len < 2."""
        assert _std([42.0]) == 0.0

    def test_all_equal_returns_zero(self):
        assert _std([10, 10, 10, 10]) == 0.0

    def test_sample_std_uses_bessel_correction(self):
        """Sample std (n-1) of [1,2,3] is sqrt(1.0), not sqrt(2/3)."""
        assert _std([1, 2, 3]) == pytest.approx(1.0)

    def test_known_value(self):
        # values=[2,4,4,4,5,5,7,9], sample std = sqrt(32/7) ≈ 2.138
        assert _std([2, 4, 4, 4, 5, 5, 7, 9]) == pytest.approx(math.sqrt(32 / 7))


# ─── _z_score ───────────────────────────────────────────────────────────────

class TestZScore:
    def test_normal_case(self):
        assert _z_score(current=12, mean=10, std=2) == 1.0

    def test_negative_deviation(self):
        assert _z_score(current=6, mean=10, std=2) == -2.0

    def test_zero_std_returns_zero(self):
        """Must not divide by zero when baseline is constant."""
        assert _z_score(current=15, mean=10, std=0) == 0.0

    def test_negative_std_treated_as_zero(self):
        """Defensive: code uses `if std > 0`, so negative std should return 0."""
        assert _z_score(current=15, mean=10, std=-1) == 0.0


# ─── _classify_z (threshold-edge tests) ─────────────────────────────────────

class TestClassifyZ:
    """The classification thresholds are: normal < 1.0 ≤ notable < 1.5 ≤
    significant < 2.0 ≤ extreme. Off-by-one on these boundaries would
    silently mislabel anomalies."""

    @pytest.mark.parametrize("z,expected", [
        (0.0, "normal"),
        (0.999, "normal"),
        (1.0, "notable"),       # boundary
        (1.499, "notable"),
        (1.5, "significant"),   # boundary
        (1.999, "significant"),
        (2.0, "extreme"),       # boundary
        (3.5, "extreme"),
    ])
    def test_positive_boundaries(self, z, expected):
        assert _classify_z(z) == expected

    @pytest.mark.parametrize("z", [-0.5, -1.0, -1.5, -2.0, -3.5])
    def test_uses_absolute_value(self, z):
        """Negative z-scores must classify identically to their positive twin."""
        assert _classify_z(z) == _classify_z(-z)


# ─── _trend_direction ───────────────────────────────────────────────────────

class TestTrendDirection:
    def test_empty_is_stable(self):
        assert _trend_direction([]) == "stable"

    def test_single_value_is_stable(self):
        assert _trend_direction([42]) == "stable"

    def test_flat_series_is_stable(self):
        assert _trend_direction([100, 100, 100, 100]) == "stable"

    def test_strong_increasing(self):
        assert _trend_direction([1, 2, 3, 4, 5]) == "increasing"

    def test_strong_decreasing(self):
        assert _trend_direction([5, 4, 3, 2, 1]) == "decreasing"

    def test_two_percent_threshold_is_stable(self):
        """Code treats <2% annual change as stable.
        Series [100, 101, 102] has slope=1 over y_mean=101 → ~0.99% < 2%."""
        assert _trend_direction([100, 101, 102]) == "stable"

    def test_above_two_percent_is_trending(self):
        """[100, 105, 110]: slope=5, y_mean=105 → ~4.8% > 2%."""
        assert _trend_direction([100, 105, 110]) == "increasing"

    def test_zero_mean_does_not_crash(self):
        """y_mean = 0 would div-by-zero without the +1e-9 guard."""
        # Should not raise; result direction is implementation-defined here
        # but the call must succeed.
        result = _trend_direction([-1, 0, 1])
        assert result in {"stable", "increasing", "decreasing"}


# ─── _growth_rate ───────────────────────────────────────────────────────────

class TestGrowthRate:
    def test_zero_old_returns_none(self):
        """Division-by-zero guard."""
        assert _growth_rate(0, 100) is None

    def test_none_old_returns_none(self):
        """`if old and old != 0` short-circuits on falsy."""
        assert _growth_rate(None, 100) is None  # type: ignore[arg-type]

    def test_normal_growth(self):
        assert _growth_rate(100, 110) == 10.0

    def test_decline(self):
        assert _growth_rate(100, 90) == -10.0

    def test_rounding_to_two_decimals(self):
        # 105 from 100 → 5.0, but 105.555 → 5.555 → rounds to 5.56
        assert _growth_rate(100, 105.555) == 5.56

    def test_negative_base_uses_absolute_denominator(self):
        """abs(old) in denominator: growth from -100 to -90 is +10%, not -10%."""
        assert _growth_rate(-100, -90) == 10.0
