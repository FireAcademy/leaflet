import { WebSocket } from 'ws';
import { ALLOWED_MESSAGE_TYPES, ALLOWED_NODE_TYPE } from './allowed_message_types';
import { CertAndKey } from './cert_manager';
import { recordUsage } from './config';
import { ProtocolMessageTypes } from './protocol_message_types';
import { v4 as uuidv4 } from 'uuid';
/*
generate a new cert for each client (simulate a new 'peer')
get data from clientWs -> decode + verify -> pass it to nodeWs
receive data from nodeWs -> send it to clientWs
*/
export class Client {
  private readonly clientWs: WebSocket; // user <-> this machine
  private readonly nodeWs: WebSocket; // this process <-> full node 8444
  private readonly apiKey: string;
  private readonly onClose: (id: string) => void;
  public id: string;

  constructor(
    ws: WebSocket,
    certAndKey: CertAndKey,
    apiKey: string,
    onClose: (id: string) => void,
  ) {
    this.clientWs = ws;
    this.apiKey = apiKey;
    this.onClose = onClose;
    this.id = uuidv4();

    // setup ASAP
    this.clientWs.on('message', async (msg: Buffer) => {
      console.log(msg); // ---------------------------------------------------------------------------------------
      recordUsage(this.apiKey, msg.length);

      const msgType = msg.readUInt8();
      if (!ALLOWED_MESSAGE_TYPES.includes(msgType)) {
        console.log("close <- msgType"); // ---------------------------------------------------------------------------------------
        this.clientWs.close();
      }
      if (msgType === ProtocolMessageTypes.handshake && !this.handshakeOk(msg)) {
        console.log("close <- handshake not ok"); // ---------------------------------------------------------------------------------------
        this.clientWs.close();
      }

      while (this.nodeWs === undefined || this.nodeWs.readyState === WebSocket.CONNECTING) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.nodeWs.send(msg);
    });

    this.nodeWs = new WebSocket('wss://localhost:8444/ws', {
      rejectUnauthorized: false,
      cert: certAndKey.certificate,
      key: certAndKey.key,
    });

    this.nodeWs.on('open', () => this.setupSocketStuff());
  }

  private setupSocketStuff() {
    const id = this.id;

    this.clientWs.on('close', () => {
      console.log("Close clientWs");
      if (this.nodeWs.readyState === WebSocket.OPEN) {
        this.nodeWs.close();
      }
      this.onClose(id);
    });
    this.nodeWs.on('close', () => {
      console.log("Close nodeWs");
      if (this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.close();
      }
    });

    this.nodeWs.on('message', (msg) => {
      recordUsage(this.apiKey, msg.toString('hex').length / 2);
      console.log("Message from node: " + msg.toString("hex"));
      this.clientWs.send(msg);
    });
  }

  private handshakeOk(pckt: Buffer): boolean {
    let p = pckt;
    const msgId = pckt.readUInt8();
    p = pckt.slice(1);
    if (msgId !== ProtocolMessageTypes.handshake) return false;

    // msg id
    if (p.length < 2) return false;
    p = p.slice(2);

    // networkId
    if (p.length < 4) return false;
    const s: number = pckt.readUInt32LE();
    p = p.slice(4);
    if (p.length < s) return false;
    p = p.slice(s);

    // protocolVersion
    if (p.length < 4) return false;
    const s2: number = pckt.readUInt32LE();
    p = p.slice(4);
    if (p.length < s2) return false;
    p = p.slice(s2);

    // softwareVersion
    if (p.length < 4) return false;
    const s3: number = pckt.readUInt32LE();
    p = p.slice(4);
    if (p.length < s3) return false;
    p = p.slice(s3);

    // serverPort
    if (p.length < 2) return false;
    p = p.slice(2);

    // nodeType
    if (p.length < 1) return false;
    const nodeType = p.readUInt8();

    return nodeType === ALLOWED_NODE_TYPE;
  }
}