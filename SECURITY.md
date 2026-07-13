# Security

Please report vulnerabilities privately to the repository owner instead of opening a public issue. Include reproduction steps and impact where possible.

The hosted converter should use a private Vercel Blob store. Uploaded source drawings are deleted after inspection; draft access links expire after 15 minutes and stored drafts are deleted by the scheduled retention job. Because conversion is intentionally available without an Ostrid account, operators should add Vercel Firewall rate limits before public launch. Avoid logging file contents or signed Blob URLs. Reconnect the store after suspected OIDC exposure, rotate any legacy `BLOB_READ_WRITE_TOKEN`, and rotate `CRON_SECRET` after suspected exposure.
