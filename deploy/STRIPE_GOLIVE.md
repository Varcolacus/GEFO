# Stripe Go-Live Checklist

A concrete walk-through to take GEFO billing from test mode to charging real cards. Do not skip any step. Each item is either a one-time action on the Stripe side, a configuration change on our side, or a verification you should perform before flipping the gate.

The integration code lives in [backend/app/api/billing.py](../backend/app/api/billing.py). The audit at the bottom of this document lists known limitations to be aware of.

---

## 1. Stripe account preparation

- [ ] **Complete Stripe Activation.** From the Dashboard, the activation requires: legal entity (individual or business), tax ID, bank account for payouts, identity verification documents. This is the single longest-elapsed-time item — submit it early because Stripe may come back with follow-ups.
- [ ] **Set the account's business name** to "GEFO" (or your registered legal name). This is what appears on customers' statements.
- [ ] **Set the customer-support email** and **statement descriptor** in Settings → Account details. The statement descriptor is what customers see on their bank statement — make it recognizable so they don't dispute.
- [ ] **Tax settings.** In Settings → Tax, enable automatic tax calculation if you have EU/UK customers. You'll need to register for VAT before this is meaningful — talk to an accountant for the threshold rules in your jurisdiction.
- [ ] **Configure the Customer Portal** (Settings → Billing → Customer portal). Enable: update payment method, cancel subscription, view invoices. Disable plan switching for now (lock in tier choice at checkout).

## 2. Product + pricing

- [ ] **Create the Pro product.** Recurring monthly + recurring yearly prices. Suggested per [STRATEGIC_MEMO.md](../STRATEGIC_MEMO.md): $99-$299/month, with yearly at ~20% discount.
- [ ] **Create the Institutional product.** Custom pricing — keep `metered=false` and set placeholder amounts; you'll override at deal time.
- [ ] **Copy the `price_*` IDs** for both products' default prices. These go into `STRIPE_PRO_PRICE_ID` and `STRIPE_INSTITUTIONAL_PRICE_ID` env vars.
- [ ] **Verify in Stripe Test mode first.** Run a full checkout → upgrade → cancel cycle in test mode using card `4242 4242 4242 4242`. This validates `TIER_PRICE_MAP` is wired correctly before you flip to live keys.

## 3. Webhook endpoint

- [ ] **Configure the webhook in Stripe Dashboard.** Settings → Webhooks → Add endpoint. URL: `https://api.YOUR-DOMAIN.com/api/billing/webhook`.
- [ ] **Subscribe to these events** (matching what `billing.py` handles):
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- [ ] **Copy the webhook signing secret** (starts with `whsec_...`). Set as `STRIPE_WEBHOOK_SECRET` in production `.env`.
- [ ] **Verify signature validation works** — disable temporarily in Stripe (toggle webhook off / on) so a delivery fires, then check the GEFO logs for `Stripe webhook: ...` lines. A `Webhook signature verification failed` line means the secret is wrong.

## 4. Backend environment

Set in production `.env`:

- [ ] `ENV=production` — triggers the security validators in `app/core/config.py`.
- [ ] `JWT_SECRET_KEY=$(openssl rand -hex 32)` — refuse-to-boot if still default (validator enforces).
- [ ] `STRIPE_SECRET_KEY=sk_live_...` — the **live** key, not `sk_test_`. The half-configured validator will refuse to boot if this is set without the webhook secret.
- [ ] `STRIPE_WEBHOOK_SECRET=whsec_...`
- [ ] `STRIPE_PRO_PRICE_ID=price_...`
- [ ] `STRIPE_INSTITUTIONAL_PRICE_ID=price_...`
- [ ] `APP_URL=https://YOUR-DOMAIN.com` — drives the Customer Portal's return URL (otherwise it sends users back to localhost).
- [ ] **Restart the backend.** The config validator runs at startup; if anything's misconfigured the API will not boot. That's by design.

## 5. End-to-end live test

Do this on a real card you control before announcing the gate is open.

- [ ] **Create a brand-new account in GEFO** (not your own existing one). Email aliased so you can throw it away after.
- [ ] **Click upgrade → checkout.** Verify the Stripe checkout page shows the correct product name, price, currency, and statement descriptor.
- [ ] **Pay with a real card.** Watch the backend logs — you should see, in order:
  - `Stripe webhook: checkout.session.completed (evt_...)`
  - `User <email> upgraded to pro`
- [ ] **Open the customer portal from the GEFO account page.** Confirm the return URL is your production URL, not localhost.
- [ ] **Cancel the subscription via the portal.** Watch for:
  - `Stripe webhook: customer.subscription.updated (...)` — status flips to "canceled" with `cancel_at_period_end=true`
  - At the end of the period: `customer.subscription.deleted` → user back to FREE
- [ ] **Refund the test charge** from the Stripe Dashboard.

## 6. Operational handoff

- [ ] **Set up Stripe Dashboard alerts.** At minimum: payment failed, dispute opened, account balance below threshold. Email them to an address you actually check.
- [ ] **Document refund policy.** Already in [TERMS.md](../TERMS.md) (14-day no-questions refund); make sure customer support knows the process — refunds go through Stripe Dashboard, not the GEFO UI.
- [ ] **Confirm Sentry catches Stripe errors.** Trigger a failed payment in test mode after going live by using card `4000 0000 0000 0341`. The handler logs `logger.warning("Payment failed for ...")`, but a Stripe API call failing during `Customer.create` would raise — verify it surfaces in Sentry.
- [ ] **Add a row to `processed_events` retention cron** (or accept that the table grows ~1 row per real subscription event ≈ <10k/year, which is fine).

---

## Known integration limitations (audit findings)

These are not blockers, but they're worth knowing before institutional sales. Each one is recorded as a TODO rather than fixed pre-launch because the cost of doing them upfront isn't justified at private-beta scale.

1. **No Stripe API version pinning.** `stripe.api_key = ...` doesn't set `stripe.api_version`. Stripe may auto-update your account's default version, which can cause subtle behavioural drift. Fix: add `stripe.api_version = "2024-12-18.acacia"` (or current pin) next to the API key set.

2. **`payment_method_types=["card"]` is restrictive.** EU customers expect SEPA debit, iDEAL, Bancontact, etc. Modern recipe: omit `payment_method_types` and pass `automatic_payment_methods={"enabled": True}` in the Checkout Session.

3. **No tax / VAT handling.** Need `automatic_tax={"enabled": True}` + `customer_update={"address": "auto"}` on the Checkout Session for VAT compliance once your VAT registration is in place.

4. **No email sync.** If a user changes their email in GEFO, the Stripe `Customer` keeps the old one. Add a `Customer.modify(...)` call to the email-change endpoint.

5. **No subscription paused state.** `SubscriptionStatus` has Pro/Past_Due/Cancelled/Trialing — but Stripe also exposes `paused`. If you ever offer pause-mid-month, add the enum value and handler.

6. **No invoice.payment_succeeded handler.** Useful for marking renewals in your own analytics. Not strictly needed for entitlement (subscription.updated covers it), but adds visibility.

7. **No customer.created handler.** Stripe creates the Customer when we call `Customer.create()` in our `/checkout` endpoint. Our own `User.stripe_customer_id` gets written there. Webhook is redundant for the creation flow but useful if you ever import existing Stripe customers.

8. **Plain `db.commit()` without transaction boundaries.** A webhook handler that partly succeeds (commit, then exception) leaves inconsistent state. For high-stakes flows, wrap handlers in `try` / `db.rollback()` blocks. The idempotency guard added in this audit limits the blast radius.

9. **No retry on `Customer.create`.** A transient network blip during checkout returns 500 to the user. Stripe's SDK does some retries internally; adding explicit `stripe.error.APIConnectionError` handling would improve UX.

10. **No webhook delivery alerting.** If Stripe can't reach your endpoint for 3 days, it stops retrying. Set up the Stripe Dashboard alert for "delivery failures" so you find out before silent breakage.

When you sign your first institutional contract, items 1, 2, 3 become real obligations. Do them then, not now.
