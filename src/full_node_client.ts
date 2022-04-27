/*
special thanks to
https://github.com/freddiecoleman/chia-client
*/
import { readFileSync } from 'fs';
import { Agent } from 'https';
import axios from 'axios';

const CRT_PATH = '/root/.chia/mainnet/config/ssl/full_node/private_full_node.crt';
const KEY_PATH = '/root/.chia/mainnet/config/ssl/full_node/private_full_node.key';

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
];

export class FullNodeClient {
  private static agent: Agent | null = null;

  public static initialize() {
    FullNodeClient.agent = new Agent({
      cert:  readFileSync(CRT_PATH),
      key: readFileSync(KEY_PATH),
      rejectUnauthorized: false,
    });
  }

  public static isMethodAllowed(method: string) {
    return ALLOWED_METHODS.includes(method);
  }

  public static async request(
    route: string,
    data: string,
  ): Promise<any> {
    try {
      const resp = await axios.post<string>(`https://localhost:8555/${route}`, data, {
        httpsAgent: this.agent,
      });

      const respData: string = resp.data;
      console.log({respDotData: resp.data, respData, data,
        respDataJSON: JSON.stringify(resp.data)});

      return respData;
    } catch (e: any) {
      console.log(`error! ${e.message}`);
      return {};
    }
  }
}