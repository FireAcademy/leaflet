import express, { Application } from 'express';
import { Application as WebSocketApplication } from 'express-ws';
// tslint:disable-next-line: no-duplicate-imports
import expressWs from 'express-ws';
import { CertManager } from './cert_manager';
import { WSClient } from './ws_client';
import { Controller } from './controller';
import { env } from 'process';
import { existsSync, readFileSync } from 'fs';
import https from 'https';
import { FullNodeClient } from './full_node_client';

let thingToListen: any = null;

function getApp(expressApp: Application): WebSocketApplication {
  if (
    existsSync('/certs') &&
    existsSync('/certs/privkey.pem') &&
    existsSync('/certs/cert.pem') &&
    existsSync('/certs/chain.pem')
  ) {
    console.log('Certificates detected in /certs; running server in https mode...');
    const key = readFileSync('/certs/privkey.pem', 'utf8');
    const cert = readFileSync('/certs/cert.pem', 'utf8');
    const ca = readFileSync('/certs/chain.pem', 'utf8');

    const credentials = { key, cert, ca };
    const httpsServer = https.createServer(credentials, expressApp);
    thingToListen = httpsServer;
    return expressWs(expressApp, httpsServer).app;
  }

  console.log('No certificates found in /certs; running server in http mode');
  const app = expressWs(expressApp).app;
  thingToListen = app;
  return app;
}

const controller = new Controller();

controller.initialize().then((ok) => {
  if (!ok) return;

  FullNodeClient.initialize();
  const certManager = new CertManager(142);
  let clients: WSClient[] = [];
  const expressApp = express();
  const metricsApp = express();

  if (env.REPORT_METRICS) {
    const apiMetrics = require('prometheus-api-metrics');
    metricsApp.use(apiMetrics());
  }

  const app = getApp(expressApp);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    res.send('Leaflet server is running!').end();
  });

  app.get('/ready', async (req, res) => {
    const isReady = await controller.isReady();

    if (isReady) {
      res.send('OK').end();
    } else {
      res.status(400).send('NOT READY BRO').end();
    }
  });

  app.ws('/:apiKey/ws', (ws, req) => {
    const apiKey: string = req.params.apiKey;

    try {
      const client = new WSClient(
        ws,
        certManager.getCertAndKey(),
        apiKey,
        async (id) => {
          clients = clients.filter(e => e.id !== id);
          controller.updateConnections(clients.length);
          await controller.recordUsage(apiKey, 0);
        },
        (apiKey, bytes) => controller.recordUsage(apiKey, bytes),
        () => controller.checkOrigin(apiKey, req.headers.origin ?? ''),
       );
      clients.push(client);
      controller.updateConnections(clients.length);
    } catch (_) {
      console.log(_);
      ws.close();
    }
  });

  app.post('/:apiKey/rpc/:method', async (req, res) => {
    const apiKey: string = req.params.apiKey;
    const method: string = req.params.method;
    const reqData: string = JSON.stringify(req.body) ?? '';

    if (!FullNodeClient.isMethodAllowed(method)) {
      return res.status(401).json({ message: 'Denied' });
    }
    const apiKeyOk = await controller.isAPIKeyAllowed(apiKey);
    if (!apiKeyOk) {
      return res.status(401).json({ message: 'Denied' });
    }
    const originOk = await controller.checkOrigin(apiKey, req.headers.origin ?? '');
    if (!originOk) {
      return res.status(401).json({ message: 'Denied' });
    }

    const apiResponse = await FullNodeClient.request(method, req.body ?? {});
    await controller.recordRPCMethodUsage(apiKey);

    res.status(200).json(apiResponse);
  });

  console.log('Generating certificate queue; this might take a few mins...');
  certManager.initialize().then(() => {
    console.log('Done.');

    thingToListen.listen(18444, () => {
      console.log('Socket thing listening on port 18444...');
    });

    if (env.REPORT_METRICS) {
      metricsApp.listen(4242, () => {
        console.log('Metrics thing listening on port 4242...');
      });
    }

    process.on('SIGTERM', async () => {
      console.log('SIGTERM received.');
      await controller.prepareForShutdown();

      process.exit(0);
    });
  });
});