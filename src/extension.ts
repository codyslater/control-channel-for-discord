import * as path from 'node:path'
import * as vscode from 'vscode'
import { isSilentSend } from './shared/mentions'
import { MentionSend } from './shared/types'
import { getToken, promptAndStoreToken, readConfig } from './auth'
import { registerShareCommand, locationText } from './context/share'
import { composeLocationMessage, parseSlashInput } from './shared/slashCommands'
import { formatSnippet } from './shared/snippet'
import { buildSnippetRef } from './shared/snippetRef'
import { diffStat, formatDiffStat } from './shared/diffStat'
import { getWorkingTreeDiff } from './git/gitApi'
import { checkPendingReveal, registerDeepLinks, setChannelOpener } from './deeplink/handler'
import { DiscordService } from './discord/service'
import { toSendTarget, WebhookSender } from './discord/webhooks'
import { openRef, setExtensionContext } from './refs/open'
import { shouldTrack } from './shared/activity'
import { ChannelNode } from './shared/types'
import { ActivityView } from './ui/activity'
import { ChatDeps } from './ui/chatSession'
import { DockManager, DockId } from './ui/chatDocks'
import { ChatPanelManager, PopOutPlacement } from './ui/chatPanels'
import { ChatViewProvider } from './ui/chatView'
import { StatusBar } from './ui/statusBar'
import { ChannelTree } from './ui/tree'
import { registerWorktreeAction } from './worktree/action'

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context)
  context.subscriptions.push(registerDeepLinks(context))
  void checkPendingReveal(context)

  const statusBar = new StatusBar()
  // DISCORD_VSCODE_DEMO=1 (launch config "Run Extension (demo)") swaps in the fictional
  // backend from dist/demo.js — same public surface, no Discord, no token.
  type Backend = Pick<DiscordService, keyof DiscordService>
  const demo = !!process.env.DISCORD_VSCODE_DEMO
  let service: Backend = new DiscordService()
  if (demo) {
    try {
      service = (require(path.join(__dirname, 'demo.js')) as typeof import('./demo')).createDemoService()
    } catch {
      // dist/demo.js is excluded from the published VSIX; if DISCORD_VSCODE_DEMO is set
      // on an installed build, fall back to the real backend rather than failing activation.
      void vscode.window.showWarningMessage('Discord: demo backend not available in this build; using the real Discord connection.')
    }
  }
  context.subscriptions.push(statusBar, { dispose: () => void service.stop() })
  context.subscriptions.push(
    service.onEvent((ev) => {
      if (ev.type === 'status') statusBar.set(ev.status)
    }),
  )

  const webhookSender = new WebhookSender(() => service.getPersona(readConfig().userId))
  let warnedBotFallback = false

  const sendToChannel = async (channelId: string, text: string, mentions: MentionSend[] = []) => {
    const result = await webhookSender.send(toSendTarget(await service.getSendTarget(channelId)), text, {
      allowedUserIds: mentions.map((m) => m.id),
      silent: isSilentSend(mentions),
    })
    if (result === 'sent-as-bot' && !warnedBotFallback) {
      warnedBotFallback = true
      void vscode.window.showWarningMessage(
        'Sent as the bot: grant the bot "Manage Webhooks" on this channel to send with your name and avatar.',
      )
    }
  }

  /** Current selection as ref line + code, or null (with a toast) when nothing is selected. */
  const currentSnippet = (): { refLine: string; languageId: string; code: string } | null => {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showErrorMessage('Nothing selected to send.')
      return null
    }
    // In a notebook, the active text editor is the focused CELL's synthetic document
    // (vscode-notebook-cell scheme): its line numbers are cell-relative and its URI
    // misses workspace-folder lookup. Resolve to the real notebook + cell index.
    let docUri = editor.document.uri
    let cell: number | undefined
    const nb = vscode.window.activeNotebookEditor
    if (docUri.scheme === 'vscode-notebook-cell' && nb) {
      const idx = nb.notebook.getCells().findIndex((c) => c.document.uri.toString() === docUri.toString())
      if (idx >= 0) {
        cell = idx + 1
        docUri = nb.notebook.uri
      }
    }
    const folder = vscode.workspace.getWorkspaceFolder(docUri)
    return buildSnippetRef({
      path: docUri.path,
      folderPath: folder?.uri.path,
      startLine: editor.selection.start.line + 1,
      endLine: editor.selection.end.line + 1,
      languageId: editor.document.languageId,
      code: editor.document.getText(editor.selection),
      cell,
    })
  }

  // Composer input passes through the slash-command parser; programmatic sends
  // (the share-location command) keep using sendToChannel directly.
  const sendFromComposer = async (
    channelId: string, text: string, open: (id: string, name: string) => Promise<void>, mentions: MentionSend[],
  ) => {
    const parsed = parseSlashInput(text)
    if (parsed.kind === 'command' && parsed.command === 'loc')
      await sendToChannel(channelId, composeLocationMessage(parsed.rest, await locationText(readConfig())), mentions)
    else if (parsed.kind === 'command' && parsed.command === 'snippet') {
      const snip = currentSnippet()
      if (snip) await sendToChannel(channelId, formatSnippet({ rest: parsed.rest, ...snip }), mentions)
    } else if (parsed.kind === 'command' && parsed.command === 'diff') {
      const diff = await getWorkingTreeDiff()
      if (diff === null) void vscode.window.showErrorMessage('No git repository available for /diff.')
      else {
        const files = diffStat(diff)
        if (!files.length) void vscode.window.showInformationMessage('No working-tree changes to share.')
        else await sendToChannel(channelId, formatDiffStat(parsed.rest, files), mentions)
      }
    } else if (parsed.kind === 'command' && parsed.command === 'thread') {
      if (!parsed.rest) void vscode.window.showErrorMessage('Thread name required: /thread <name>')
      else if (service.isThread(channelId)) void vscode.window.showErrorMessage("Can't create a thread inside a thread.")
      else {
        const t = await service.createThread(channelId, parsed.rest)
        await open(t.id, t.name)
      }
    } else if (parsed.kind === 'text') await sendToChannel(channelId, parsed.text, mentions)
    // A registered command with no handler must not swallow the message.
    else await sendToChannel(channelId, text, mentions)
  }

  const tree = new ChannelTree(
    () => service.channelsSnapshot(),
    () => readConfig().hiddenChannels,
    () => readConfig().pinnedChannels,
    () => readConfig().silencedChannels,
  )
  const activity = new ActivityView(
    (id) => service.channelsSnapshot().find((n) => n.id === id),
    context.globalState,
    () => readConfig().activityWindowMinutes,
  )
  context.subscriptions.push(activity)

  context.subscriptions.push(
    vscode.window.createTreeView('discordVscode.channels', { treeDataProvider: tree, dragAndDropController: tree }),
    service.onEvent((ev) => {
      if (ev.type === 'channels') {
        tree.refresh()
        activity.seed(ev.channels)
      }
    }),
  )

  const chatDeps: ChatDeps = {
    loadHistory: (id, before) => service.loadHistory(id, before),
    send: sendFromComposer,
    openRef: (ref) => openRef(ref),
    channelName: (id) => service.channelName(id),
    searchMembers: (q) => service.searchMembers(q),
  }

  const onOpened = (id: string) => {
    tree.clearUnread(id)
    activity.markRead(id)
  }
  const chat = new ChatViewProvider(context.extensionUri, chatDeps, onOpened)
  const panels = new ChatPanelManager(context.extensionUri, chatDeps)
  const docks = new DockManager(context.extensionUri, chatDeps, context.globalState, onOpened)
  context.subscriptions.push(docks)

  const currentChannelNode = (): ChannelNode | undefined => {
    const id = chat.currentChannelId
    const node = id ? service.channelsSnapshot().find((n) => n.id === id) : undefined
    if (!node) void vscode.window.showInformationMessage('No channel selected in the Discord chat view.')
    return node
  }

  const popOutCurrent = (placement?: PopOutPlacement) => {
    const node = currentChannelNode()
    if (node) void panels.popOut(node, placement ?? readConfig().popOutPlacement)
  }

  // Jump-link `chat` target (deeplink/handler.ts): resolve by ID from the live snapshot first,
  // REST-fetch fallback for anything not yet cached (e.g. an archived thread), then pop it out
  // as an editor-tab chat — visible immediately regardless of sidebar state, same as a manual
  // "Pop Out Chat" click.
  const openChannelById = async (channelId: string) => {
    let node: ChannelNode | null | undefined
    try {
      node = service.channelsSnapshot().find((n) => n.id === channelId) ?? (await service.resolveChannel(channelId))
    } catch {
      node = null // REST failure (offline, missing perms) → same not-found toast, never an unhandled rejection
    }
    if (!node) {
      void vscode.window.showWarningMessage(`Discord jump link: channel/thread not found (${channelId}).`)
      return
    }
    void panels.popOut(node, readConfig().popOutPlacement)
  }
  setChannelOpener(openChannelById)
  // Opening a channel in a dock MOVES it out of the sidebar when the sidebar was
  // showing that same channel (the title-bar "Send Current Channel to …" buttons
  // always are); docking some other channel from the tree leaves the sidebar alone.
  const openInDock = async (dock: DockId, node: ChannelNode) => {
    tree.clearUnread(node.id)
    activity.markRead(node.id)
    const wasInSidebar = chat.currentChannelId === node.id
    await docks.open(dock, { id: node.id, name: node.name })
    if (wasInSidebar) await chat.clear()
  }
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    panels,
    service.onEvent((ev) => {
      chat.handleServiceEvent(ev)
      panels.handleServiceEvent(ev)
      docks.handleServiceEvent(ev)
      if (
        ev.type === 'message' &&
        ev.message.channelId !== chat.currentChannelId &&
        !panels.isOpen(ev.message.channelId) &&
        !docks.isBound(ev.message.channelId)
      )
        tree.markUnread(ev.message.channelId)
      if (ev.type === 'message') {
        const cfg = readConfig()
        const watched = new Set([
          ...(chat.currentChannelId ? [chat.currentChannelId] : []),
          ...panels.openChannelIds(),
          ...docks.boundIds(),
        ])
        const ctx = {
          silenced: new Set(cfg.silencedChannels),
          watched,
          ownHookIds: webhookSender.knownHookIds(),
          personaName: webhookSender.lastPersonaName() ?? '',
        }
        if (!ctx.silenced.has(ev.message.channelId)) {
          const mentionsMe = !!cfg.userId && (ev.message.mentions ?? []).some((x) => x.id === cfg.userId)
          activity.applyMessage(ev.message, { track: shouldTrack(ev.message, ctx), mentionsMe })
        }
      }
    }),
    vscode.commands.registerCommand('discordVscode.openChannel', async (node: ChannelNode) => {
      tree.clearUnread(node.id)
      activity.markRead(node.id)
      await chat.openChannel(node)
    }),
    vscode.commands.registerCommand('discordVscode.popOutChannel', (node: ChannelNode) => {
      tree.clearUnread(node.id)
      activity.markRead(node.id)
      void panels.popOut(node, readConfig().popOutPlacement)
    }),
    vscode.commands.registerCommand('discordVscode.popOutCurrent', () => popOutCurrent()),
    vscode.commands.registerCommand('discordVscode.popOutCurrentBeside', () => popOutCurrent('beside')),
    vscode.commands.registerCommand('discordVscode.popOutCurrentBelow', () => popOutCurrent('below')),
    vscode.commands.registerCommand('discordVscode.openVoiceChannel', (node: ChannelNode) => {
      void vscode.env.openExternal(vscode.Uri.parse(`https://discord.com/channels/${service.guildId}/${node.id}`))
    }),
    vscode.commands.registerCommand('discordVscode.openInBottomDock', (node: ChannelNode) => openInDock('bottom', node)),
    vscode.commands.registerCommand('discordVscode.openInRightDock', (node: ChannelNode) => openInDock('right', node)),
    vscode.commands.registerCommand('discordVscode.sendCurrentToBottomDock', () => {
      const node = currentChannelNode()
      if (node) void vscode.commands.executeCommand('discordVscode.openInBottomDock', node)
    }),
    vscode.commands.registerCommand('discordVscode.sendCurrentToRightDock', () => {
      const node = currentChannelNode()
      if (node) void vscode.commands.executeCommand('discordVscode.openInRightDock', node)
    }),
    vscode.commands.registerCommand('discordVscode.pinChannel', async (node: ChannelNode) => {
      const cfg = vscode.workspace.getConfiguration('discordVscode')
      const pins = cfg.get<string[]>('pinnedChannels', [])
      if (!pins.includes(node.id)) await cfg.update('pinnedChannels', [...pins, node.id], vscode.ConfigurationTarget.Global)
      tree.refresh()
    }),
    vscode.commands.registerCommand('discordVscode.unpinChannel', async (node: ChannelNode) => {
      const cfg = vscode.workspace.getConfiguration('discordVscode')
      await cfg.update('pinnedChannels', cfg.get<string[]>('pinnedChannels', []).filter((id) => id !== node.id), vscode.ConfigurationTarget.Global)
      tree.refresh()
    }),
    vscode.commands.registerCommand('discordVscode.silenceChannel', async (node: ChannelNode) => {
      const cfg = vscode.workspace.getConfiguration('discordVscode')
      const ids = cfg.get<string[]>('silencedChannels', [])
      if (!ids.includes(node.id)) await cfg.update('silencedChannels', [...ids, node.id], vscode.ConfigurationTarget.Global)
      activity.remove(node.id)
      tree.refresh()
    }),
    vscode.commands.registerCommand('discordVscode.unsilenceChannel', async (node: ChannelNode) => {
      const cfg = vscode.workspace.getConfiguration('discordVscode')
      await cfg.update('silencedChannels', cfg.get<string[]>('silencedChannels', []).filter((id) => id !== node.id), vscode.ConfigurationTarget.Global)
      tree.refresh()
    }),
    vscode.commands.registerCommand('discordVscode.clearSidebarChat', () => chat.clear()),
    vscode.commands.registerCommand('discordVscode.openFromActivity', async (channelId: string) => {
      const node = service.channelsSnapshot().find((n) => n.id === channelId)
      activity.markRead(channelId)
      tree.clearUnread(channelId)
      if (node) await chat.openChannel(node)
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('discordVscode')) {
        tree.refresh()
        activity.refreshView()
      }
    }),
  )
  context.subscriptions.push(
    registerShareCommand({
      cfg: () => readConfig(),
      currentChannelId: () => chat.currentChannelId,
      sendToChannel,
    }),
  )

  let connecting = false
  async function connect() {
    if (connecting) return
    connecting = true
    try {
      let token = demo ? 'demo' : await getToken(context.secrets)
      if (!token) token = await promptAndStoreToken(context.secrets)
      if (!token) return
      // A (re)connect spins up a new client generation — drop any cached webhooks from
      // the previous one so stale entries can't be reused against a dead connection.
      webhookSender.clear()
      await service.start(token, readConfig().guildId)
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      const code = (e as { code?: string }).code
      if (/intent/i.test(msg) || code === 'DisallowedIntents') {
        void vscode.window
          .showErrorMessage(
            'Discord rejected the connection: enable "Message Content Intent" for your bot.',
            'Open Developer Portal',
          )
          .then((pick) => {
            if (pick) void vscode.env.openExternal(vscode.Uri.parse('https://discord.com/developers/applications'))
          })
      } else {
        // Post-login failures (multi-guild ambiguity, channel-fetch errors, etc.) never
        // get a status event from the service, so the status bar would otherwise strand
        // on the connecting spinner. Only auth-ish failures get the (potentially
        // misleading) "Set Token" action.
        statusBar.set('off')
        if (/token/i.test(msg) || code === 'TokenInvalid') {
          void vscode.window.showErrorMessage(`Discord connect failed: ${msg}`, 'Set Token').then((pick) => {
            if (pick === 'Set Token') void vscode.commands.executeCommand('discordVscode.setToken')
          })
        } else {
          void vscode.window.showErrorMessage(`Discord connect failed: ${msg}`)
        }
      }
    } finally {
      connecting = false
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('discordVscode.setToken', async () => {
      await promptAndStoreToken(context.secrets)
      await connect()
    }),
    vscode.commands.registerCommand('discordVscode.reconnect', connect),
    registerWorktreeAction(),
  )
  void connect()
}

export function deactivate() {}
