import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export async function browserAudit(name, fixture, audit) {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && existsSync(p))
    assert.ok(browser, 'Chrome or Edge required')
    const artifacts = mkdtempSync(path.join(tmpdir(), `${name}-`))
    const entry = `/__${name}.js`, page = `/__${name}`
    const server = await createServer({ root, cacheDir: path.join(artifacts, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
        name,
        resolveId(id) { if (id === entry) return `\0${name}` },
        load(id) { if (id === `\0${name}`) return fixture },
        configureServer(vite) { vite.middlewares.use((req, res, next) => {
            if (req.url !== page) return next()
            res.setHeader('Content-Type', 'text/html')
            res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="${entry}"></script></body></html>`)
        }) },
    }] })
    let child, timer
    try {
        await server.listen()
        child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${path.join(artifacts, 'profile')}`, '--remote-debugging-pipe'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
        let id = 0, buffer = ''
        const pending = new Map()
        child.stdio[4].on('data', data => {
            buffer += data.toString()
            let at
            while ((at = buffer.indexOf('\0')) >= 0) {
                const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1)
                if (message.method === 'Runtime.exceptionThrown') console.error('Browser exception:', JSON.stringify(message.params.exceptionDetails))
                if (pending.has(message.id)) {
                    const { resolve, reject } = pending.get(message.id); pending.delete(message.id)
                    message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result)
                }
            }
        })
        const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            pending.set(++id, { resolve, reject }); child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
        })
        await Promise.race([(async () => {
            const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
            const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
            const evaluate = async expression => {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const data = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
                        assert.ok(!data.exceptionDetails, JSON.stringify(data.exceptionDetails)); return data.result.value
                    } catch (error) {
                        if (attempt === 2 || !error.message.includes('navigated')) throw error
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                }
            }
            const command = (method, params) => send(method, params, sessionId)
            await command('Page.enable', {})
            await command('Runtime.enable', {})
            await command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false })
            await command('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}${page}` })
            const screenshot = async file => {
                const data = await command('Page.captureScreenshot', { format: 'png' })
                const output = path.join(artifacts, file); writeFileSync(output, Buffer.from(data.data, 'base64')); return output
            }
            try { await audit({ evaluate, command, screenshot, artifacts }) }
            catch (error) { console.error('Audit screenshot:', await screenshot('failure.png')); console.error(await evaluate('document.body.innerText')); throw error }
        })(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${name} audit timed out`)), 60000); child.on('error', reject) })])
    } finally {
        clearTimeout(timer)
        if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited }
        await server.close()
    }
}
