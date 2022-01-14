import express from 'express';
import expressWs from 'express-ws';
import { CertManager } from './cert_manager';
import { Client } from './client';
import { Controller } from './controller';
import { env } from 'process';

const controller = new Controller();
controller.initialize().then((ok) => {
  if (!ok) return;

  const certManager = new CertManager(100);
  let clients: Client[] = [];
  const expressApp = express();
  const metricsApp = express();

  if (env.REPORT_METRICS) {
    const apiMetrics = require('prometheus-api-metrics');
    metricsApp.use(apiMetrics());
  }

  const app = expressWs(expressApp).app;

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
      const client = new Client(
        ws,
        certManager.getCertAndKey(),
        apiKey,
        async (id) => {
          clients = clients.filter(e => e.id !== id);
          controller.updateConnections(clients.length);
          await controller.recordUsage(apiKey, 0, true);
        },
        (apiKey, bytes) => controller.recordUsage(apiKey, bytes),
       );
      clients.push(client);
      controller.updateConnections(clients.length);
    } catch (_) {
      console.log(_);
      ws.close();
    }
  });

  console.log('Generating certificate queue; this might take a few mins...');
  certManager.initialize().then(() => {
    console.log('Done.');

    app.listen(18444, () => {
      console.log('Socket thing listening on port 18444...');
    });

    if (env.REPORT_METRICS) {
      metricsApp.listen(4242, () => {
        console.log('Metrics thing listening on port 4242...');
      });
    }
  });
});

process.on('SIGTERM', () => {
  console.log('Graceful termination');
});