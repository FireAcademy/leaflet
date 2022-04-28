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
import { OpenAPIClient } from './openapi_client';

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
    return expressWs(expressApp, httpsServer).app;
  }

  console.log('No certificates found in /certs; running server in http mode');
  return expressWs(expressApp).app;
}

const controller = new Controller();

controller.initialize().then((ok) => {
  if (!ok) return;

  FullNodeClient.initialize();
  OpenAPIClient.initialize();
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
          await controller.recordUsage(apiKey, 0, true);
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

    console.log({in: '.post function', reqData, reqDotBody: req.body});

    if (!FullNodeClient.isMethodAllowed(method)) {
      return;
    }
    const apiKeyOk = await controller.isAPIKeyAllowed(apiKey);
    if (!apiKeyOk) {
      return;
    }
    const originOk = await controller.checkOrigin(apiKey, req.headers.origin ?? '');
    if (!originOk) {
      return;
    }

    const apiResponse = await FullNodeClient.request(method, req.body ?? {});
    await controller.recordUsage(
      apiKey,
      420 + reqData.length + JSON.stringify(apiResponse).length,
      true,
    );

    res.status(200).json(apiResponse);
  });

  const checkChainIdAndApiKey = async (chainId: string, apiKey: string, origin: string) => {
    const apiKeyOk = await controller.isAPIKeyAllowed(apiKey);
    const originOk = await controller.checkOrigin(apiKey, origin);
    return OpenAPIClient.chainId !== chainId && apiKeyOk && originOk;
  };

  app.get('/:apiKey/openapi/v1/utxos', async (req, res) => {
    const apiKey: string = req.params.apiKey;
    const address: string = req.query.address?.toString() ?? '';
    const chainId: string = req.query.chain?.toString() ?? '0x01';

    if (!(await checkChainIdAndApiKey(chainId, apiKey, req.headers.origin ?? ''))) {
      res.status(500).json({ message: 'Denied' });
      return;
    }

    try {
      const [resp, cost] = await OpenAPIClient.getUTXOs(address);

      await controller.recordUsage(
        apiKey,
        cost,
        true,
      );

      res.status(200).json(resp);
    } catch (e: any) {
      console.log({msg: 'error in OpenAPIClient', e, errorMsg: e.message});
    }
  });

  app.post('/:apiKey/openapi/v1/sendtx', async (req, res) => {
    const apiKey: string = req.params.apiKey;
    const item: any = req.body.item ?? {};
    const chainId: string = req.body.chain?.toString() ?? '0x01';

    const additionalCost = JSON.stringify(req.body ?? '').length;
    console.log({ function: '.post chia_rpc', reqBody: JSON.stringify(req.body), additionalCost });

    if (!(await checkChainIdAndApiKey(chainId, apiKey, req.headers.origin ?? ''))) {
      res.status(500).json({ message: 'Denied' });
      return;
    }

    try {
      const [resp, cost] = await OpenAPIClient.sendTx(item);

      await controller.recordUsage(
        apiKey,
        cost + additionalCost,
        true,
      );

      res.status(200).json(resp);
    } catch (e: any) {
      console.log({msg: 'error in OpenAPIClient', e, errorMsg: e.message});
    }
  });

  app.post('/:apiKey/openapi/v1/chia_rpc', async (req, res) => {
    const apiKey: string = req.params.apiKey;
    const item: string = req.body.item ?? {};
    const chainId: string = req.body.chain?.toString() ?? '0x01';

    const additionalCost = JSON.stringify(req.body ?? '').length;
    console.log({ function: '.post chia_rpc', reqBody: JSON.stringify(req.body), additionalCost });

    if (!(await checkChainIdAndApiKey(chainId, apiKey, req.headers.origin ?? ''))) {
      res.status(500).json({ message: 'Denied' });
      return;
    }

    try {
      const [resp, cost] = await OpenAPIClient.chiaRPC(item);

      await controller.recordUsage(
        apiKey,
        cost + additionalCost,
        true,
      );

      res.status(200).json(resp);
    } catch (e: any) {
      console.log({msg: 'error in OpenAPIClient', e, errorMsg: e.message});
    }
  });

  app.get('/:apiKey/openapi/v1/balance', async (req, res) => {
    const apiKey: string = req.params.apiKey;
    const address: string = req.query.address?.toString() ?? '';
    const chainId: string = req.query.chain?.toString() ?? '0x01';

    if (!(await checkChainIdAndApiKey(chainId, apiKey, req.headers.origin ?? ''))) {
      res.status(500).json({ message: 'Denied' });
      return;
    }

    try {
      const [resp, cost] = await OpenAPIClient.getBalance(address);

      await controller.recordUsage(
        apiKey,
        cost,
        true,
      );

      res.status(200).json(resp);
    } catch (e: any) {
      console.log({msg: 'error in OpenAPIClient', e, errorMsg: e.message});
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