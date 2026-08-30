import * as vscode from 'vscode'

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'auth-error' | 'intent-error' | 'off'

const TEXT: Record<ConnStatus, string> = {
  connecting: '$(sync~spin) discord',
  connected: '$(check) discord',
  reconnecting: '$(warning) discord: reconnecting',
  'auth-error': '$(error) discord: token',
  'intent-error': '$(error) discord: intents',
  off: '$(circle-slash) discord',
}

export class StatusBar {
  private item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  constructor() {
    this.item.command = 'discordVscode.reconnect'
    this.set('off')
    this.item.show()
  }
  set(status: ConnStatus) {
    this.item.text = TEXT[status]
    this.item.tooltip = `Discord: ${status} — click to reconnect`
  }
  dispose() {
    this.item.dispose()
  }
}
