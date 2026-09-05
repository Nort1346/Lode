# Security Policy

Lode is a self-hosted application that handles sensitive data: media-server
credentials, private tracker cookies/tokens, API keys, and user accounts. We take
disclosure seriously.

## Supported Versions

Only the latest release on the `main` branch is supported with security fixes.

| Version | Supported |
|---------|-----------|
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report privately using one of these channels:

- **GitHub Private Vulnerability Reporting**: use the "Report a vulnerability" button
  under the repository's *Security* tab → *Advisories*.
- **Email**: contact@nort.space (PGP preferred).

Include:

- A description of the vulnerability and its impact.
- Steps to reproduce (or a proof of concept).
- Affected version(s).

We aim to acknowledge reports within **96 hours** and will work with you on a
coordinated disclosure timeline. Credit will be given (with your permission) in the
advisory.

## Hardening Tips for Deployers

- Change the auto-generated admin password immediately after first run.
- Use a strong, unique `NUXT_SESSION_PASSWORD` and `NUXT_TRACKER_ENCRYPTION_KEY`.
- Never expose the admin panel on an untrusted network without a reverse proxy + TLS.
- Keep `NUXT_SESSION_PASSWORD` and tracker credentials out of version control.
