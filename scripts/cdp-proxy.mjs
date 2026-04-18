/**
 * CDP proxy — forwards Chrome remote debugging from the Apple Container bridge
 * interface to localhost, since Chrome 112+ ignores --remote-debugging-address.
 *
 * Listens on LISTEN_HOST:LISTEN_PORT and proxies to TARGET_HOST:TARGET_PORT.
 * Defaults: bridge100 (192.168.64.1) -> localhost:9222
 *
 * Usage: node scripts/cdp-proxy.mjs [listen-host] [port]
 */

import net from 'net';
import os from 'os';

function getBridgeIP() {
  const ifaces = os.networkInterfaces();
  const bridge = ifaces['bridge100'] || ifaces['bridge0'];
  if (bridge) {
    const ipv4 = bridge.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '192.168.64.1';
}

const LISTEN_HOST = process.argv[2] || getBridgeIP();
const PORT = parseInt(process.argv[3] || '9222', 10);
const TARGET_HOST = '127.0.0.1';

const server = net.createServer((client) => {
  const target = net.connect(PORT, TARGET_HOST, () => {
    client.pipe(target);
    target.pipe(client);
  });

  target.on('error', () => client.destroy());
  client.on('error', () => target.destroy());
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`CDP proxy: ${LISTEN_HOST}:${PORT} -> ${TARGET_HOST}:${PORT}`);
});

server.on('error', (err) => {
  console.error(`CDP proxy error: ${err.message}`);
  process.exit(1);
});
