/**
 * WebSocketBridge.ts
 *
 * Central WebSocket event and command hub.
 * Provides: ws.broadcast(), ws.registerCommand(), and initWebSocketBridge().
 */

import { WebSocket, WebSocketServer } from 'ws'
import LogController from '../Log/Controller.js'

export class WebSocketBridge {
	readonly #logger = LogController.createLogger('Service/WebSocketBridge')
	readonly #clients = new Set<WebSocket>()
	readonly #commands = new Map<string, (msg: any, socket: WebSocket) => Promise<any> | any>()
	#server: WebSocketServer | undefined

	start(port = 16621): void {
		if (this.#server) return

		this.#server = new WebSocketServer({ port })
		this.#logger.info(`WebSocketBridge listening on port ${port}`)

		this.#server.on('connection', (ws) => {
			this.#clients.add(ws)
			this.#logger.debug(`Client connected (${this.#clients.size} total)`)

			ws.on('close', () => {
				this.#clients.delete(ws)
				this.#logger.debug(`Client disconnected (${this.#clients.size} remaining)`)
			})

			ws.on('message', (raw) => void this.#dispatchMessage(ws, raw))
		})
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	broadcast(event: string, payload: any): void {
		if (this.#clients.size === 0) return
		const msg = JSON.stringify({ event, payload })
		for (const ws of this.#clients) if (ws.readyState === WebSocket.OPEN) ws.send(msg)
	}

	registerCommand(name: string, handler: (msg: any, socket: WebSocket) => Promise<any> | any): void {
		this.#commands.set(name, handler)
		this.#logger.debug(`Registered command: ${name}`)
	}

	async #dispatchMessage(socket: WebSocket, raw: any): Promise<void> {
		try {
			const msg = JSON.parse(raw.toString())
			const handler = this.#commands.get(msg.method)
			if (!handler) {
				socket.send(JSON.stringify({ id: msg.id, error: `Unknown method: ${msg.method}` }))
				return
			}

			const result = await handler(msg, socket)
			if (msg.id !== undefined)
				await new Promise<void>((resolve, reject) =>
					socket.send(JSON.stringify({ id: msg.id, result }), (err) => (err ? reject(err) : resolve()))
				)
		} catch (e: any) {
			this.#logger.error('Invalid WS message:', e)
			socket.send(JSON.stringify({ error: e.message ?? String(e) }))
		}
	}
}

// ============================================================================
// Singleton Wrapper with Queued Command Registration
// ============================================================================

let bridge: WebSocketBridge | undefined
const commandQueue: { name: string; fn: any }[] = []

export const ws = {
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	broadcast(event: string, payload: any): void {
		bridge?.broadcast(event, payload)
	},

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	registerCommand(name: string, fn: any): void {
		if (bridge) {
			bridge.registerCommand(name, fn)
		} else {
			// queue until the bridge is ready
			commandQueue.push({ name, fn })
		}
	},

	/** Optional helper if direct access is needed */
	get instance(): WebSocketBridge {
		if (!bridge) throw new Error('WebSocketBridge not initialized')
		return bridge
	},
}

// ============================================================================
// Helpers
// ============================================================================

ws.registerCommand('ping', async (msg: any) => {
	return { pong: msg.params ?? {} }
})

/** Create and start the real bridge */
export function initWebSocketBridge(port = 16621): WebSocketBridge {
	if (process.env.VITEST) {
		bridge = bridge ?? new WebSocketBridge()
		return bridge
	}

	bridge = new WebSocketBridge()
	bridge.start(port)

	// flush queued commands
	if (commandQueue.length) {
		for (const { name, fn } of commandQueue) bridge.registerCommand(name, fn)
		commandQueue.length = 0
	}

	return bridge
}
