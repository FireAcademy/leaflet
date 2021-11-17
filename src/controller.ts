export class Controller {
  public maxWalletClients: number | undefined;
  private isFreeKey: Record<string, boolean> = {};
  private usageCache: Record<string, number> = {};
  private connectionCount = 0;

  public async initialize(): Promise<boolean> {
    this.maxWalletClients = 2;

    console.log('Controller initialized');
    return true;
  }

  public async isAPIKeyAllowed(apiKey: string): Promise<boolean> {
    if (this.isFreeKey[apiKey] === undefined) {
      this.isFreeKey[apiKey] = true;
    }
    this.usageCache[apiKey] = 0;

    return true;
  }

  public async recordUsage(apiKey: string, bytes: number): Promise<boolean> {
    const oldVal = this.usageCache[apiKey] ?? 0;
    const newVal = oldVal + bytes;
    this.usageCache[apiKey] = newVal;
    console.log(`Key: ${apiKey}; add usage: ${bytes}; total usage: ${newVal}`);

    if (newVal > 100000) {
      return this.isAPIKeyAllowed(apiKey);
    }
    return true;
  }

  public updateConnections(connectionCount: number) {
    this.connectionCount = connectionCount;
  }

  public canReceiveClient(): boolean {
    return this.connectionCount > 0;
  }
}