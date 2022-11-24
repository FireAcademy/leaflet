import { FullNode } from 'chia-client';
import { homedir } from 'os';
import * as path from 'path';

export const FULL_NODE_CRT_PATH = path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.crt');
export const FULL_NODE_KEY_PATH = path.join(homedir(), '.chia/mainnet/config/ssl/full_node/private_full_node.key');

export class Controller {
  private readonly fullNode = new FullNode({
    protocol: 'https',
    hostname: 'localhost',
    port: 8555,
    certPath: FULL_NODE_CRT_PATH,
    keyPath: FULL_NODE_KEY_PATH,
    caCertPath: path.join(homedir(), '.chia/mainnet/config/ssl/ca/private_ca.crt'),
  });

  public async isReady(): Promise<boolean> {
    const blockchain = await this.fullNode.getBlockchainState();

    return blockchain.success &&
      blockchain.blockchain_state.sync.synced &&
      !blockchain.blockchain_state.sync.sync_mode;
  }
}