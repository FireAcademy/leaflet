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
    const result = {
      parent_coin_info:  coin['parent_coin_info'],
      puzzle_hash: coin['puzzle_hash'],
      amount: coin['amount'].toString(),
    };

    console.log({function: 'coinToJSON', result});

    return result;
  }

  // returns: [json, cost]
  public static async getUTXOs(address: string): Promise<[any, number]> {
    let cost: number = 420;
    const puzzleHash = this.decodeAddress(address);

    const reqBody = {
      puzzle_hash: puzzleHash,
      include_spent_coins: false,
    };
    console.log({function: 'getUTXOs', reqBody, addCost:JSON.stringify(reqBody).length });
    cost += JSON.stringify(reqBody).length;

    const response = await FullNodeClient.request(
      'get_coin_records_by_puzzle_hash',
      reqBody,
    );
    console.log({function: 'getUTXOs', response, addCost:JSON.stringify(response).length });
    cost += JSON.stringify(response).length;

    const coinRecords: any[] = response['coin_records'];
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

    console.log({function: 'getUTXOs', data, addCost:JSON.stringify(data).length });
    cost += JSON.stringify(data).length;
    return [data, cost];
  }

  // returns: [json, cost]
  public static async sendTx(item: any): Promise<[any, number]> {
    let cost: number = 420;
    const sbp = item.spend_bundle;

    const reqBody = {
      spend_bundle: sbp,
    };
    console.log({function: 'sendTx', reqBody, addCost:JSON.stringify(reqBody).length });
    cost += JSON.stringify(reqBody).length;

    const response = await FullNodeClient.request(
      'push_tx',
      reqBody,
    );
    console.log({function: 'sendTx', response, addCost:JSON.stringify(response).length });
    cost += JSON.stringify(response).length;

    const data = {
      status: response['status'],
      id: 'deprecated', // "will be removed after goby updated"
    };

    console.log({function: 'sendTx', data, addCost:JSON.stringify(data).length });
    cost += JSON.stringify(data).length;
    return [data, cost];
  }

  // returns: [json, cost]
  public static async chiaRPC(item: any): Promise<[any, number]> {
    let cost: number = 420;
    const method = item.spend_bundle;
    const reqBody = item.params;

    console.log({function: 'chiaRPC', reqBody, addCost:JSON.stringify(reqBody).length });
    cost += JSON.stringify(reqBody).length;

    const response = await FullNodeClient.request(
      method,
      reqBody,
    );
    console.log({function: 'chiaRPC', response, addCost:JSON.stringify(response).length });
    cost += JSON.stringify(response).length * 2;

    return [response, cost];
  }

  // returns: [json, cost]
  public static async getBalance(address: string): Promise<[any, number]> {
    let cost: number = 420;
    const puzzleHash = this.decodeAddress(address);

    const reqBody = {
      puzzle_hash: puzzleHash,
      include_spent_coins: false,
    };
    console.log({function: 'balance', reqBody, addCost:JSON.stringify(reqBody).length });
    cost += JSON.stringify(reqBody).length;

    const response = await FullNodeClient.request(
      'get_coin_records_by_puzzle_hash',
      reqBody,
    );
    console.log({function: 'balance', response, addCost:JSON.stringify(response).length });
    cost += JSON.stringify(response).length;

    const coinRecords: any[] = response['coin_records'];
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
    console.log({function: 'balance', data, addCost:JSON.stringify(data).length });
    cost += JSON.stringify(data).length;
    return [data, cost];
  }
}