import express from 'express';
import { Controller } from './controller';
import { FullNodeClient } from './full_node_client';

function main() {
  const controller = new Controller();

  FullNodeClient.initialize();

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    res.send('Leaflet server is running!').end();
  });

  app.get('/ready', async (req, res) => {
    var isReady;
    try {
      isReady = await controller.isReady();
    } catch (e: any) {
      isReady = false;
    }

    if (isReady) {
      res.send('OK').end();
    } else {
      res.status(400).send('NOT READY BRO').end();
    }
  });

  app.post('/:method', async (req, res) => {
    const method: string = req.params.method;

    if (!FullNodeClient.isMethodAllowed(method)) {
      return res.status(401).json({ message: 'Denied' });
    }

    const apiResponse = await FullNodeClient.request(method, req.body ?? {});
    
    res.status(200).json(apiResponse);
  });

  app.listen(18444, () => {
    console.log('Socket thing listening on port 18444...');
  });
}

main();