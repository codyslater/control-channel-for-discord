# Changelog

## Unreleased

- Deep links work in VS Code forks: links may use the reader's editor scheme (`cursor://`, `windsurf://`, `vscodium://`, `vscode-insiders://`) and `/loc`'s `[open]` link now uses the running editor's own scheme, so it round-trips to that editor instead of always opening official VS Code
- README: Install section and registry badges

## 1.0.0 — 2026-08-30

Initial release.

- Sidebar with an Activity feed (recent channels/threads, previews, unread counts; mentions, then unread, on top), a Channels tree with pins and unread dots, and a Chat view
- Send as yourself via webhook (name + avatar); `@silent` by default, normal when you @mention a person
- `@` member/bot picker; incoming mentions rendered as chips
- Pop-out chat tabs (any editor group or floating window), bottom dock next to the Terminal, right dock in the Secondary Side Bar; drag channels onto any chat surface
- Clickable file / traceback / notebook-cell refs that open the right line, locally or in Remote-SSH windows
- `/loc`, `/snippet`, `/diff`, `/thread` slash commands with autocomplete
- Machine-qualified deep links (`vscode://c0d3s.control-channel-for-discord/open?…`) for bots, with tunnel and SSH resolution
- Voice channels listed with live occupant counts (opens the Discord app)
