/*
  Service worker do Caderno Digital.
  Guarda uma cópia do app (e das bibliotecas de PDF e das fontes) no tablet,
  para ele abrir e funcionar mesmo sem internet.
  Ao publicar uma versão nova do index.html, aumente o número em VERSAO.
*/
const VERSAO = 'caderno-v2';

const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];
const BIBLIOTECAS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Caveat:wght@400;700&family=Lora:wght@400;700&display=swap'
];

// Instalação: baixa e guarda tudo de uma vez
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    await cache.addAll(ARQUIVOS_DO_APP);
    // bibliotecas de fora: se alguma falhar, o app continua instalando
    await Promise.all(BIBLIOTECAS.map(url => cache.add(new Request(url, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

// Ativação: apaga caches de versões antigas
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Pedidos: responde com a cópia guardada e atualiza em segundo plano quando houver internet
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ehDoApp = url.origin === self.location.origin;
  const ehBiblioteca = /(^|\.)cdnjs\.cloudflare\.com$|fonts\.googleapis\.com$|fonts\.gstatic\.com$/.test(url.hostname);
  if (!ehDoApp && !ehBiblioteca) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const guardado = await cache.match(req, { ignoreSearch: ehDoApp });

    // A página principal: tenta a versão nova primeiro (para receber atualizações), senão usa a guardada
    if (ehDoApp && (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html'))) {
      try {
        const novo = await fetch(req);
        if (novo && novo.ok) cache.put('./index.html', novo.clone());
        return novo;
      } catch (e) {
        return guardado || (await cache.match('./index.html')) || Response.error();
      }
    }

    // Demais arquivos: usa o guardado na hora e atualiza por trás
    const buscar = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return guardado || (await buscar) || Response.error();
  })());
});
