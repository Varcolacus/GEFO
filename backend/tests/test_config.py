"""
Tests for the production-security validators in app/core/config.py.

The point of these validators is to make it impossible to deploy with the
default JWT secret. If anyone weakens or removes them, these tests fail.
"""
import pytest

from app.core.config import DEFAULT_JWT_SECRET, Settings


class TestProductionSecurity:
    """ENV=production refuses to boot with insecure defaults."""

    def test_development_with_default_secret_ok(self):
        """Dev mode keeps the default — that's the whole point of having one."""
        s = Settings(env="development", jwt_secret_key=DEFAULT_JWT_SECRET)
        assert s.is_production is False
        assert s.jwt_secret_key == DEFAULT_JWT_SECRET

    def test_production_with_default_secret_raises(self):
        """ENV=production + default JWT secret → cannot instantiate."""
        with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
            Settings(env="production", jwt_secret_key=DEFAULT_JWT_SECRET)

    def test_production_with_empty_secret_raises(self):
        """ENV=production + empty JWT secret → also a refusal."""
        with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
            Settings(env="production", jwt_secret_key="")

    def test_production_with_proper_secret_ok(self):
        """A genuine secret unlocks production mode."""
        s = Settings(
            env="production",
            jwt_secret_key="a" * 64,  # plausible 32-byte hex
        )
        assert s.is_production is True

    def test_production_case_insensitive(self):
        """`PRODUCTION` and `Production` both trip the validator."""
        for value in ("PRODUCTION", "Production"):
            with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
                Settings(env=value, jwt_secret_key=DEFAULT_JWT_SECRET)

    def test_stripe_half_configured_raises_in_production(self):
        """Setting STRIPE_SECRET_KEY without STRIPE_WEBHOOK_SECRET is a
        common deployment trap — webhook signature verification would fail
        silently. Refuse to boot."""
        with pytest.raises(ValueError, match="STRIPE_WEBHOOK_SECRET"):
            Settings(
                env="production",
                jwt_secret_key="a" * 64,
                stripe_secret_key="sk_live_fake",
                stripe_webhook_secret="",
            )

    def test_stripe_fully_configured_ok(self):
        """Both Stripe secrets set — production boots fine."""
        s = Settings(
            env="production",
            jwt_secret_key="a" * 64,
            stripe_secret_key="sk_live_fake",
            stripe_webhook_secret="whsec_fake",
        )
        assert s.stripe_webhook_secret == "whsec_fake"

    def test_stripe_off_in_production_ok(self):
        """Running production without Stripe at all is allowed — only the
        half-configured state is the trap."""
        s = Settings(
            env="production",
            jwt_secret_key="a" * 64,
            stripe_secret_key="",
        )
        assert s.stripe_secret_key == ""
