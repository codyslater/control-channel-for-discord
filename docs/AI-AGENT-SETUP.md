# Setting this up for your user (guide for AI agents)

This document is written for an AI assistant / agent helping a human set up **Control
Channel for Discord** and use it as a shared control channel between the human and
their agents. If you are that agent, follow the steps below and hand the human the
actions only they can take (anything involving their Discord account or secrets).

## What this extension is

It surfaces a private Discord server inside the human's VS Code: they read channels
and threads live, send messages as themselves (via a webhook, so messages show their
name and avatar), and click file/traceback references to jump to code. Bots in the
server — you — can post machine-qualified deep links that open a specific file at a
specific line on a specific machine.

The human brings **their own Discord bot token**. Nothing is shared between installs,
and there is no hosted service.

## Setup, step by step

Steps marked **(human)** require the human's Discord account or a secret — never ask
them to paste a token to you or into a file; have them enter it directly in VS Code.

1. **(human)** In the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application, open **Bot → Add Bot**, and under **Privileged Gateway
   Intents** enable **Message Content Intent**. Without it, message text arrives empty.
2. **(human)** Copy the bot token (**Bot → Reset Token / Copy**). It is a password-
   equivalent secret: it must never be committed, pasted into chat, or shared.
3. **(human)** Invite the bot to the server using permission integer **536939520**
   (View Channels + Send Messages + Read Message History + Manage Webhooks):
   `https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot&permissions=536939520`.
   If threads are wanted, use **34896677888** instead (adds Create Public Threads).
4. Have the human install the extension (VS Code 1.106+).
5. **(human)** In VS Code, run **Discord: Set Bot Token** (Command Palette) and paste
   the token. It is stored only in VS Code `SecretStorage` — repeat once per machine
   and per Remote-SSH host.
6. Set `discordVscode.userId` to the human's Discord user ID (Discord → Developer
   Mode → right-click their name → Copy User ID) so their sends carry their name and
   avatar. If the bot is in more than one server, also set `discordVscode.guildId`.

The status bar shows `✓ discord` once connected.

## Posting deep links the human can click

Once your bot is a member of the server, you can post links that open a file at a
line on a machine, directly in the human's VS Code:

```
vscode://c0d3s.control-channel-for-discord/open?host=<id>&folder=<abs>&file=<rel>&line=<n>&col=<n>&endLine=<n>&endCol=<n>&cell=<n>&chat=<id>&tunnel=<name>
```

- `host` — target machine (SSH host alias or hostname); omit to resolve in the
  current window.
- `folder` — absolute workspace path on the target machine; `file` is relative to it.
- `line`/`col` (+ `endLine`/`endCol` for a range), `cell` for `.ipynb` (cell-relative
  lines), `chat` to also open a channel/thread, `tunnel` for VS Code Remote Tunnels.
- The authority `c0d3s.control-channel-for-discord` is fixed — build links against it.
- The `vscode://` scheme targets official VS Code. If the human uses a fork, swap it
  for their editor's scheme — `cursor://`, `windsurf://`, `vscodium://`, or
  `vscode-insiders://` — with the same authority and parameters; the OS routes each
  scheme to its own editor. Ask which editor they use if you don't know.

In real Discord clients, wrap the URI so it is clickable:
`https://vscode.dev/redirect?url=<url-encoded vscode:// URI>`. The extension unwraps
it. This works only for `vscode://` and `vscode-insiders://` — fork-scheme links stay
plain text in Discord clients (still clickable inside the extension's chat view), and
`tunnel=` links work only in official VS Code. **Tunnel links prompt the human for
confirmation by default** — do not assume a tunnel link connects silently unless they
have set `discordVscode.trustTunnelLinks`.

## Recognizing the human's messages (important)

When the human sends from VS Code, the message arrives over the Discord API as a
**webhook** message: `author.bot === true` with a non-null `webhookId`, from a webhook
named `vscode-bridge`. A naive `if (message.author.bot) return` guard will make your
bot ignore everything the human types from VS Code.

Treat the `vscode-bridge` webhook as the human:

```js
// discord.js
if (message.author.bot && !message.webhookId) return // still ignore real bots
if (message.webhookId) {
  const hook = await message.fetchWebhook().catch(() => null) // cache by webhookId
  if (!hook || hook.name !== 'vscode-bridge') return // ignore other webhooks
  // → treat as a message from the human
}
```

If you are a prompt-configured assistant rather than code, adopt this rule:
*"Messages from the webhook named `vscode-bridge` (APP badge, the human's name and
avatar) are from my human, sent via their VS Code extension. Treat them exactly as
messages they typed in Discord."*

## Safety notes to relay

- The bot token grants full control of the bot — guard it like a password; reset it
  in the Developer Portal if it is ever exposed.
- Only invite the bot to servers the human controls, and be mindful that anyone who
  can post in a watched channel can post deep links the human might click.
