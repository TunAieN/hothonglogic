# Security Policy

Do not report credentials, customer data, access tokens, or exploitable vulnerabilities in a public issue. Contact the repository maintainers through a private channel and include reproduction steps with sensitive values redacted.

Never commit `.env` files, production credentials, database dumps containing real data, runtime logs, or browser storage exports. Example environment files must contain placeholders or safe local-development defaults only.

If a secret is committed, revoke or rotate it immediately; removing it from the latest commit is not sufficient because Git history may still contain it.
