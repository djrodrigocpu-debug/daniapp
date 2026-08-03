// Servidor estatico minimo para CONFERIR o bundle exportado (dist/) sem
// depender de pacote externo. Nao e servidor de producao e nao deve virar um.
// SPA: qualquer rota desconhecida cai em index.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const raiz = resolve(process.argv[2] ?? 'dist');
const porta = Number(process.argv[3] ?? 4173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let caminho = join(raiz, url === '/' ? 'index.html' : url);
  try {
    let corpo;
    try {
      corpo = await readFile(caminho);
    } catch {
      caminho = join(raiz, 'index.html');
      corpo = await readFile(caminho);
    }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' });
    res.end(corpo);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(porta, () => console.log(`dist servido em http://127.0.0.1:${porta}`));
