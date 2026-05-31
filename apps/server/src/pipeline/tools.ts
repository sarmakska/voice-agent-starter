import type { ToolDefinition } from '../adapters/llm/registry.js'

/**
 * Function-call passthrough.
 *
 * A Tool is a server-side function the LLM may invoke mid-turn. The orchestrator
 * advertises the registered tools to the model, and when the model emits a tool
 * call the orchestrator executes the matching handler and feeds the result back
 * so the model can continue the turn with grounded data.
 *
 * Handlers receive the already-parsed arguments object and return a string that
 * is sent back to the model as the tool result. Throwing is fine: the error
 * message is returned to the model rather than crashing the session.
 */
export interface Tool {
  definition: ToolDefinition
  handler: (args: Record<string, unknown>) => Promise<string> | string
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): this {
    this.tools.set(tool.definition.name, tool)
    return this
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  async execute(name: string, rawArgs: string): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) return `Unknown tool: ${name}`
    let args: Record<string, unknown>
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {}
    } catch {
      return `Invalid arguments for ${name}: not valid JSON.`
    }
    try {
      return await tool.handler(args)
    } catch (err) {
      return `Tool ${name} failed: ${(err as Error).message}`
    }
  }
}

/**
 * The default tool set. These are deliberately self-contained so the starter
 * runs without external integrations; swap them for your own domain functions.
 */
export function defaultTools(): ToolRegistry {
  return new ToolRegistry()
    .register({
      definition: {
        name: 'get_time',
        description: 'Return the current server time as an ISO 8601 string.',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'IANA timezone, for example Europe/London. Defaults to UTC.',
            },
          },
        },
      },
      handler: (args) => {
        const tz = typeof args.timezone === 'string' ? args.timezone : 'UTC'
        try {
          return new Date().toLocaleString('en-GB', { timeZone: tz })
        } catch {
          return new Date().toISOString()
        }
      },
    })
    .register({
      definition: {
        name: 'add_numbers',
        description: 'Add a list of numbers and return the sum.',
        parameters: {
          type: 'object',
          properties: {
            numbers: { type: 'array', items: { type: 'number' } },
          },
          required: ['numbers'],
        },
      },
      handler: (args) => {
        const nums = Array.isArray(args.numbers) ? (args.numbers as number[]) : []
        const sum = nums.reduce((a, b) => a + Number(b || 0), 0)
        return String(sum)
      },
    })
}
