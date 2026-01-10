# Contributing Plugins to Grimm

Thank you for your interest in contributing to Grimm! This document provides guidelines for contributing plugins to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Plugin Requirements](#plugin-requirements)
- [Submitting Your Plugin](#submitting-your-plugin)
- [Review Process](#review-process)
- [Plugin Categories](#plugin-categories)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- Git
- A GitHub account

### Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/jarvis.git
cd jarvis
bun install
```

### Verify Your Setup

```bash
# Run tests to ensure everything works
bun test

# Try the demo with existing plugins
bun run demo:llm --tools
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b plugin/your-plugin-name
```

### 2. Create Your Plugin

```bash
# Copy the template
cp -r plugins/_template plugins/your-plugin

# Edit your plugin
code plugins/your-plugin/index.ts
```

### 3. Develop and Test

```bash
# Run tests for your plugin
bun test plugins/your-plugin

# Test manually
bun run demo:llm --tools
```

### 4. Add Documentation

Create a README for your plugin:

```bash
touch plugins/your-plugin/README.md
```

Include:
- What the plugin does
- Required environment variables
- Setup instructions
- Example usage

### 5. Run All Tests

```bash
# Ensure you haven't broken anything
bun test

# Check TypeScript
bunx tsc --noEmit
```

### 6. Commit Your Changes

```bash
git add plugins/your-plugin
git commit -m "feat(plugins): add your-plugin for XYZ functionality"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat(plugins): add ...` - New plugin
- `fix(plugins/name): fix ...` - Bug fix
- `docs(plugins): update ...` - Documentation

### 7. Push and Create PR

```bash
git push origin plugin/your-plugin-name
```

Then create a Pull Request on GitHub.

## Plugin Requirements

### Must Have

- [ ] **Unique name**: No conflicts with existing plugins
- [ ] **Valid `Plugin` interface**: Exports a valid plugin object
- [ ] **Prefixed tool names**: Tools prefixed with plugin name (e.g., `weather_current`)
- [ ] **Descriptive tool descriptions**: LLM uses these to decide when to call tools
- [ ] **Error handling**: All tools handle errors gracefully
- [ ] **No hardcoded secrets**: Use environment variables for API keys

### Should Have

- [ ] **README.md**: Documentation for your plugin
- [ ] **Unit tests**: At least basic functionality tests
- [ ] **German speech responses**: Grimm is a German voice assistant
- [ ] **Type safety**: Proper TypeScript types

### Nice to Have

- [ ] **Environment variable validation**: Check in `setup()`
- [ ] **Teardown cleanup**: Clean up resources on shutdown
- [ ] **Comprehensive tests**: Edge cases, error scenarios

## Submitting Your Plugin

### Pull Request Template

When creating a PR, include:

```markdown
## Plugin: your-plugin-name

### Description
Brief description of what your plugin does.

### Tools Provided
- `your_plugin_tool1` - Description
- `your_plugin_tool2` - Description

### Environment Variables
- `YOUR_API_KEY` - Description (required/optional)

### Testing
Describe how you tested the plugin.

### Checklist
- [ ] Plugin follows naming conventions
- [ ] All tests pass
- [ ] Documentation included
- [ ] No sensitive data in code
```

## Review Process

1. **Automated Checks**: CI runs tests and type checking
2. **Code Review**: Maintainer reviews code quality and security
3. **Testing**: Maintainer may test functionality
4. **Feedback**: You may be asked to make changes
5. **Merge**: Once approved, your plugin is merged

### Common Feedback

- Tool descriptions not clear enough for LLM
- Missing error handling
- Environment variables not documented
- Tool names not prefixed with plugin name

## Plugin Categories

We welcome plugins in these categories:

### Music & Media
- Streaming services (Spotify, Apple Music, etc.)
- Media players
- Podcast apps

### Smart Home
- Home Assistant
- Philips Hue
- Smart thermostats
- IoT devices

### Productivity
- Calendar (Google, Outlook)
- Reminders & Timers
- Notes & Tasks
- Email

### Information
- Weather services
- News
- Search engines
- Knowledge bases

### Communication
- Messaging (Telegram, Slack)
- Phone calls
- Notifications

### Utilities
- Calculations
- Unit conversions
- Translations
- System controls

## Security Guidelines

### Do

- Use environment variables for secrets
- Validate all input parameters
- Use HTTPS for API calls
- Implement rate limiting where appropriate
- Log errors without exposing sensitive data

### Don't

- Hardcode API keys or passwords
- Log sensitive user data
- Make unnecessary network requests
- Request more permissions than needed
- Execute arbitrary code from parameters

## Questions?

- Check README.md for development guide
- Look at existing plugins for examples
- Open a GitHub issue for questions
- Join the community discussions

---

Thank you for contributing to Grimm!
