# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.5.x   | ✅        |
| < 2.5   | ❌        |

Only the latest published `2.5.x` release receives security fixes. Please upgrade before reporting.

## Reporting a Vulnerability

**Do not open a public issue for security reports.**

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/TranHoaiHung/figma-ui-mcp/security/advisories/new)
2. Click **Report a vulnerability**
3. Include reproduction steps, affected version, and impact

Only the maintainers can see the report until a fix is published.

### What to expect

- **Acknowledgement:** within 5 business days
- **Assessment:** within 14 days
- **Fix + advisory:** coordinated disclosure once a patched release is out

Reporters are credited in the advisory unless they ask otherwise.

## Scope

`figma-ui-mcp` runs an HTTP bridge bound to `localhost:38451` and executes `figma_write` JavaScript inside a VM sandbox. Reports are in scope when they involve:

- Sandbox escape from `figma_write` code execution
- The bridge accepting connections from non-local origins
- Command or code injection through MCP tool parameters
- Leakage of Figma document data outside the local machine
- Dependency vulnerabilities reachable through normal use

Out of scope:

- Issues requiring an already-compromised local machine
- Vulnerabilities in Figma Desktop or the Figma plugin API itself
- Denial of service against your own local bridge
