import { describe, expect, it, test, vi } from 'vitest'
import { DEFAULT_SEND, HOOK_NAME, HookLike, SendTarget, SILENT, WebhookSender, toSendTarget } from './webhooks'

function hook(over: Partial<HookLike> = {}): HookLike {
  return { name: HOOK_NAME, token: 't', send: vi.fn(async () => ({})), ...over }
}
function target(hooks: HookLike[], created?: HookLike, threadId?: string): SendTarget & { createWebhook: ReturnType<typeof vi.fn> } {
  const createWebhook = vi.fn(async () => created ?? hook())
  return {
    channel: { id: 'c1', fetchWebhooks: async () => ({ values: () => hooks }), createWebhook },
    threadId,
    fallback: vi.fn(async () => ({})),
    createWebhook,
  } as never
}
const sender = () => new WebhookSender(async () => ({ username: 'dev', avatarURL: 'https://cdn/dev.png' }))

describe('WebhookSender', () => {
  test('reuses existing named hook with token; passes persona and threadId', async () => {
    const h = hook()
    const t = target([hook({ name: 'other' }), h], undefined, 'th1')
    expect(await sender().send(t, 'hi')).toBe('sent')
    expect(h.send).toHaveBeenCalledWith({
      content: 'hi', username: 'dev', avatarURL: 'https://cdn/dev.png', threadId: 'th1',
      flags: SILENT, allowedMentions: { users: [], parse: [] },
    })
    expect(t.createWebhook).not.toHaveBeenCalled()
  })
  test('ignores tokenless hooks and creates one', async () => {
    const created = hook()
    const t = target([hook({ token: null })], created)
    expect(await sender().send(t, 'hi')).toBe('sent')
    expect(t.createWebhook).toHaveBeenCalledWith({ name: HOOK_NAME })
    expect(created.send).toHaveBeenCalled()
  })
  test('caches per channel across sends', async () => {
    const t = target([hook()])
    const s = sender()
    await s.send(t, 'a')
    await s.send(t, 'b')
    expect(t.createWebhook).not.toHaveBeenCalled()
    // fetchWebhooks hit only once: second send uses cache
  })
  test('missing-permission error falls back to bot send', async () => {
    const t = target([])
    t.createWebhook.mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }))
    expect(await sender().send(t, 'hi')).toBe('sent-as-bot')
    expect(t.fallback).toHaveBeenCalledWith('hi', DEFAULT_SEND)
  })
})

describe('WebhookSender cache eviction', () => {
  test('a failed send evicts the cache entry; the next send re-resolves via fetchWebhooks', async () => {
    const badHook = hook({
      send: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const goodHook = hook()
    const fetchWebhooks = vi
      .fn()
      .mockResolvedValueOnce({ values: () => [badHook] })
      .mockResolvedValueOnce({ values: () => [goodHook] })
    const createWebhook = vi.fn(async () => hook())
    const t: SendTarget = {
      channel: { id: 'c1', fetchWebhooks, createWebhook },
      fallback: vi.fn(async () => ({})),
    }
    const s = sender()

    await expect(s.send(t, 'a')).rejects.toThrow('boom')
    expect(fetchWebhooks).toHaveBeenCalledTimes(1)

    await expect(s.send(t, 'b')).resolves.toBe('sent')
    expect(fetchWebhooks).toHaveBeenCalledTimes(2)
    expect(goodHook.send).toHaveBeenCalledTimes(1)
  })

  test('Unknown Webhook (10015) retries exactly once: evicts, re-resolves, re-sends', async () => {
    const staleHook = hook({
      send: vi.fn(async () => {
        throw Object.assign(new Error('Unknown Webhook'), { code: 10015 })
      }),
    })
    const freshHook = hook()
    const fetchWebhooks = vi
      .fn()
      .mockResolvedValueOnce({ values: () => [staleHook] })
      .mockResolvedValueOnce({ values: () => [freshHook] })
    const createWebhook = vi.fn(async () => hook())
    const t: SendTarget = {
      channel: { id: 'c1', fetchWebhooks, createWebhook },
      fallback: vi.fn(async () => ({})),
    }

    const result = await sender().send(t, 'hi')

    expect(result).toBe('sent')
    expect(staleHook.send).toHaveBeenCalledTimes(1)
    expect(freshHook.send).toHaveBeenCalledTimes(1)
    expect(fetchWebhooks).toHaveBeenCalledTimes(2)
    expect(createWebhook).not.toHaveBeenCalled()
  })

  test('clear() empties the cache so the next send re-resolves', async () => {
    const h = hook()
    const fetchWebhooks = vi.fn(async () => ({ values: () => [h] }))
    const t: SendTarget = {
      channel: { id: 'c1', fetchWebhooks, createWebhook: vi.fn(async () => hook()) },
      fallback: vi.fn(async () => ({})),
    }
    const s = sender()

    await s.send(t, 'a')
    await s.send(t, 'b')
    expect(fetchWebhooks).toHaveBeenCalledTimes(1)

    s.clear()
    await s.send(t, 'c')
    expect(fetchWebhooks).toHaveBeenCalledTimes(2)
  })
})

describe('toSendTarget: non-webhook-capable channels degrade to bot identity', () => {
  test('thread under a forum/media parent (no fetchWebhooks/createWebhook) sends via fallback, never touches parent as a webhook channel', async () => {
    // ForumChannel/MediaChannel parents expose neither fetchWebhooks nor createWebhook.
    const parent = { id: 'forum1', name: 'general-forum' }
    const send = vi.fn(async () => ({ id: 'msg1' }))
    const thread = { id: 'th1', isThread: () => true, parent, send }

    const t = toSendTarget(thread)
    const result = await sender().send(t, 'hi from forum thread')

    expect(send).toHaveBeenCalledWith({ content: 'hi from forum thread', flags: SILENT, allowedMentions: { users: [], parse: [] } })
    expect(result).toBe('sent-as-bot-unsupported')
    // The parent never had fetchWebhooks in the first place; reaching this line without
    // throwing a TypeError proves the sender never attempted to call it.
    expect((parent as { fetchWebhooks?: unknown }).fetchWebhooks).toBeUndefined()
  })

  test('thread with a null parent (uncached/deleted) sends via fallback instead of using the thread itself as the webhook channel', async () => {
    const send = vi.fn(async () => ({ id: 'msg2' }))
    const thread = { id: 'th2', isThread: () => true, parent: null, send }

    const t = toSendTarget(thread)
    const result = await sender().send(t, 'hi from orphaned thread')

    expect(send).toHaveBeenCalledWith({ content: 'hi from orphaned thread', flags: SILENT, allowedMentions: { users: [], parse: [] } })
    expect(result).toBe('sent-as-bot-unsupported')
  })
})

describe('silent sends', () => {
  it('webhook sends carry the SUPPRESS_NOTIFICATIONS flag', async () => {
    const sent: { flags?: number }[] = []
    const hook = { name: HOOK_NAME, token: 't', send: async (o: { flags?: number }) => void sent.push(o) }
    const channel = {
      id: 'c1',
      fetchWebhooks: async () => new Map([['h', hook]]),
      createWebhook: async () => hook,
    }
    const sender = new WebhookSender(async () => ({ username: 'me' }))
    const result = await sender.send({ channel, fallback: async () => undefined }, 'hi')
    expect(result).toBe('sent')
    expect(sent[0].flags).toBe(SILENT)
  })

  it('bot fallback carries the SUPPRESS_NOTIFICATIONS flag', async () => {
    const calls: unknown[] = []
    const raw = { id: 'c1', isThread: () => false, send: async (o: unknown) => void calls.push(o) }
    const target = toSendTarget(raw)
    const result = await new WebhookSender(async () => ({ username: 'me' })).send(target, 'hi')
    expect(result).toBe('sent-as-bot-unsupported')
    expect(calls[0]).toEqual({ content: 'hi', flags: SILENT, allowedMentions: { users: [], parse: [] } })
  })
})

describe('own-post identity', () => {
  it('records resolved hook ids and the last persona name', async () => {
    const hook = { id: 'wh42', name: HOOK_NAME, token: 't', send: async () => undefined }
    const channel = { id: 'c1', fetchWebhooks: async () => new Map([['h', hook]]), createWebhook: async () => hook }
    const sender = new WebhookSender(async () => ({ username: 'Me' }))
    await sender.send({ channel, fallback: async () => undefined }, 'hi')
    expect([...sender.knownHookIds()]).toContain('wh42')
    expect(sender.lastPersonaName()).toBe('Me')
  })
  it('keeps known hook ids across clear()', async () => {
    const hook = { id: 'wh42', name: HOOK_NAME, token: 't', send: async () => undefined }
    const channel = { id: 'c1', fetchWebhooks: async () => new Map([['h', hook]]), createWebhook: async () => hook }
    const sender = new WebhookSender(async () => ({ username: 'Me' }))
    await sender.send({ channel, fallback: async () => undefined }, 'hi')
    sender.clear()
    expect([...sender.knownHookIds()]).toContain('wh42')
  })
})

describe('WebhookSender mention options', () => {
  test('bot-only mentions stay silent; picked ids are the allow-list', async () => {
    const h = hook()
    await sender().send(target([h]), 'hi <@2>', { allowedUserIds: ['2'], silent: true })
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ flags: SILENT, allowedMentions: { users: ['2'], parse: [] } }))
  })
  test('a human mention drops the silent flag', async () => {
    const h = hook()
    await sender().send(target([h]), 'hi <@9>', { allowedUserIds: ['9'], silent: false })
    const payload = (h.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.flags).toBeUndefined()
    expect(payload.allowedMentions).toEqual({ users: ['9'], parse: [] })
  })
  test('options reach the bot fallback', async () => {
    const t = target([])
    t.createWebhook.mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }))
    const opts = { allowedUserIds: ['9'], silent: false }
    await sender().send(t, 'hi <@9>', opts)
    expect(t.fallback).toHaveBeenCalledWith('hi <@9>', opts)
  })
})

describe('toSendTarget fallback payload', () => {
  test('applies flags and allowedMentions to ch.send', async () => {
    const send = vi.fn(async () => ({}))
    const t = toSendTarget({ id: 'c9', send })
    await t.fallback('x', { allowedUserIds: ['1'], silent: false })
    expect(send).toHaveBeenCalledWith({ content: 'x', allowedMentions: { users: ['1'], parse: [] } })
    await t.fallback('y')
    expect(send).toHaveBeenLastCalledWith({ content: 'y', flags: SILENT, allowedMentions: { users: [], parse: [] } })
  })
})
