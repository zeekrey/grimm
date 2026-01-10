# Plugin Template

This is a template for creating new Grimm plugins. Copy this folder to get started.

## Quick Start

```bash
# Copy template
cp -r plugins/_template plugins/your-plugin-name

# Edit the plugin
code plugins/your-plugin-name/index.ts

# Test your plugin
bun run demo:llm --tools
```

## Customization Checklist

- [ ] Rename folder to your plugin name (lowercase, hyphenated)
- [ ] Update `name` in plugin definition
- [ ] Update `description` to describe your plugin
- [ ] Update `version` (start with "1.0.0")
- [ ] Add your tools to the `tools` array
- [ ] Implement `execute` functions for each tool
- [ ] Add environment variables to `config` if needed
- [ ] Implement `setup()` if you need initialization
- [ ] Implement `teardown()` if you need cleanup
- [ ] Update this README with your plugin's documentation

## Files to Modify

```
your-plugin-name/
├── index.ts    # Main plugin file (required)
└── README.md   # Plugin documentation (recommended)
```

## Need Help?

- See `plugins/README.md` for full development guide
- See `plugins/spotify/index.ts` for a complete example
- See `plugins/CLAUDE.md` for quick reference
