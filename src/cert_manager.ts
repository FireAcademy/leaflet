import { exec } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

export type CertAndKey = {
  certificate: Buffer,
  key: Buffer,
};

export class CertManager {
  private readonly targetQueueLength: number;
  private queue: CertAndKey[];
  private lock = false;

  constructor(targetQueueLength: number) {
    this.targetQueueLength = targetQueueLength;
    this.queue = [];
  }

  public async initialize(): Promise<void> {
    await this.ensureQueueHasEnoughItems();

    const self = this;
    setInterval(
      () => this.ensureQueueHasEnoughItems(self),
      1000,
    );
  }

  private async ensureQueueHasEnoughItems(selfMaybe: CertManager | null = null): Promise<void> {
    const self = selfMaybe === null ? this : selfMaybe;

    while (self.queue.length < self.targetQueueLength) {
      await self.addCertToQueue(self);
    }
  }

  private async addCertToQueue(selfMaybe: CertManager | null = null): Promise<void> {
    const self = selfMaybe === null ? this : selfMaybe;

    while (self.lock) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    self.lock = true;

    const commands = [
      'openssl genpkey -outform PEM -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -pkeyopt rsa_keygen_pubexp:65537 -out client.key',
      'openssl req -new -key client.key -config config.txt -out client.csr',
      'openssl x509 -req -CA chia_ca.crt -CAkey chia_ca.key -in client.csr -out client.crt -days 3650 -CAcreateserial -extfile client.ext',
    ];
    for (let i = 0; i < commands.length; i += 1) {
      await new Promise<void>((resolve) => {
        exec(
          commands[i],
          { cwd: path.join(process.cwd(), 'client_ssl') },
          () => resolve(),
        );
      });
    }

    const certAndKey: CertAndKey = {
      certificate: readFileSync('./client_ssl/client.crt'),
      key: readFileSync('./client_ssl/client.key'),
    };

    self.queue.push(certAndKey);
    self.lock = false;
  }

  public getCertAndKey(): CertAndKey {
    let resp = this.queue.shift();

    if (resp === undefined) {
      for (let i = 0; i < 5; i += 1) {
        this.addCertToQueue();
      }
    }
    while (resp === undefined) {
      resp = this.queue.shift();
    }

    return resp;
  }
}