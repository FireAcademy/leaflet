/*
special thanks to
https://github.com/freddiecoleman/chia-client
*/
import { readFileSync } from 'fs';
import { Agent } from 'https';
import axios from 'axios';
import { FULL_NODE_CRT_PATH, FULL_NODE_KEY_PATH } from './controller';

export const ALLOWED_METHODS: string[] = [
  'get_blockchain_state',
  'get_block',
  'get_blocks',
  'get_block_count_metrics',
  'get_block_record_by_height',
  'get_block_record',
  'get_block_records',
  'get_unfinished_block_headers',
  'get_network_space',
  'get_additions_and_removals',
  'get_network_info',
  'get_recent_signage_point_or_eos',
  'get_coin_records_by_puzzle_hash',
  'get_coin_records_by_puzzle_hashes',
  'get_coin_record_by_name',
  'get_coin_records_by_names',
  'get_coin_records_by_parent_ids',
  'get_coin_records_by_hint',
  'push_tx',
  'get_puzzle_and_solution',
  'get_all_mempool_tx_ids',
  'get_all_mempool_items',
  'get_mempool_item_by_tx_id',
  'get_routes',
  'healthz',
];

export class FullNodeClient {
  private static agent: Agent | null = null;

  public static initialize() {
    FullNodeClient.agent = new Agent({
      cert:  readFileSync(FULL_NODE_CRT_PATH),
      key: readFileSync(FULL_NODE_KEY_PATH),
      rejectUnauthorized: false,
    });
  }

  public static isMethodAllowed(method: string) {
    return ALLOWED_METHODS.includes(method);
  }

  public static async request(
    route: string,
    data: any,
  ): Promise<any> {
    try {
      const resp = await axios.post<string>(`https://localhost:8555/${route}`, data, {
        httpsAgent: this.agent,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const respData: string = resp.data;

      return respData;
    } catch (e: any) {
      console.log({ e, data, function: 'request', msg: 'error', errMsg: e.message });
      return {};
    }
  }
}