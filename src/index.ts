import express from 'express';
import expressWs from 'express-ws';
import https from 'https';
import { readFileSync } from 'fs';
import { CertManager } from './cert_manager';
import { Client } from './client';
import { Controller } from './controller';

const controller = new Controller();
controller.initialize().then((ok) => {
  if (!ok) return;

  const certManager = new CertManager(controller.maxWalletClients! * 2);
  let clients: Client[] = [];
  const expressApp = express();

  const httpsServer = https.createServer(
    { key: readFileSync('ssl/server.key'), cert: readFileSync('ssl/server.crt') },
    expressApp,
  );
  const app = expressWs(expressApp, httpsServer).app;

  app.get('/', (req, res) => {
    res.send('Leaflet server is running!').end();
  });

  app.get('/', async (req, res) => {
    res.send('Leaflet server is running!').end();
  });

  app.ws('/:apiKey/ws', (ws, req) => {
    const apiKey: string = req.params.apiKey;

    try {
      const client = new Client(
        ws,
        certManager.getCertAndKey(),
        apiKey,
        id => clients = clients.filter(e => e.id !== id),
        (apiKey, bytes) => controller.recordUsage(apiKey, bytes),
       );
      clients.push(client);
    } catch (_) {
      console.log(_);
      ws.close();
    }
  });

  console.log('Generating certificate queue; this might take a few mins...');
  certManager.initialize().then(() => httpsServer.listen(18444, () => {
    console.log('Done. Listening on port 18444...');
  }));
});
