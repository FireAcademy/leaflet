import { BigNumber } from 'greenwebjs';
import { Util } from 'greenwebjs/util';
import { env } from 'process';
import { FullNodeClient } from './full_node_client';

export class OpenAPIClient {
  public static chainId: string = '0x01';
  public static addressPrefix: string = 'xch';

  public static initialize() {
    if (env.testnet === 'true') {
      this.chainId = '0x02';
      this.addressPrefix = 'txch';
    }
  }

  public static decodeAddress(address: string): string {
    return Util.address.addressToPuzzleHash(address);
  }

  public static coinToJSON(coin: any): any {
    return {
      parent_coin_info:  coin['parent_coin_info'],
      puzzle_hash: coin['puzzle_hash'],
      amount: coin['amount'].toString(),
    };
  }

  public static async getUTXOs(address: string): Promise<any> {
    const puzzleHash = this.decodeAddress(address);

    const reqBody = {
      puzzle_hash: puzzleHash,
      include_spent_coins: false,
    };

    const response = await FullNodeClient.request(
      'get_coin_records_by_puzzle_hash',
      reqBody,
    );

    const coinRecords: any[] = response['coin_records'] ?? [];
    const data: any[] = [];

    for (let i = 0; i < coinRecords.length; i += 1) {
      const cr = coinRecords[i];
      if (cr['spent']) {
        continue;
      }
      data.push(
        this.coinToJSON(cr['coin']),
      );
    }

    return data;
  }

  public static async sendTx(item: any): Promise<any> {
    const sbp = item.spend_bundle;

    const reqBody = {
      spend_bundle: sbp,
    };

    const response = await FullNodeClient.request(
      'push_tx',
      reqBody,
    );

    const data = {
      status: response['status'],
      id: 'deprecated', // "will be removed after goby updated"
    };

    return data;
  }

  public static async chiaRPC(item: any): Promise<any> {
    const method = item.method ?? 'healthz';
    const reqBody = item.params ?? {};

    if (!FullNodeClient.isMethodAllowed(method)) {
      const response = {
        message: 'Method not allowed',
      };

      return response;
    }

    const response = await FullNodeClient.request(
      method,
      reqBody,
    );

    return response;
  }

  public static async getBalance(address: string): Promise<any> {
    const puzzleHash = this.decodeAddress(address);

    const reqBody = {
      puzzle_hash: puzzleHash,
      include_spent_coins: false,
    };

    const response = await FullNodeClient.request(
      'get_coin_records_by_puzzle_hash',
      reqBody,
    );

    const coinRecords: any[] = response['coin_records'] ?? [];
    let balance: number = 0;

    for (let i = 0; i < coinRecords.length; i += 1) {
      const cr = coinRecords[i];
      if (cr['spent']) {
        continue;
      }
      balance += cr['coin']['amount'];
    }

    const data = {
      amount: balance,
    };
    return data;
  }
}