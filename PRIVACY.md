# Privacy Policy — GEFO (Global Economic Flow Observatory)

**Effective:** 2026-05-22
**Last updated:** 2026-05-22

This is the privacy policy for **GEFO**, operated by Tomáš Avitki ("we", "us"). It describes what data we collect, why we collect it, how it is stored, and what choices you have. Plain English. If anything below is unclear, email **tomasavitki@yahoo.com** and we will fix the wording.

## What this product is

GEFO is a web-based geoeconomic intelligence platform. It visualises bilateral trade flows, port and vessel activity, and proprietary indicators (TFII, Port Stress Indicator, Energy Corridor Exposure Index) on an interactive 3D globe. The hosted version is currently in **alpha**.

## What data we collect

We collect the **minimum** needed to operate the service.

### Account data (only if you create an account)
- Email address
- A salted bcrypt hash of your password (we never store the plaintext)
- Account tier (Free / Pro / Institutional) and creation timestamp
- API keys you generate (stored hashed; we cannot retrieve the original after creation)

### Usage data
- Per-request usage logs: timestamp, endpoint, response status, response time
- Aggregated monthly usage counts per account, used for tier-limit enforcement

We do **not** collect: IP address geolocation tracking, browsing fingerprints, third-party advertising identifiers, or anything tied to your real-world identity beyond the email address you provide.

### Cookies and similar
The web app uses **only essential cookies** for authentication session state. We do not use analytics, marketing, or third-party tracking cookies.

### Server logs
The API records standard web server logs (request line, status code, timestamps) for operational debugging. These logs are retained for **30 days** and then deleted.

### Error reporting
If error reporting (Sentry) is enabled in production, technical error context (stack traces, request paths, browser type) may be sent to Sentry. We have configured Sentry with `send_default_pii=False`, meaning personally identifying information is not forwarded. Sentry's own privacy policy: https://sentry.io/privacy/

## What we do NOT collect

- Real-time location data
- Payment card details (handled directly by Stripe — we never see card numbers; see "Payment data" below)
- Content of analytical reports you generate, beyond what is required to render them
- Data from your browser beyond what is needed to render the globe

## Payment data

If you subscribe to a paid tier, payment is processed by **Stripe**. We receive a Stripe customer ID and subscription status; we do not receive or store card details. Stripe's privacy policy: https://stripe.com/privacy

## Third-party data sources (data we serve TO you)

GEFO ingests publicly available datasets from third parties. These are sources **about countries and trade**, not about you:

- **UN Comtrade** — bilateral trade statistics. Licensed for non-commercial use; see https://comtrade.un.org/db/help/uReadMeFirst.aspx
- **World Bank Open Data** — macroeconomic indicators. Public-domain.
- **Natural Earth** — geographic shapefiles. Public-domain.
- **AISstream.io** — live vessel positions (delayed). Free tier per their terms.
- **airplanes.live** — live aircraft positions. Open-data per their terms.
- **OpenSeaMap, OpenStreetMap** — nautical and base-map tiles. ODbL.

These sources have their own privacy policies which we do not control.

## How long we keep data

| Data | Retention |
|---|---|
| Account email & password hash | Until you delete the account |
| API keys | Until you revoke them, or 90 days after last use, whichever is sooner |
| Usage logs | 30 days |
| Server access logs | 30 days |
| Stripe customer record | Per Stripe's policy + applicable accounting law |
| Error reports (Sentry) | 90 days (Sentry default) |

## Where the data lives

Servers are hosted in the **European Union** (Hetzner / OVH). The database is encrypted at rest. Backups are encrypted and stored in the same EU region.

## Your rights (GDPR and CCPA)

If you are in the EU/EEA or California:

- **Access:** you can request a copy of the data we hold about you.
- **Rectification:** you can correct inaccurate data.
- **Erasure:** you can ask us to delete your account and all associated data. Some records may be retained for legal/accounting compliance (e.g., invoices); we will tell you which.
- **Portability:** you can request your data in a machine-readable format.
- **Objection:** you can object to processing for any legitimate-interest basis.
- **Complaint:** you can lodge a complaint with your local data protection authority.

To exercise any of these, email **tomasavitki@yahoo.com**. We will respond within 30 days.

## Children

GEFO is not directed at children under 16. We do not knowingly collect data from anyone under 16. If you believe we have, contact us and we will delete it.

## Changes to this policy

If we materially change how we handle data, we will update this document, change the "Last updated" date, and notify account holders by email at least 14 days before the change takes effect.

## Contact

- **Email:** tomasavitki@yahoo.com
- **Project:** https://github.com/Varcolacus/GEFO

For a formal complaint, your local data protection authority is the right escalation route — but please write to us first; we will fix issues promptly.
