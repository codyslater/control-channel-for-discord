# Contributing

Thanks for your interest — contributions are welcome, whether that's a bug report,
an idea, docs, or code.

## Ways to help

- **Report a bug or request a feature** — open an issue. Include your VS Code version,
  OS, and clear steps to reproduce. For a bug, what you expected vs. what happened.
- **Send a pull request** — fixes, features, tests, or docs. For anything large,
  open an issue first so we can agree on the approach before you build it.
- **Security issues** — please do **not** open a public issue. See
  [Reporting a vulnerability](#reporting-a-vulnerability) below.

## Getting set up

You need Node.js 20+ and VS Code 1.106+.

```bash
git clone https://github.com/codyslater/control-channel-for-discord.git
cd control-channel-for-discord
npm install
npm run watch      # esbuild; rebuilds dist/ on every save
```

Then press **F5** in VS Code and pick a launch configuration:

- **Run Extension** — debugs against a real Discord server (you provide your own bot
  token via **Discord: Set Bot Token**; see the README's Bot setup).
- **Run Extension (demo)** — launches a built-in fictional server ("Orbit Labs":
  invented people and bots, seeded history, live scripted messages, bot replies).
  **No token, no network, no Discord account required** — this is the easiest way to
  develop and is what the screenshots and demo GIF use. The demo backend lives in
  `src/demo/` and is excluded from the published extension.

A second window titled **[Extension Development Host]** opens with your build loaded.
After editing, run **Developer: Reload Window** there to pick up changes.

## Before you open a PR

Both of these must pass:

```bash
npm run typecheck
npm test
```

For UI and Discord-connection behavior that unit tests can't reach, there's a manual
checklist in [docs/manual-testing.md](docs/manual-testing.md).

Guidelines that keep the codebase healthy:

- **Pure logic goes in `src/shared/`** and gets unit tests. Nothing in `src/shared/`
  imports `vscode` or `discord.js`, which is what makes it testable (tests alias
  `vscode` to a small stub — see `vitest.config.ts` and `src/test/`).
- **Write the test with the change.** New behavior or a bug fix should come with a
  test that would fail without it.
- **Keep files focused.** Prefer small modules with one clear responsibility.
- **Match the surrounding style** — TypeScript, no unused code, clear names. There's
  no heavyweight lint gate; just keep it consistent with what's there.
- **Conventional commit messages** are appreciated (`feat:`, `fix:`, `docs:`, …) but
  not enforced.

## How the code is laid out

- `src/shared/` — pure, tested logic (message/activity model, mentions, refs, URIs,
  slash-command parsing, diff/snippet formatting). No VS Code or discord.js imports.
- `src/discord/` — the Discord gateway/REST service, message normalization, and the
  webhook sender (how messages post as you).
- `src/ui/` — tree view, chat webview host, docks, pop-out panels, status bar,
  activity feed.
- `src/webview/` — the chat UI that runs inside the webview (rendering, the `@` and
  `/` pickers).
- `src/deeplink/` + `src/refs/` — the `vscode://` deep-link handler and the
  file/traceback reference resolver.
- `src/demo/` — the fictional backend for token-free development (not shipped).

## Scope

The extension is personal-use-first: you bring your own bot token, and nothing is
shared between installs. A few current boundaries, so PRs aim in the right direction:

- Text and announcement channels (and their threads) are supported. **Forum channels
  are not yet** — that's a welcome contribution.
- **Voice channels are view-only** (occupant count + open-in-Discord); there is no
  in-editor audio, by design.

## Reporting a vulnerability

If you find a security issue, please report it privately rather than in a public
issue — open a
[GitHub security advisory](https://github.com/codyslater/control-channel-for-discord/security/advisories/new)
or contact the maintainer directly. Give us a chance to fix it before public
disclosure.

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
