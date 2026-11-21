import { appendFileSync } from 'node:fs';
import readline from 'node:readline';

const logPath = process.env.RDT_FIXTURE_LOG;
const record = (event) => {
  if (logPath)
    appendFileSync(
      logPath,
      JSON.stringify({ event, pid: process.pid, cwd: process.cwd(), time: Date.now() }) + '\n',
    );
};
record('start');
process.on('exit', () => record('exit'));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const identity = () => ({ pid: process.pid, cwd: process.cwd() });
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line.trim() === '') return;
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const { id, method, params } = message;
  try {
    if (method === 'initialize') {
      const respond = () =>
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 'rdt-workspace-fixture', version: '1.0.0' },
            instructions: `Workspace fixture instructions: ${process.cwd()}`,
          },
        });
      const delay = Number(process.env.RDT_FIXTURE_DELAY_MS ?? 0);
      if (delay > 0) setTimeout(respond, delay);
      else respond();
      return;
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'identity',
              description: 'Return fixture pid and cwd',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        },
      });
    }
    if (method === 'tools/call' && params?.name === 'identity') {
      const value = identity();
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(value) }],
          structuredContent: value,
        },
      });
    }
    if (method === 'resources/list') {
      const uri = `fixture://workspace/${process.pid}`;
      return send({
        jsonrpc: '2.0',
        id,
        result: { resources: [{ uri, name: 'Workspace identity', mimeType: 'application/json' }] },
      });
    }
    if (method === 'resources/templates/list')
      return send({ jsonrpc: '2.0', id, result: { resourceTemplates: [] } });
    if (method === 'resources/read') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            { uri: params?.uri, mimeType: 'application/json', text: JSON.stringify(identity()) },
          ],
        },
      });
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } });
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(error?.stack ?? error) } });
  }
});
process.stdin.resume();
