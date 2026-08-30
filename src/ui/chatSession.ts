import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { HostEvent, WebviewEvent } from '../shared/chatProtocol'
import { Ref } from '../shared/refs'
import { SLASH_COMMANDS } from '../shared/slashCommands'
import { ChatMessage, Mentionable, MentionSend } from '../shared/types'
import { describeHistoryError } from '../shared/historyError'
import { ServiceEvent } from '../discord/service'

export interface ChatDeps {
  loadHistory(channelId: string, before?: string): Promise<ChatMessage[]>
  send(
    channelId: string, text: string, open: (id: string, name: string) => Promise<void>, mentions: MentionSend[],
  ): Promise<void>
  openRef(ref: Ref): Promise<void>
  channelName(id: string): string
  /** Members matching a composer `@query`; resolves to [] on any failure. */
  searchMembers(query: string): Promise<Mentionable[]>
}

export class ChatSession {
  private currentChannelId: string | null = null
  private currentChannelName = ''

  constructor(
    private webview: vscode.Webview,
    private deps: ChatDeps,
    private opts: {
      onDropChannel?: (id: string, name: string) => void
      onChannelSwitched?: (id: string, name: string) => void
    } = {},
  ) {
    webview.onDidReceiveMessage((ev: WebviewEvent) => void this.onWebviewEvent(ev))
  }

  get channelId(): string | null {
    return this.currentChannelId
  }

  private post(ev: HostEvent) {
    void this.webview.postMessage(ev)
  }

  /** Loads history; a failure becomes a user-facing notice instead of a rejected promise. */
  private async loadHistorySafe(
    channelId: string, before?: string,
  ): Promise<{ messages: ChatMessage[] } | { notice: string }> {
    try {
      return { messages: await this.deps.loadHistory(channelId, before) }
    } catch (e) {
      return { notice: describeHistoryError(e) }
    }
  }

  /** Always resets the webview to the new channel — even when history can't be
   *  read — so the previous channel's messages never linger under a switch
   *  the host has already made; the failure follows as a notice. */
  private async showChannel(id: string, name: string): Promise<void> {
    const r = await this.loadHistorySafe(id)
    this.post({ type: 'reset', channelId: id, channelName: name, messages: 'messages' in r ? r.messages : [] })
    if ('notice' in r) this.post({ type: 'notice', text: r.notice })
  }

  async setChannel(id: string, name: string): Promise<void> {
    this.currentChannelId = id
    this.currentChannelName = name
    await this.showChannel(id, name)
    this.opts.onChannelSwitched?.(id, name)
  }

  /** Drop the current channel and blank the webview (the chat moved elsewhere). */
  clear(): void {
    this.currentChannelId = null
    this.currentChannelName = ''
    this.post({ type: 'clear' })
  }

  handleServiceEvent(ev: ServiceEvent) {
    if (ev.type === 'message' && ev.message.channelId === this.currentChannelId)
      this.post({ type: 'append', message: ev.message })
    else if (ev.type === 'messageUpdate' && ev.message.channelId === this.currentChannelId)
      this.post({ type: 'update', message: ev.message })
    else if (ev.type === 'messageDelete' && ev.channelId === this.currentChannelId)
      this.post({ type: 'delete', id: ev.id })
    else if (ev.type === 'status') this.post({ type: 'status', text: ev.status })
  }

  private async onWebviewEvent(ev: WebviewEvent) {
    switch (ev.type) {
      case 'ready':
        this.post({ type: 'commands', commands: SLASH_COMMANDS })
        if (this.currentChannelId) await this.showChannel(this.currentChannelId, this.currentChannelName)
        break
      case 'send':
        if (this.currentChannelId) {
          try {
            await this.deps.send(this.currentChannelId, ev.text, (id, name) => this.setChannel(id, name), ev.mentions ?? [])
          } catch (e) {
            void vscode.window.showErrorMessage(`Send failed: ${(e as Error).message}`)
          }
        }
        break
      case 'openRef':
        await this.deps.openRef(ev.ref)
        break
      case 'openExternal':
        if (/^https?:\/\//.test(ev.url)) void vscode.env.openExternal(vscode.Uri.parse(ev.url))
        break
      case 'loadOlder':
        if (this.currentChannelId) {
          const r = await this.loadHistorySafe(this.currentChannelId, ev.beforeId)
          this.post('messages' in r ? { type: 'history', messages: r.messages } : { type: 'notice', text: r.notice })
        }
        break
      case 'memberQuery': {
        let items: Mentionable[] = []
        try {
          items = await this.deps.searchMembers(ev.query)
        } catch {
          // offline/throttled: the popup just shows nothing
        }
        this.post({ type: 'members', seq: ev.seq, items })
        break
      }
      case 'dropChannel':
        this.opts.onDropChannel?.(ev.id, ev.name)
        break
    }
  }
}

export function chatHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const js = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'))
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.css'))
  const nonce = randomBytes(16).toString('base64url')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://cdn.discordapp.com https://media.discordapp.net data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; form-action 'none';">
<link rel="stylesheet" href="${css}"></head>
<body>
<div id="header"></div><div id="status"></div>
<div id="messages"></div>
<div id="composer"><div id="slash-popup" hidden></div><textarea id="input" rows="2" placeholder="Message… (Enter to send, Shift+Enter for newline)"></textarea></div>
<script nonce="${nonce}" src="${js}"></script>
</body></html>`
}
