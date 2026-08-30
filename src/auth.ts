import * as vscode from 'vscode'

export const TOKEN_KEY = 'discordVscode.botToken'

export async function getToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(TOKEN_KEY)
}

export async function promptAndStoreToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const token = await vscode.window.showInputBox({
    title: 'Discord Bot Token',
    prompt: 'Paste the bot token from the Discord Developer Portal (stored in SecretStorage, this machine only)',
    password: true,
    ignoreFocusOut: true,
  })
  if (token) await secrets.store(TOKEN_KEY, token.trim())
  return token?.trim()
}

export interface Config {
  guildId: string
  userId: string
  hostName: string
  hostAliases: string[]
  hiddenChannels: string[]
  pinnedChannels: string[]
  silencedChannels: string[]
  popOutPlacement: 'beside' | 'active' | 'below'
  /** Minutes of recency a read Activity entry stays listed; 0 = no limit. */
  activityWindowMinutes: number
  /** Auto-connect tunnel deep links without a prompt (default false — untrusted producers). */
  trustTunnelLinks: boolean
}

export function readConfig(): Config {
  const c = vscode.workspace.getConfiguration('discordVscode')
  return {
    guildId: c.get('guildId', ''),
    userId: c.get('userId', ''),
    hostName: c.get('hostName', ''),
    hostAliases: c.get('hostAliases', []),
    hiddenChannels: c.get('hiddenChannels', []),
    pinnedChannels: c.get('pinnedChannels', []),
    silencedChannels: c.get('silencedChannels', []),
    popOutPlacement: c.get<Config['popOutPlacement']>('popOutPlacement', 'beside'),
    activityWindowMinutes: c.get<number>('activityWindowMinutes', 15),
    trustTunnelLinks: c.get<boolean>('trustTunnelLinks', false),
  }
}
