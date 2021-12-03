import { firestore } from 'firebase-admin';
import { App, initializeApp, cert } from 'firebase-admin/app';
import { DocumentReference, DocumentSnapshot, Firestore, getFirestore } from 'firebase-admin/firestore';
import { env } from 'process';

const LOG_TRESHOLD = 1000000; // bytes cached until updating db

export class Controller {
  public maxWalletClients: number | undefined;
  private usageCache: Record<string, number> = {};
  private connectionCount = 0;
  private firebaseApp: App | undefined;
  private db: Firestore | undefined;

  public async initialize(): Promise<boolean> {
    this.maxWalletClients = 20;

    try {
      this.firebaseApp = initializeApp({
        credential: cert(JSON.parse(env.FIREBASE_CREDS ?? '{}')),
      });
      this.db = getFirestore(this.firebaseApp);
    } catch (_) {
      console.log(`Could not initialize Firebase Admin SDK: ${_}`);
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
    return apiKeyDoc.data()?.valid ?? false;
  }

  public async recordUsage(
    apiKey: string,
    bytes: number,
    force: boolean = false,
  ): Promise<boolean> {
    const oldVal = this.usageCache[apiKey] ?? 0;
    const newVal = oldVal + bytes;

    console.log(`Key: ${apiKey}; total usage: ${newVal}`);

    if (newVal > LOG_TRESHOLD || force) {
      if (this.firebaseApp !== undefined && this.db !== undefined) {
        const docData = {
          apiKey,
          uage: newVal,
          date: firestore.FieldValue.serverTimestamp(),
          billed: false,
        };
        await this.db.collection('usage').doc().create(docData);
      }

      this.usageCache[apiKey] = 0;
      return this.isAPIKeyAllowed(apiKey);
    }

    this.usageCache[apiKey] = newVal;
    return true;
  }

  public updateConnections(connectionCount: number) {
    this.connectionCount = connectionCount;
  }

  public canReceiveClient(): boolean {
    return this.connectionCount < this.maxWalletClients!;
  }
}