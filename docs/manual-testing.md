# Manual testing

Unit tests cover the pure logic (`npm test`), but the VS Code UI, the Discord
connection, and the deep-link flows need a real setup to verify. This checklist walks
the user-facing surface; run it against a real bot and server before a release.

Tip: the **Run Extension (demo)** launch config exercises most of the UI with a
fictional server and no token — good for a first pass — but sending, webhooks,
notifications, and remote/tunnel behavior need the real thing.

## Connection

- [ ] Cold start connects; status bar reaches ✓.
- [ ] Window reload mid-session auto-reconnects to ✓.
- [ ] Garbage token → auth-error status + an actionable notification.
- [ ] Message Content Intent off → intent-error message links the Developer Portal.

## Channels and messages

- [ ] Tree shows categories, channels, and threads; `hiddenChannels` hides names.
- [ ] Channel history renders: markdown, code-fence highlighting, image attachment.
- [ ] Live message from the Discord app appears; an edit updates it; a delete removes it.
- [ ] Consecutive same-author messages group under one header; hovering a grouped row shows its gutter timestamp.
- [ ] A day divider with a date label appears across a local-midnight boundary.
- [ ] Code blocks use the editor font; chat is readable in light and dark themes.
- [ ] Empty channel (0 messages) renders without error.
- [ ] A thread/channel the bot can't read → chat switches to it empty (previous messages gone) with a ⚠ Missing Access notice explaining the permission fix; selecting another channel clears the notice.

## Sending

- [ ] Send from the composer → appears as you (name/avatar + APP) in the Discord app; works in a thread.
- [ ] Your own send produces no push notification (silent), while another member's/bot's message still does.
- [ ] Manage Webhooks revoked → send falls back to the bot identity + a one-time warning.

## Slash commands

- [ ] `/` opens autocomplete; Tab completes `/loc `; Esc dismisses; Enter with the popup closed still sends.
- [ ] `/loc` posts the 📍 line with an `[open]` link to the typed-in channel; `/loc some text` combines both; `//loc x` sends a literal `/loc x`.
- [ ] `/loc` typed in a pop-out posts to the pop-out's channel, not the sidebar's.
- [ ] `/snippet` with a selection posts a ref + fenced code (ref clickable on round-trip); without a selection → toast, no message.
- [ ] `/thread <name>` creates the thread, switches chat to it, and shows it in the tree; bare `/thread` and `/thread` inside a thread → toasts.
- [ ] `/diff` with a dirty tree posts a file summary; clean tree → "No working-tree changes"; works over Remote-SSH.

## References and jump links

- [ ] `src/<file>:12-34` in a code-fenced traceback opens the editor with lines 12–34 selected.
- [ ] An `.ipynb` ref opens the notebook editor; `nb.ipynb#<cell>:<lines>` scrolls the cell into view and selects the lines.
- [ ] Ambiguous bare filename → quick-pick; missing path → not-found toast.
- [ ] A ref to a path **outside the workspace** (absolute, or `..`-escaping) asks for confirmation before opening; an in-workspace ref opens on one click.
- [ ] A message with an image from a non-Discord host does not load it (blocked by CSP); a real Discord CDN attachment/avatar does load.

## Deep links

- [ ] Deep link with `host=<this machine>` clicked in a LOCAL window opens the file in place; a range (`line`+`endLine`) selects it; `cell=` targets a notebook cell (cell-relative lines).
- [ ] `cell=999` → last cell, no error; `line=999` in a short cell → clamped, no error; empty (0-cell) notebook with `cell=` → opens, no error.
- [ ] Invalid `host` (e.g. `host=evil+x`) → opens in the current window (host dropped), no remote prompt.
- [ ] A `tunnel=` link asks for confirmation before connecting; with `discordVscode.trustTunnelLinks` on, it connects without asking.
- [ ] In a tunnel window, a link naming that same tunnel (with a differing `host`) opens in place — no second window.
- [ ] In an SSH-remote window connected by IP, with the machine's hostname in `hostAliases`, a `host=<hostname>` link opens in place — no new window.
- [ ] Deep link `host=<remote>` clicked in a LOCAL window opens the remote window and reveals the file (`pendingReveal`).
- [ ] Jump link with an unknown `chat=` ID while offline → warning toast, no error popup.

## Docks, pop-outs, and pinning

- [ ] **Open in Bottom Dock** → chat tab next to the Terminal, bound independent of the sidebar; reload restores it.
- [ ] **Open in Right Dock** → Secondary Side Bar opens with the Discord Chat tab bound to the channel; a single Discord icon in the activity bar; reload restores it.
- [ ] A docked channel gets no unread dot and no Activity entry while bound.
- [ ] **Send Current Channel to Bottom/Right Dock** → dock binds and the sidebar chat blanks and hides; docking a different channel from the tree leaves the sidebar alone; clicking a channel brings the sidebar chat back.
- [ ] Pop out a thread → editor-tab chat; send + live receive work; **Move Editor into New Window** keeps it streaming.
- [ ] Same channel in sidebar + pop-out stays in sync; a popped-out channel gets no unread dot.
- [ ] `popOutPlacement: below` opens a pop-out below the active group; palette **Beside/Below** variants override the setting.
- [ ] Drag a channel onto the sidebar chat → switches to it; onto a dock → rebinds (persisted across reload). Dragging a category or voice channel, or dropping onto a pop-out, is ignored.
- [ ] Pin a channel → 📌 section on top with expandable threads; pin a single thread; unpin removes; pins sync via Settings Sync.
- [ ] The tree inline button follows `discordVscode.treeButtonTarget` (right dock by default); changing the setting swaps its icon and destination live; clicking the row always opens the sidebar chat.

## Activity feed

- [ ] Fresh profile: Activity is present at minimum height with seeded rows (recency only, no unread marks); Channels below; no Chat pane until a click.
- [ ] Bot posts in an unopened channel → its row jumps up, highlighted with `(1)`; a second post → `(2)`; opening it → plain, still listed with `author: preview · time`.
- [ ] A message that @mentions you → mention icon, sorted first even if older.
- [ ] Your own vscode-side post updates the row preview to your name, with no unread, and creates no Activity entry.
- [ ] **Clear and Hide** on the sidebar chat → pane gone; a new message in that channel → unread dot in the tree + Activity count.
- [ ] Reload → feed and read state survive; a channel that got a message while VS Code was closed shows `•` (no count).
- [ ] A read row disappears ~15 min after its last message; an unread/mentioned row stays; `activityWindowMinutes: 0` brings all rows back.
- [ ] Silence a channel → its entry is removed immediately and no new entries appear; unread dot still works; Unsilence restores.

## Mentions

- [ ] `@` opens the member popup (sidebar, pop-out, and dock composers); typing filters; ↑/↓ + Tab/Enter pick; Esc closes; Enter with the popup closed still sends.
- [ ] Picked bot → mention chip in the Discord app, arrives silent, the bot reacts.
- [ ] Picked human → they are pinged; your own phone still isn't pinged for your post.
- [ ] A typed-but-unpicked `@word`, and an email like `a@b.c`, stay literal text.
- [ ] `/loc @<bot> look` posts the 📍 line with a working mention.
- [ ] Incoming user + bot + role mentions render as `@name` chips; a mention inside a code span/block stays literal; readable in light and dark.
- [ ] Member search failing (offline, type `@x`) → popup empty, no error banner.
- [ ] Two members with the same display name both appear; the picked one is the one mentioned.

## Remote-SSH

The extension runs on the UI side — the Extensions view should list it under "Local".

- [ ] Refs resolve and open remote files.
- [ ] Share Current Location reports the SSH host (and worktree) correctly.
- [ ] Voice channel shows in the tree with a live occupant count; clicking it opens the channel in the Discord app.
