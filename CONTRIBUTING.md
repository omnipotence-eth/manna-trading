# Contributing to Manna LLM Aster Crypto Trader

Thank you for your interest in contributing to Manna. This document outlines guidelines and instructions for contributors.

## Code of Conduct

- Be respectful and inclusive.
- Provide constructive feedback.
- Help others learn and grow.
- Follow the project's coding standards.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork:**
   ```bash
   git clone https://github.com/omnipotence-eth/manna-trading.git
   cd manna-trading
   ```
   Replace `omnipotence-eth` with your GitHub username if you cloned a fork.

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

5. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Guidelines

### Code Style

- **TypeScript**: Use strict mode, prefer type safety
- **No Emojis in Code**: Use text prefixes like `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]` instead
- **Logging**: Use consistent prefixes and structured logging
- **Naming**: Use meaningful, descriptive names
- **Functions**: Keep functions focused and single-purpose
- **Comments**: Add JSDoc comments for public methods

### TypeScript Standards

- Always use TypeScript strict mode
- Prefer `async/await` over promises
- Use proper type definitions (avoid `any` when possible)
- Export types and interfaces for reusability

### Testing

- Write tests for new features
- Ensure existing tests pass: `npm test`
- Aim for meaningful test coverage

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add new trading strategy
fix: Resolve WebSocket connection issue
docs: Update API documentation
refactor: Simplify agent coordinator logic
test: Add tests for position monitor
```

### Pull Request Process

1. Update documentation if your change affects user-facing behavior or APIs.
2. Add or update tests for new features.
3. Ensure all tests pass: `npm test`.
4. Update `CHANGELOG.md` with your changes (under Unreleased or a new version).
5. Open a pull request with:
   - A clear description of the change
   - Reference to any related issues
   - Screenshots or logs for UI or behavior changes

### Code Review

- All PRs require review before merging
- Address review comments promptly
- Be open to feedback and suggestions

## Project Structure

```
├── app/              # Next.js App Router
│   ├── api/          # API routes
│   └── ...
├── components/       # React components
├── services/         # Core business logic
│   ├── ai/          # AI agent services
│   ├── exchange/    # Exchange integration
│   ├── trading/     # Trading logic
│   └── ...
├── lib/             # Utilities and helpers
├── types/           # TypeScript type definitions
└── docs/            # Documentation
```

## Areas for Contribution

- **Bug fixes**: Check issues labeled `bug`
- **Features**: Check issues labeled `enhancement`
- **Documentation**: Improve docs, add examples
- **Testing**: Add test coverage
- **Performance**: Optimize slow operations
- **Security**: Report vulnerabilities (see SECURITY.md)

## Questions?

- Open an issue for questions or discussions
- Check existing documentation in `/docs`
- Review code comments for implementation details

Thank you for contributing.
