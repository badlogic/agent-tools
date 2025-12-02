# Agent Tools

## Setup

Add each tool directory to your PATH:

### Unix-like systems (Linux, macOS, WSL)

```bash
export PATH="$PATH:$HOME/agent-tools/search-tools"
export PATH="$PATH:$HOME/agent-tools/browser-tools"
export PATH="$PATH:$HOME/agent-tools/vscode"
```

Add these lines to your shell config (e.g., `~/.bashrc`, `~/.zshrc`, `~/.profile`) to make them permanent.

### Windows (Command Prompt)

```cmd
set PATH=%PATH%;%USERPROFILE%\agent-tools\search-tools
set PATH=%PATH%;%USERPROFILE%\agent-tools\browser-tools
set PATH=%PATH%;%USERPROFILE%\agent-tools\vscode
```

### Windows (PowerShell)

```powershell
$env:PATH += ";$env:USERPROFILE\agent-tools\search-tools"
$env:PATH += ";$env:USERPROFILE\agent-tools\browser-tools"
$env:PATH += ";$env:USERPROFILE\agent-tools\vscode"
```

For permanent PATH changes on Windows, use System Properties → Advanced → Environment Variables.

## search-tools

Headless Google search and content extraction. See [search-tools/README.md](search-tools/README.md).

## browser-tools

Interactive browser automation (requires visible Chrome window). See [browser-tools/README.md](browser-tools/README.md).

## vscode

VS Code integration tools. See [vscode/README.md](vscode/README.md).
