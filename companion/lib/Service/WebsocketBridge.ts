/**
 * WebSocketBridge.ts
 *
 * Provides an external WebSocket API for Companion.
 * Exposes variable changes, button updates, and supports query/runAction.
 *
 * Imported into HttpApi.ts, started in ServiceHttpApi constructor.
 */

import { WebSocket, WebSocketServer } from 'ws'
import type { ServiceApi } from './ServiceApi.js'
import LogController from '../Log/Controller.js'

export class WebsocketBridge {
  readonly #serviceApi: ServiceApi
  readonly #logger = LogController.createLogger('Service/WebsocketBridge')
  #wsServer: WebSocketServer | undefined = undefined

  constructor(serviceApi: ServiceApi) {
    this.#serviceApi = serviceApi
  }

  start(port = 16621): void {
    if (this.#wsServer) return

    this.#wsServer = new WebSocketServer({ port })
    this.#logger.info(`WebSocketBridge listening on port ${port}`)

    this.#wsServer.on('connection', (socket) => this.#handleConnection(socket))
  }

  #handleConnection(socket: WebSocket) {
    this.#logger.info('New WebSocket client connected')

    //
    // Event subscriptions
    //

    // Variables
    this.#serviceApi.on('variables_changed', (changedVars: Set<string>) => {
      const updates: Record<string, Record<string, any>> = {}

      for (const fullVarName of changedVars) {
        const [connectionLabel, variableName] = fullVarName.split(/:(.+)/)
        if (!connectionLabel || !variableName) continue

        const value = this.#serviceApi.getConnectionVariableValue(connectionLabel, variableName)

        if (!updates[connectionLabel]) {
          updates[connectionLabel] = {}
        }
        updates[connectionLabel][variableName] = value
      }

      socket.send(JSON.stringify({ event: 'variables_changed', payload: updates }))
    })

    // Custom variable definition changes
    this.#serviceApi.on('custom_variable_definition_changed', (...args) => {
      socket.send(
        JSON.stringify({ event: 'custom_variable_definition_changed', payload: args })
      )
    })

    // Button state changes
    this.#serviceApi.on('updateButtonState', (control, state, surface) => {
      socket.send(
        JSON.stringify({
          event: 'updateButtonState',
          payload: { control, state, surface },
        })
      )
    })

    //
    // Request/response commands
    //

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        //
        // Run a button action
        //
        if (msg.method === 'runAction') {
          const { controlId } = msg.params
          this.#serviceApi.pressControl(controlId, true, 'ws-api')
          setTimeout(() => this.#serviceApi.pressControl(controlId, false, 'ws-api'), 20)

          socket.send(JSON.stringify({ id: msg.id, result: { success: true } }))
        }

        //
        // Queries
        //
        else if (msg.method === 'query') {

          // --- Variables snapshot
          if (msg.params?.path === 'variables.values') {
            socket.send(
              JSON.stringify({ id: msg.id, result: this.#serviceApi.getAllVariableValues() })
            )
          }

          // --- Buttons snapshot
          else if (msg.params?.path === 'buttons.state') {
            const snapshot: Record<string, any> = {}

            for (let page = 1; page <= 99; page++) {
              for (let bank = 1; bank <= 32; bank++) {
                const controlId = this.#serviceApi.getControlIdAtOldBankIndex(page, bank)
                if (controlId) {
                  const control = this.#serviceApi.getControl(controlId)
                  if (control?.getDrawStyle) {
                    snapshot[controlId] = control.getDrawStyle()
                  }
                }
              }
            }

            socket.send(JSON.stringify({ id: msg.id, result: snapshot }))
          }

          // --- Unknown path
          else {
            socket.send(JSON.stringify({ id: msg.id, error: 'Unsupported query path' }))
          }
        }
      } catch (e) {
        this.#logger.error('Invalid WS message', e)
      }
    })
  }
}
