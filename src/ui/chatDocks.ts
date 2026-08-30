import * as vscode from 'vscode'
import { ServiceEvent } from '../discord/service'
import { ChatDeps, ChatSession, chatHtml } from './chatSession'

export type DockId = 'bottom' | 'right'
const VIEW_IDS: Record<DockId, string> = { bottom: 'discordVscode.dockBottom', right: 'discordVscode.dockRight' }
const STATE_KEY = 'discordVscode.dockBindings'

interface Binding {
  id: string
  name: string
}

/** Two statically contributed webview views, each independently bound to one
 *  channel. Bindings persist in globalState and restore on reload. */
export class DockManager {
  private live = new Map<DockId, { view: vscode.WebviewView; session: ChatSession }>()
  private disposables: vscode.Disposable[] = []

  constructor(
    private extensionUri: vscode.Uri,
    private deps: ChatDeps,
    private state: vscode.Memento,
    private onBound?: (channelId: string) => void,
  ) {
    for (const dock of ['bottom', 'right'] as const) {
      this.disposables.push(
        vscode.window.registerWebviewViewProvider(
          VIEW_IDS[dock],
          { resolveWebviewView: (view) => this.resolve(dock, view) },
          { webviewOptions: { retainContextWhenHidden: true } },
        ),
      )
    }
  }

  private bindings(): Partial<Record<DockId, Binding>> {
    return this.state.get(STATE_KEY, {})
  }

  private resolve(dock: DockId, view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] }
    view.webview.html = chatHtml(view.webview, this.extensionUri)
    const session = new ChatSession(view.webview, this.deps, {
      onDropChannel: (id, name) => void this.open(dock, { id, name }),
      onChannelSwitched: (id, name) => this.rebind(dock, { id, name }),
    })
    this.live.set(dock, { view, session })
    view.onDidDispose(() => this.live.delete(dock))
    const b = this.bindings()[dock]
    if (b) {
      view.title = `# ${b.name}`
      void session.setChannel(b.id, b.name)
    }
  }

  async open(dock: DockId, channel: Binding): Promise<void> {
    await this.state.update(STATE_KEY, { ...this.bindings(), [dock]: channel })
    this.onBound?.(channel.id)
    await vscode.commands.executeCommand(`${VIEW_IDS[dock]}.focus`)
    const live = this.live.get(dock)
    if (live) {
      live.view.title = `# ${channel.name}`
      await live.session.setChannel(channel.id, channel.name)
    }
  }

  /** Persist a session-initiated channel switch (e.g. /thread) — updates the
   *  stored binding and title without re-opening the view. */
  private rebind(dock: DockId, channel: Binding) {
    void this.state.update(STATE_KEY, { ...this.bindings(), [dock]: channel })
    const live = this.live.get(dock)
    if (live) live.view.title = `# ${channel.name}`
    this.onBound?.(channel.id)
  }

  /** Channels currently shown by a resolved dock view. A persisted binding with
   *  no live view does NOT count — suppression must die with the surface, or a
   *  never-opened dock would swallow a channel's unread/Activity signals. */
  boundIds(): string[] {
    const b = this.bindings()
    return (['bottom', 'right'] as const)
      .filter((dock) => this.live.has(dock))
      .map((dock) => b[dock]?.id)
      .filter((x): x is string => !!x)
  }

  isBound(channelId: string): boolean {
    return this.boundIds().includes(channelId)
  }

  handleServiceEvent(ev: ServiceEvent) {
    for (const { session } of this.live.values()) session.handleServiceEvent(ev)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
  }
}
