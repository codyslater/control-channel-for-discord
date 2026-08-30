export interface SlashCommand {
  name: string
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'loc', description: 'Share your current location (file:line, branch) in this channel' },
  { name: 'snippet', description: 'Send the current editor selection as a code block with its file:line ref' },
  { name: 'diff', description: 'Post a summary of your working-tree changes (git diff --stat)' },
  { name: 'thread', description: 'Create a new thread in this channel and switch to it' },
]

export type ParsedInput =
  | { kind: 'command'; command: string; rest: string }
  | { kind: 'text'; text: string }

/** Interprets composer input. `//…` escapes to a literal message starting with `/`;
 *  a leading known `/command` (case-insensitive, whole word) is intercepted;
 *  anything else — unknown commands, leading whitespace — passes through unchanged. */
export function parseSlashInput(raw: string, known: string[] = SLASH_COMMANDS.map((c) => c.name)): ParsedInput {
  if (raw.startsWith('//')) return { kind: 'text', text: raw.slice(1) }
  const m = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(raw)
  if (m) {
    const name = m[1].toLowerCase()
    if (known.includes(name)) return { kind: 'command', command: name, rest: (m[2] ?? '').trim() }
  }
  return { kind: 'text', text: raw }
}

/** Joins user text with the 📍 location line for /loc sends. */
export function composeLocationMessage(rest: string, locationText: string): string {
  return rest ? `${rest}\n${locationText}` : locationText
}

/** Commands to suggest for the current composer value, or null when the popup
 *  should be closed. Open only while typing the first word of a single-`/` input. */
export function filterCommands(value: string, commands: SlashCommand[] = SLASH_COMMANDS): SlashCommand[] | null {
  const m = /^\/([A-Za-z0-9]*)$/.exec(value)
  if (!m) return null
  const prefix = m[1].toLowerCase()
  const hits = commands.filter((c) => c.name.startsWith(prefix))
  return hits.length ? hits : null
}
