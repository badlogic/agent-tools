# ⚠️ **NOTE**: this is now superseded by https://github.com/badlogic/pi-skills

# Agent Tools

## Setup

Add each tool directory to your PATH:

```bash
export PATH="$PATH:$HOME/agent-tools/brave-search"
export PATH="$PATH:$HOME/agent-tools/search-tools"
export PATH="$PATH:$HOME/agent-tools/browser-tools"
export PATH="$PATH:$HOME/agent-tools/vscode"
```

Add these lines to your shell config (e.g., `~/.bashrc`, `~/.zshrc`) to make them permanent.

## brave-search (recommended)
Headless web search via Brave Search. No browser required, works in server environments. See [brave-search/README.md](brave-search/README.md).

## search-tools
Google search via Puppeteer + Chrome. More accurate results but requires local Chrome, frequently hits CAPTCHAs, can't run headless on servers. See [search-tools/README.md](search-tools/README.md).

**Use brave-search unless you specifically need Google results.**

## browser-tools
Interactive browser automation (requires visible Chrome window). See [browser-tools/README.md](browser-tools/README.md).

## vscode
VS Code integration tools. See [vscode/README.md](vscode/README.md).
