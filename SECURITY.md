# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 7.x     | :white_check_mark: |
| < 7.0   | :x:                |

## Reporting a Vulnerability

**Do not report security vulnerabilities in public GitHub issues.**

Please report them privately using one of the following:

1. **GitHub Security Advisories** — Use the *Security* tab → *Advisory* flow for this repository (if enabled).
2. **Email** — Contact the maintainer via the email listed in your GitHub profile or the repository description. If no contact is listed, open a *private* issue requesting a secure channel.

### What to Include

When reporting a vulnerability, please include:

- **Description**: Clear description of the vulnerability
- **Impact**: Potential impact and severity
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Suggested Fix**: If you have ideas for a fix (optional)
- **Affected Versions**: Which versions are affected

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Depends on severity and complexity

## Security Best Practices

### For Users

1. **Never commit `.env.local`** - Contains sensitive API keys and secrets
2. **Use strong API keys** - Enable IP whitelisting on exchange accounts
3. **Rotate credentials regularly** - Change API keys periodically
4. **Monitor account activity** - Check for unauthorized trades
5. **Use simulation mode** - Test thoroughly before live trading
6. **Keep dependencies updated** - Run `npm audit` regularly

### For Developers

1. **Environment Variables**: Never hardcode secrets in code
2. **API Keys**: Always use environment variables or secure key management
3. **Input Validation**: Validate all user inputs and API responses
4. **Error Handling**: Don't expose sensitive information in error messages
5. **Dependencies**: Keep dependencies updated and review security advisories
6. **Code Review**: All code changes should be reviewed for security issues

## Known Security Considerations

### API Key Management

- API keys are stored in environment variables
- Never expose secret keys to client-side code
- Use separate public keys for client-side operations if needed
- Implement key rotation strategies

### Database Security

- Use SSL connections for production databases
- Never commit database connection strings
- Use connection pooling to prevent connection exhaustion
- Implement proper access controls

### WebSocket Security

- Validate WebSocket connections
- Implement rate limiting
- Monitor for suspicious activity
- Use secure WebSocket (WSS) in production

### Trading Security

- Implement position limits
- Use stop-loss orders to limit risk
- Monitor for unusual trading patterns
- Implement circuit breakers for extreme market conditions

## Security Updates

Security updates will be:

- Released as patch versions (e.g., 7.1.0 → 7.1.1)
- Documented in `CHANGELOG.md`
- Tagged with security labels in GitHub

## Disclosure Policy

- Vulnerabilities will be disclosed after a fix is available
- We will credit security researchers who report valid vulnerabilities
- We will work with researchers to coordinate disclosure

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)

Thank you for helping keep Manna secure.
