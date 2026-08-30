/** Turns a history-load failure into a banner the user can act on. discord.js
 *  throws DiscordAPIError with a numeric `code` (discord-api-types
 *  RESTJSONErrorCodes); anything else falls back to the raw message. */
const FIX_PERMS =
  'Fix in Discord: right-click the channel (or its category) → Edit Channel → Permissions → ' +
  'add the bot\'s role with View Channel and Read Message History.'

export function describeHistoryError(e: unknown): string {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  switch (code) {
    case 50001: // Missing Access
      return `The bot can't see this channel or thread (Missing Access). ${FIX_PERMS} For a private thread, add the bot to the thread (@mention it there).`
    case 50013: // Missing Permissions
      return `The bot lacks permission to read here (Missing Permissions). ${FIX_PERMS}`
    case 10003: // Unknown Channel
      return 'This channel or thread no longer exists on Discord.'
    default:
      return `history load failed: ${e instanceof Error ? e.message : String(e)}`
  }
}
