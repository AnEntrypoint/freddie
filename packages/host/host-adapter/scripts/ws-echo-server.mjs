import host from 'fx:host'
import { hostView, services } from '../src/index.js'

const server = hostView(host, 'net.server', services['net.server']).serve({ port: 47361 })
const request = server.accept()
const text = request.websocket.recv()
request.websocket.send(text)
