# Privacy

*Applies to **Control Channel for Discord** (`c0d3s.control-channel-for-discord`). Last updated 2026-08-31.*

## Summary

- **No telemetry, no analytics, no crash reporting, no tracking.** The extension collects nothing about you, and the author receives no data from your use of it.
- **No servers of ours.** The extension connects only to Discord's services — the REST API and gateway at `discord.com` / `discord.gg`, and Discord's CDN for avatars and attachments — using the bot token you provide. There is no other backend.
- **Open source.** Everything the extension does is auditable at [github.com/codyslater/control-channel-for-discord](https://github.com/codyslater/control-channel-for-discord).

## What is stored, and where

| Data | Where it lives |
| --- | --- |
| Bot token | VS Code `SecretStorage` (your OS keychain) — never in settings, files, or source control. Machine-local. |
| Settings (`guildId`, `userId`, pinned/hidden/silenced channels, …) | Normal VS Code settings. Some sync between your machines if you use VS Code Settings Sync — that syncing is between you and your Settings Sync provider. |
| Lightweight UI state — dock bindings, read/unread timestamps, and recent activity-feed entries (channel names, last author, a short message preview) | VS Code's local extension storage (`globalState`) on your machine. |

Message history beyond those previews is kept in memory for display only and is not written to disk.

## What leaves your machine

Only what you choose to send, and only to Discord:

- **Messages you type**, sent to the configured server via your bot's webhook, carrying the display name and avatar of the Discord user ID you configured.
- **`/loc`** posts your machine name, repository, file:line, and branch. **`/snippet`** posts the code you selected. **`/diff`** posts a summary of your working-tree changes. Each runs only when you invoke it.
- **Standard Discord API traffic** — fetching the channels, threads, messages, and member list of the one configured server.

Anything posted to a Discord server is visible to that server's members and bots and is handled by Discord under [Discord's Privacy Policy](https://discord.com/privacy).

One incidental third party: deep links posted for real Discord clients are wrapped as `https://vscode.dev/redirect?...` URLs (Discord only linkifies `http(s)`). The extension never requests that URL itself, but a reader who clicks one in a Discord client passes through Microsoft's `vscode.dev` redirect.

## What the extension reads

The channels, threads, messages, and members that your bot's role and channel permissions allow, in the single configured server. Reducing the bot's Discord permissions reduces what the extension can see — the extension has no access beyond what you grant the bot.

## Questions

Open an issue: <https://github.com/codyslater/control-channel-for-discord/issues>
