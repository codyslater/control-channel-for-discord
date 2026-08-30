import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { marked } from 'marked'
import { HostEvent, WebviewEvent } from '../shared/chatProtocol'
import { ChatState, initialState, reduce } from '../shared/chatState'
import { dayLabel, isContinuation, needsDayDivider } from '../shared/grouping'
import { extractRefs } from '../shared/refs'
import { filterCommands, SlashCommand } from '../shared/slashCommands'
import { mentionQueryAtCaret, serializeMentions, splitMentions } from '../shared/mentions'
import { ChatMessage, Mentionable, MentionRef } from '../shared/types'

declare function acquireVsCodeApi(): { postMessage(ev: WebviewEvent): void }
const vscode = acquireVsCodeApi()

let state: ChatState = initialState
const $ = (id: string) => document.getElementById(id)!

function renderMarkdown(content: string, mentions: MentionRef[]): HTMLElement {
  const div = document.createElement('div')
  div.className = 'md'
  div.innerHTML = DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true, gfm: true }) as string, {
    FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea', 'option', 'label', 'fieldset'],
  })
  div.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el as HTMLElement))
  annotate(div)
  annotateMentions(div, mentions)
  return div
}

/** Wrap `<@id>` / `<@!id>` / `<@&id>` in text nodes as @name chips. marked escapes
 *  these tokens (not valid HTML) so they survive to here as text; code and links
 *  are left alone. */
function annotateMentions(root: HTMLElement, mentions: MentionRef[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('a, code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const parts = splitMentions(node.textContent ?? '', mentions)
    if (parts.length === 1 && typeof parts[0] === 'string') continue
    const frag = document.createDocumentFragment()
    for (const p of parts) {
      if (typeof p === 'string') frag.append(p)
      else {
        const span = document.createElement('span')
        span.className = 'mention' + (p.kind === 'role' ? ' role' : '')
        span.textContent = '@' + p.name
        span.title = p.kind === 'role' ? 'role' : p.id
        frag.append(span)
      }
    }
    node.replaceWith(frag)
  }
}

/** Walk text nodes (including inside code blocks) and wrap ref spans in anchors. */
function annotate(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const text = node.textContent ?? ''
    const spans = extractRefs(text)
    if (!spans.length) continue
    const frag = document.createDocumentFragment()
    let pos = 0
    for (const s of spans) {
      frag.append(text.slice(pos, s.start))
      const a = document.createElement('a')
      a.className = 'ref'
      a.href = '#'
      a.textContent = text.slice(s.start, s.end)
      a.dataset.ref = JSON.stringify(s.ref)
      frag.append(a)
      pos = s.end
    }
    frag.append(text.slice(pos))
    node.replaceWith(frag)
  }
}

function messageEl(m: ChatMessage, continuation: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = continuation ? 'msg grouped' : 'msg'
  el.dataset.id = m.id
  el.dataset.vscodeContext = JSON.stringify({ webviewSection: 'message', preventDefaultContextMenuItems: false })
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const body = document.createElement('div')
  body.className = 'body'
  if (continuation) {
    const t = document.createElement('span')
    t.className = 'gutter-time'
    t.textContent = time
    el.append(t)
  } else {
    if (m.authorAvatarUrl) {
      const img = document.createElement('img')
      img.className = 'avatar'
      img.src = m.authorAvatarUrl
      el.append(img)
    } else {
      const ph = document.createElement('span')
      ph.className = 'avatar placeholder'
      el.append(ph)
    }
    const head = document.createElement('div')
    head.className = 'head'
    const app = m.isApp ? '<span class="badge">APP</span>' : ''
    const edited = m.editedAt ? '<span class="edited">(edited)</span>' : ''
    head.innerHTML = `<span class="author"></span>${app}<span class="time">${time}</span>${edited}`
    head.querySelector('.author')!.textContent = m.authorName
    body.append(head)
  }
  body.append(renderMarkdown(m.content, m.mentions ?? []))
  if (continuation && m.editedAt) {
    const edited = document.createElement('span')
    edited.className = 'edited'
    edited.textContent = '(edited)'
    body.append(edited)
  }
  for (const a of m.attachments) {
    if (a.isImage) {
      const img = document.createElement('img')
      img.className = 'attachment'
      img.src = a.url
      body.append(img)
    } else {
      const link = document.createElement('a')
      link.href = a.url
      link.textContent = `📎 ${a.filename}`
      body.append(link)
    }
  }
  el.append(body)
  return el
}

function dividerEl(ts: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'divider'
  const label = document.createElement('span')
  label.textContent = dayLabel(ts)
  el.append(label)
  return el
}

function render() {
  $('header').textContent = state.channelName ? `# ${state.channelName}` : 'Select a channel'
  const conn = state.status === 'connected' || state.status === '' ? '' : state.status
  const banner = state.notice || conn
  $('status').textContent = banner ? `⚠ ${banner}` : ''
  const box = $('messages')
  const stickToBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40
  const els: HTMLElement[] = []
  state.messages.forEach((m, i) => {
    const prev = state.messages[i - 1]
    if (needsDayDivider(prev, m)) els.push(dividerEl(m.createdAt))
    els.push(messageEl(m, isContinuation(prev, m)))
  })
  box.replaceChildren(...els)
  if (stickToBottom) box.scrollTop = box.scrollHeight
}

let commands: SlashCommand[] = []

window.addEventListener('message', (e: MessageEvent<HostEvent>) => {
  if (e.data.type === 'commands') { commands = e.data.commands; return }
  if (e.data.type === 'members') {
    if (e.data.seq === memberSeq && popupMode === 'member' && mentionQuery) {
      memberItems = e.data.items
      popupIndex = 0
      renderPopup()
    }
    return
  }
  const prevFirst = state.messages[0]?.id
  state = reduce(state, e.data)
  render()
  if (e.data.type === 'history' && prevFirst) {
    document.querySelector(`[data-id="${prevFirst}"]`)?.scrollIntoView()
  }
})

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  const ref = t.closest('a.ref') as HTMLElement | null
  if (ref?.dataset.ref) {
    e.preventDefault()
    vscode.postMessage({ type: 'openRef', ref: JSON.parse(ref.dataset.ref) })
    return
  }
  const a = t.closest('a') as HTMLAnchorElement | null
  if (a?.href.startsWith('http')) {
    e.preventDefault()
    vscode.postMessage({ type: 'openExternal', url: a.href })
  }
})

$('messages').addEventListener('scroll', () => {
  if ($('messages').scrollTop === 0 && state.messages.length) {
    vscode.postMessage({ type: 'loadOlder', beforeId: state.messages[0].id })
  }
})

const input = $('input') as HTMLTextAreaElement

const popup = $('slash-popup')
let popupMode: 'slash' | 'member' = 'slash'
let popupItems: SlashCommand[] = []
let memberItems: Mentionable[] = []
let popupIndex = 0
/** The `@query` the caret is in while the member popup is open. */
let mentionQuery: { start: number; query: string } | null = null
let memberSeq = 0
let memberTimer: ReturnType<typeof setTimeout> | null = null
/** Names picked from the popup this composer session → who they are. Cleared on send. */
const picked = new Map<string, Mentionable>()
const popupCount = () => (popupMode === 'slash' ? popupItems.length : memberItems.length)

function renderPopup() {
  if (!popupCount()) {
    popup.hidden = true
    return
  }
  popup.hidden = false
  const row = (i: number, label: string, desc: string, tag?: string) => {
    const el = document.createElement('div')
    el.className = 'slash-item' + (i === popupIndex ? ' selected' : '')
    el.dataset.index = String(i)
    const name = document.createElement('span')
    name.className = 'slash-name'
    name.textContent = label
    el.append(name)
    if (tag) {
      const t = document.createElement('span')
      t.className = 'member-tag'
      t.textContent = tag
      el.append(t)
    }
    const d = document.createElement('span')
    d.className = 'slash-desc'
    d.textContent = desc
    el.append(d)
    return el
  }
  popup.replaceChildren(
    ...(popupMode === 'slash'
      ? popupItems.map((c, i) => row(i, '/' + c.name, c.description))
      : memberItems.map((m, i) =>
          row(i, '@' + m.name, m.username && m.username !== m.name ? m.username : '', m.kind === 'bot' ? 'BOT' : undefined),
        )),
  )
}

function closePopup() {
  popupItems = []
  memberItems = []
  mentionQuery = null
  if (memberTimer) {
    clearTimeout(memberTimer)
    memberTimer = null
  }
  renderPopup()
}

function completeSelection() {
  if (popupMode === 'slash') {
    const c = popupItems[popupIndex]
    if (c) input.value = '/' + c.name + ' '
  } else {
    const m = memberItems[popupIndex]
    if (m && mentionQuery) {
      const before = input.value.slice(0, mentionQuery.start)
      const after = input.value.slice(input.selectionStart)
      input.value = `${before}@${m.name} ${after}`
      const caret = before.length + m.name.length + 2
      input.setSelectionRange(caret, caret)
      picked.set(m.name, m)
    }
  }
  closePopup()
  input.focus()
}

input.addEventListener('input', () => {
  popupIndex = 0
  const slash = filterCommands(input.value, commands)
  if (slash) {
    popupMode = 'slash'
    popupItems = slash
    memberItems = []
    renderPopup()
    return
  }
  popupItems = []
  const q = mentionQueryAtCaret(input.value, input.selectionStart)
  if (!q) {
    closePopup()
    return
  }
  popupMode = 'member'
  mentionQuery = q
  if (memberTimer) clearTimeout(memberTimer)
  memberTimer = setTimeout(() => {
    memberTimer = null
    vscode.postMessage({ type: 'memberQuery', query: q.query, seq: ++memberSeq })
  }, 150)
})

popup.addEventListener('mousedown', (e) => {
  const row = (e.target as HTMLElement).closest('.slash-item') as HTMLElement | null
  if (row) {
    e.preventDefault()
    popupIndex = Number(row.dataset.index)
    completeSelection()
  }
})

input.addEventListener('keydown', (e) => {
  if (!popup.hidden && popupCount()) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      popupIndex = (popupIndex + 1) % popupCount()
      renderPopup()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      popupIndex = (popupIndex + popupCount() - 1) % popupCount()
      renderPopup()
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      completeSelection()
      return
    }
    if (e.key === 'Escape') {
      closePopup()
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    const text = input.value.trim()
    if (text) {
      const { content, mentions } = serializeMentions(text, picked)
      vscode.postMessage({ type: 'send', text: content, mentions })
      picked.clear()
      input.value = ''
      closePopup()
    }
  }
})

const DROP_MIME = 'application/x-discord-vscode-channel'
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const raw = e.dataTransfer?.getData(DROP_MIME) || e.dataTransfer?.getData('text/plain')
  if (!raw) return
  try {
    const d = JSON.parse(raw) as { id?: string; name?: string; kind?: string }
    if (d.id && d.name && (d.kind === 'text' || d.kind === 'thread'))
      vscode.postMessage({ type: 'dropChannel', id: d.id, name: d.name })
  } catch {
    // not a channel payload — ignore
  }
})

// Right-click: expose current selection to native context menu commands (Task 15).
document.addEventListener('contextmenu', (e) => {
  const msg = (e.target as HTMLElement).closest('.msg') as HTMLElement | null
  if (msg) {
    msg.dataset.vscodeContext = JSON.stringify({
      webviewSection: 'message',
      preventDefaultContextMenuItems: false,
      selectedText: window.getSelection()?.toString() ?? '',
    })
  }
})

vscode.postMessage({ type: 'ready' })
