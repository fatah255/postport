# Security

## Phase 1 Implemented Controls

- Argon2 password hashing
- Session cookie support (`httpOnly`, `sameSite=lax`, secure in production)
- Input validation via class-validator
- Request throttling
- Structured log redaction for token/secret fields
- Prisma schema support for encrypted OAuth token material (`TokenSecret`)
- Workspace membership model for RBAC foundation

## Required Additions in Upcoming Phases

- CSRF protection strategy for cookie auth
- OAuth token encryption/decryption service integration in connection flows
- Signed upload URL validation and content-size limits
- SSRF protections for remote URL ingestion
- Secret rotation runbook and KMS integration
- Full audit trails for connection lifecycle and publish operations
