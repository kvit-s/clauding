# Deploying Clauding Extension

This guide explains how to set up a workflow where you use a production version of the Clauding extension to develop new features for itself.

## Setup Overview

You'll maintain:
1. **Production Extension**: Installed via VSIX in your main VS Code instance
2. **Development Source**: The `~/clauding` directory with source code
3. **Debug Instance**: Separate VS Code window for testing changes

## Initial Setup - Create Production Version

```bash
# Install dependencies and package the extension
npm install
npm run package
```

This creates a VSIX file (e.g., `clauding-0.1.0.vsix`)

## Install Production Version

```bash
# Install the VSIX in your main VS Code
code --install-extension clauding-0.1.0.vsix
```

Restart VS Code after installation. The production version will now be active in your main VS Code instance.

## Development Workflow

### Daily Development

1. Open `~/clauding` in VS Code (production version is active and helping you)
2. Edit source files in `src/`
3. Press `F5` or Run → Start Debugging

### What Happens When Debugging

- A new VS Code window opens (Extension Development Host)
- It loads YOUR development version from `~/clauding`
- The production version is **automatically disabled** in this debug window
- Test your changes in this debug window
- Your main VS Code window still runs the production version

### Debug Configuration

Your `.vscode/launch.json` should contain:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "~/clauding-test"
      ]
    }
  ]
}
```

The key parameter is `--extensionDevelopmentPath=${workspaceFolder}`, which tells the debug instance to load from your source directory instead of the installed version.

## Updating Production

Once you finish a feature and want to deploy it to production:

```bash
# 1. Update version in package.json (e.g., 0.1.0 → 0.1.1)
# Edit package.json and increment the version number

# 2. Build, package, and install
npm run release

# 3. Restart VS Code to activate the new production version
```

## Key Points

- **Separation**: Production (installed VSIX) vs Development (source directory)
- **Debug isolation**: F5 creates a separate window with dev version
- **No conflicts**: Production version automatically disabled in debug window
- **Version control**: Use git for source code, VSIX files for production snapshots
- **Working directory**: Debug instance opens `~/clauding-test` as the workspace

## Key Package.json Scripts

The project includes these scripts for deployment:

```json
"scripts": {
  "postinstall": "cd webview && npm install",
  "vscode:prepublish": "npm run build",
  "build": "npm run package-extension && cd webview && npm run build",
  "package": "NODE_NO_WARNINGS=1 npx vsce package",
  "install-local": "code --install-extension $(ls -t *.vsix | head -1)",
  "release": "npm run package && npm run install-local"
}
```

- `npm install` - Installs dependencies (including webview deps via postinstall)
- `npm run build` - Builds extension and webview
- `npm run package` - Builds and creates .vsix file
- `npm run release` - Builds, packages, and installs to VS Code

## Gitignore

The `.gitignore` includes build artifacts and packages:

```
node_modules/
dist/
out/
webview/dist/
*.vsix
```

## Testing Workflow

1. Make changes in source code
2. Press F5 to launch debug instance
3. Test changes in the Extension Development Host window
4. If issues found, close debug window, fix code, repeat
5. When satisfied, package and install to production
6. Restart main VS Code to use new production version

## Troubleshooting

**Problem**: Changes not showing up in debug window
**Solution**: Make sure the build completed successfully (`npm run build`)

**Problem**: Both versions seem active
**Solution**: Check that debug window shows "Extension Development Host" in title

**Problem**: Production version not found after install
**Solution**: Restart VS Code and check Extensions panel for "Clauding"

**Problem**: Debug window not opening workspace
**Solution**: Create `~/clauding-test` directory if it doesn't exist
