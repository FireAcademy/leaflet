import { firestore } from 'firebase-admin';
import { App, initializeApp, cert } from 'firebase-admin/app';
import { DocumentReference, DocumentSnapshot, Firestore, getFirestore } from 'firebase-admin/firestore';
import { env } from 'process';
import { FullNode } from 'chia-client';
import { homedir, hostname } from 'os';
import * as path from 'path';
import { Gauge } from 'prom-client';

const LOG_TRESHOLD = 420000; // bytes 'cached' until usage is written to db

export const FULL_NODE_CRT_PATH = path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.crt');
export const FULL_NODE_KEY_PATH = path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.key');

const STAR_REPLACEMENT = '[a-zA-Z-_]*';
const RPC_INVOCATION_COST = 8400;

export class Controller {
  private firebaseApp: App | undefined;
  private db: Firestore | undefined;
  private readonly fullNode = new FullNode({
    protocol: 'https',
    hostname: 'localhost',
    port: 8555,
    certPath: FULL_NODE_CRT_PATH,
    keyPath: FULL_NODE_KEY_PATH,
    caCertPath: path.join(homedir(), '.chia/mainnet/config/ssl/ca/private_ca.crt'),
  });
  private connectedClientsPerPodGauge: Gauge<'pod'> | undefined;
  private rpcCallsLastMinutePerPodGauge: Gauge<'pod'> | undefined;

  private usageCache: Map<string, number> = new Map<string, number>();
  private origins: Map<string, string> = new Map<string, string>();
  private originsLastFetched: Map<string, number> = new Map<string, number>();

  private static rpcRequests: number[] = [];

  public async initialize(): Promise<boolean> {
    try {
      this.firebaseApp = initializeApp({
        credential: cert(JSON.parse(env.FIREBASE_CREDS ?? '{}')),
      });
      this.db = getFirestore(this.firebaseApp);
    } catch (_) {
      console.log(`Could not initialize Firebase Admin SDK: ${_}`);
    }

    if (env.REPORT_METRICS) {
      this.connectedClientsPerPodGauge = new Gauge({
        name: 'custom_metrics_connected_clients_by_pod',
        help: 'Custom metric: Connected Clients per Pod',
        labelNames: ['pod'],
      });

      this.connectedClientsPerPodGauge?.set({ pod: hostname() }, 0);

      this.rpcCallsLastMinutePerPodGauge = new Gauge({
        name: 'custom_metrics_rpc_calls_last_minute_by_pod',
        help: 'Custom metric: RPC Calls (last minute) per Pod',
        labelNames: ['pod'],
        async collect() {
          const timestamp = new Date().getTime();
          Controller.rpcRequests.push(timestamp);
          let i = 0;
          while (timestamp - Controller.rpcRequests[i] > 60 * 1000) {
            i += 1;
          }
          if (i > 0) {
            console.log({arr: Controller.rpcRequests, reqs: Controller.rpcRequests.length, meth: 'collect'});
            Controller.rpcRequests = Controller.rpcRequests.slice(i);
            console.log({arr: Controller.rpcRequests, reqs: Controller.rpcRequests.length, meth: 'collect'});
          }

          this.set(Controller.rpcRequests.length);
        },
      });
    }

    console.log('Controller initialized');
    return true;
  }

  private shouldUpdateOrigin(apiKey: string): boolean {
    const timestamp = new Date().getTime();
    return timestamp - (this.originsLastFetched.get(apiKey) ?? 0) > 5 * 60 * 1000;
  }

  public async isAPIKeyAllowed(apiKey: string): Promise<boolean> {
    if (
      this.firebaseApp === undefined ||
      this.db === undefined ||
      !this.shouldUpdateOrigin(apiKey)
    ) {
      return true;
    }

    const apiKeyDocRef: DocumentReference = this.db.collection('apiKeys').doc(apiKey);
    const apiKeyDoc: DocumentSnapshot = await apiKeyDocRef.get();
    const valid: boolean = apiKeyDoc.data()?.valid ?? false;

    if (valid) {
      const apiKeyOrigin = apiKeyDoc.data()?.origin ?? '*';
      const timestamp = new Date().getTime();

      this.origins.set(apiKey, this.buildOriginExp(apiKeyOrigin));
      this.originsLastFetched.set(apiKey, timestamp);
    }

    return valid;
  }

  private buildOriginExp(o: string): string {
    let r: string = '';
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

    for (let i = 0; i < o.length; i += 1) {
      if (alphabet.includes(o[i])) {
        r += o[i];
      } else if (o[i] === '.') {
        r += '\.';
      } else if (o[i] === '*') {
        r += STAR_REPLACEMENT;
      }
    }

    return `^${r}\$`;
  }

  public async checkOrigin(apiKey: string, origin: string): Promise<boolean> {
    if (this.db === undefined) {
      return true;
    }

    if (this.shouldUpdateOrigin(apiKey)) {
      const apiKeyDocRef: DocumentReference = this.db.collection('apiKeys').doc(apiKey);
      const apiKeyDoc: DocumentSnapshot = await apiKeyDocRef.get();
      const origin: string = apiKeyDoc.data()?.origin ?? '*';
      const newTimestamp = new Date().getTime();

      if (apiKeyDoc.data()?.valid === false) {
        return false;
      }

      this.origins.set(apiKey, this.buildOriginExp(origin));
      this.originsLastFetched.set(apiKey, newTimestamp);
    }

    const originExp = this.origins.get(apiKey) ?? '';
    if (originExp === `^${STAR_REPLACEMENT}\$`) {
      return true;
    }
    let reqOrigin = origin.split('://')[origin.split('://').length - 1];
    reqOrigin = reqOrigin.split(':')[0];
    const r = new RegExp(originExp, 'g');
    const allow: boolean = r.test(reqOrigin);

    return allow;
  }

  public async recordUsageInDb(apiKey: string, bytes: number): Promise<void> {
    if (this.firebaseApp === undefined || this.db === undefined) {
      return;
    }

    const docData = {
      apiKey,
      usage: bytes,
      date: firestore.FieldValue.serverTimestamp(),
      billed: false,
    };

    await this.db.collection('usage').doc().create(docData);
  }

  public async recordRPCMethodUsage(apiKey: string): Promise<void> {
    console.log({apiKey, meth: 'recorsRPCMethodUsage'});
    await this.recordUsage(apiKey, RPC_INVOCATION_COST);

    const timestamp = new Date().getTime();
    Controller.rpcRequests.push(timestamp);
  }

  public async recordUsage(
    apiKey: string,
    bytes: number,
  ): Promise<boolean> {
    const oldVal = this.usageCache.get(apiKey) ?? 0;
    const newVal = oldVal + bytes;
    this.usageCache.set(apiKey, newVal);

    if (newVal > LOG_TRESHOLD) {
      this.usageCache.set(apiKey, 0);
      await this.recordUsageInDb(apiKey, newVal);

      return this.isAPIKeyAllowed(apiKey);
    }

    if (oldVal === 0) {
      return this.isAPIKeyAllowed(apiKey);
    }

    return true;
  }

  public updateConnections(connectionCount: number) {
    this.connectedClientsPerPodGauge?.set({ pod: hostname() }, connectionCount);
  }

  public async isReady(): Promise<boolean> {
    const blockchain = await this.fullNode.getBlockchainState();

    return blockchain.success &&
      blockchain.blockchain_state.sync.synced &&
      !blockchain.blockchain_state.sync.sync_mode;
  }

  public async prepareForShutdown(): Promise<void> {
    let apiKey: string;
    let usage: number;
    const promises = [];
    for ([apiKey, usage] of this.usageCache.entries()) {
      if (usage < 1) continue;

      promises.push(this.recordUsageInDb(
        apiKey, usage,
      ));
    }

    await Promise.all(promises);
  }
}