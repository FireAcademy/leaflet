import express from 'express';
import expressWs from 'express-ws';
import https from 'https';
import { readFileSync } from 'fs';
import { MAX_WALLET_CLIENTS } from './config';
import { CertManager } from './cert_manager';
import { Client } from './client';

const certManager = new CertManager(MAX_WALLET_CLIENTS * 2);
let clients: Client[] = [];

const expressApp = express();

const httpsServer = https.createServer(
    { key: readFileSync('ssl/server.key'), cert: readFileSync('ssl/server.crt') },
    expressApp,
);
const app = expressWs(expressApp, httpsServer).app;

app.use((req, res, next) => {
  console.log(req.path);
  return next();
});

app.get('/', (req, res) => {
  res.send('Leaflet server is running!').end();
});

app.ws('/:apiKey/ws', (ws, req) => {
  const apiKey: string = req.params.apiKey;

  const client = new Client(
    ws,
    certManager.getCertAndKey(),
    apiKey,
    id => clients = clients.filter(e => e.id !== id),
   );
  clients.push(client);
});

console.log('Generating certificate queue; this might take a few mins...');
certManager.initialize().then(() => httpsServer.listen(18444, () => {
  console.log('Done. Listening on port 18444...');
}));
