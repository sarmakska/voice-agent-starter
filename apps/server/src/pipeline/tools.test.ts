import { describe, it, expect } from 'vitest'
import { ToolRegistry, defaultTools } from './tools.js'

describe('ToolRegistry', () => {
  it('executes a registered tool with parsed arguments', async () => {
    const reg = new ToolRegistry().register({
      definition: { name: 'echo', description: 'echo', parameters: { type: 'object', properties: {} } },
      handler: (args) => String(args.value),
    })
    expect(await reg.execute('echo', '{"value":"hi"}')).toBe('hi')
  })

  it('returns a message instead of throwing for an unknown tool', async () => {
    const reg = new ToolRegistry()
    expect(await reg.execute('nope', '{}')).toContain('Unknown tool')
  })

  it('returns a message for invalid JSON arguments', async () => {
    const reg = new ToolRegistry().register({
      definition: { name: 'f', description: 'd', parameters: {} },
      handler: () => 'ok',
    })
    expect(await reg.execute('f', '{not json')).toContain('Invalid arguments')
  })

  it('captures handler errors as a tool result', async () => {
    const reg = new ToolRegistry().register({
      definition: { name: 'boom', description: 'd', parameters: {} },
      handler: () => {
        throw new Error('kaboom')
      },
    })
    expect(await reg.execute('boom', '{}')).toContain('kaboom')
  })

  it('exposes definitions for advertising to the model', () => {
    const names = defaultTools().definitions().map((d) => d.name)
    expect(names).toContain('get_time')
    expect(names).toContain('add_numbers')
  })

  it('default add_numbers sums its arguments', async () => {
    expect(await defaultTools().execute('add_numbers', '{"numbers":[1,2,3]}')).toBe('6')
  })
})
