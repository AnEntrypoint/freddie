import host from 'fx:host'
import { planHost, hostView, services } from '../src/index.js'

const text = 'freddie net.ws frame'
const plan = planHost(host)
const socket = hostView(host, 'net.ws', services['net.ws']).connect('127.0.0.1', 47361, '/')
socket.send(text)
const echo = socket.recv()
socket.close()
const ok = plan.register.includes('net.ws') && echo === text
console.log((ok ? 'ok   ' : 'FAIL ') + 'net.ws echo: sent "' + text + '", read "' + echo + '", registered ' + plan.register.includes('net.ws'))
if (!ok) throw new Error('fx ws check failed')
