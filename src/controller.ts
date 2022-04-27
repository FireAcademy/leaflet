import { firestore } from 'firebase-admin';
import { App, initializeApp, cert } from 'firebase-admin/app';
import { DocumentReference, DocumentSnapshot, Firestore, getFirestore } from 'firebase-admin/firestore';
import { env } from 'process';
import { FullNode } from 'chia-client';
import { homedir, hostname } from 'os';
import * as path from 'path';
import { Gauge } from 'prom-client';

const LOG_TRESHOLD = 4200000; // bytes 'cached' until usage is written to db

export class Controller {
  private usageCache: Record<string, number> = {};
  private firebaseApp: App | undefined;
  private db: Firestore | undefined;
  private readonly fullNode = new FullNode({
    protocol: 'https',
    hostname: 'localhost',
    port: 8555,
    certPath: path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.crt'),
    keyPath: path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.key'),
    caCertPath: path.join(homedir(), '.chia/mainnet/config/ssl/ca/private_ca.crt'),
  });
  private gauge: Gauge<'pod'> | undefined;
  private origins: Record<string, string> = {};
  private originsLastFetched: Record<string, number> = {};

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
      this.gauge = new Gauge({
        name: 'custom_metrics_connected_clients_by_pod',
        help: 'Custom metric: Connected Clients per Pod',
        labelNames: ['pod'],
      });

      this.gauge?.set({ pod: hostname() }, 0);
    }

    console.log('Controller initialized');
    return true;
  }

  public async isAPIKeyAllowed(apiKey: string): Promise<boolean> {
    if (this.firebaseApp === undefined || this.db === undefined) {
      return true;
    }

    const apiKeyDocRef: DocumentReference = this.db.collection('apiKeys').doc(apiKey);
    const apiKeyDoc: DocumentSnapshot = await apiKeyDocRef.get();
    const valid: boolean = apiKeyDoc.data()?.valid ?? false;

    if (valid) {
      const apiKeyOrigin = apiKeyDoc.data()?.origin ?? '*';
      const timestamp = new Date().getTime();

      this.origins[apiKey] = this.buildOriginExp(origin);
      this.originsLastFetched[apiKey] = timestamp;
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
        r += '[a-zA-Z]*';
      }
    }

    return `^${r}\$`;
  }

  public async checkOrigin(apiKey: string, origin: string): Promise<boolean> {
    if (this.db === undefined) {
      return true;
    }

    const timestamp = new Date().getTime();
    if (
      this.origins[apiKey] === undefined ||
      this.originsLastFetched[apiKey] === undefined ||
      timestamp - this.originsLastFetched[apiKey] > 5 * 60 * 1000
    ) {
      const apiKeyDocRef: DocumentReference = this.db.collection('apiKeys').doc(apiKey);
      const apiKeyDoc: DocumentSnapshot = await apiKeyDocRef.get();
      const origin: string = apiKeyDoc.data()?.origin ?? '*';
      const newTimestamp = new Date().getTime();

      this.origins[apiKey] = this.buildOriginExp(origin);
      this.originsLastFetched[apiKey] = newTimestamp;
    }

    const originExp = this.origins[apiKey];
    let reqOrigin = origin.split('://')[origin.split('://').length - 1];
    reqOrigin = reqOrigin.split(':')[0];
    const r = new RegExp(originExp, 'g');
    const allow: boolean = r.test(reqOrigin);

    return allow;
  }

  public async recordUsage(
    apiKey: string,
    bytes: number,
    force: boolean = false,
  ): Promise<boolean> {
    const oldVal = this.usageCache[apiKey] ?? 0;
    const newVal = oldVal + bytes;
    this.usageCache[apiKey] = newVal;

    if (newVal > LOG_TRESHOLD || force) {
      this.usageCache[apiKey] = 0;
      if (this.firebaseApp !== undefined && this.db !== undefined) {
        const docData = {
          apiKey,
          usage: newVal,
          date: firestore.FieldValue.serverTimestamp(),
          billed: false,
        };
        await this.db.collection('usage').doc().create(docData);
      }

      return this.isAPIKeyAllowed(apiKey);
    }

    if (oldVal === 0) {
      return this.isAPIKeyAllowed(apiKey);
    }

    return true;
  }

  public updateConnections(connectionCount: number) {
    this.gauge?.set({ pod: hostname() }, connectionCount);
  }

  public async isReady(): Promise<boolean> {
    const blockchain = await this.fullNode.getBlockchainState();

    return blockchain.success &&
      blockchain.blockchain_state.sync.synced &&
      !blockchain.blockchain_state.sync.sync_mode;
  }
}