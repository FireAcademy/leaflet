import { ProtocolMessageTypes } from './protocol_message_types';

export const ALLOWED_MESSAGE_TYPES = [
  ProtocolMessageTypes.handshake,

  // Wallet protocol (wallet <-> full_node)
  ProtocolMessageTypes.request_puzzle_solution,
  ProtocolMessageTypes.respond_puzzle_solution,
  ProtocolMessageTypes.reject_puzzle_solution,
  ProtocolMessageTypes.send_transaction,
  ProtocolMessageTypes.transaction_ack,
  ProtocolMessageTypes.new_peak_wallet,
  ProtocolMessageTypes.request_block_header,
  ProtocolMessageTypes.respond_block_header,
  ProtocolMessageTypes.reject_header_request,
  ProtocolMessageTypes.request_removals,
  ProtocolMessageTypes.respond_removals,
  ProtocolMessageTypes.reject_removals_request,
  ProtocolMessageTypes.request_additions,
  ProtocolMessageTypes.respond_additions,
  ProtocolMessageTypes.reject_additions_request,
  ProtocolMessageTypes.request_header_blocks,
  ProtocolMessageTypes.reject_header_blocks,
  ProtocolMessageTypes.respond_header_blocks,

  // More wallet protocol
  ProtocolMessageTypes.coin_state_update,
  ProtocolMessageTypes.register_interest_in_puzzle_hash,
  ProtocolMessageTypes.respond_to_ph_update,
  ProtocolMessageTypes.register_interest_in_coin,
  ProtocolMessageTypes.respond_to_coin_update,
  ProtocolMessageTypes.request_children,
  ProtocolMessageTypes.respond_children,
  ProtocolMessageTypes.request_ses_hashes,
  ProtocolMessageTypes.respond_ses_hashes,
];