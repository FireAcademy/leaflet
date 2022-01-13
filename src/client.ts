import { WebSocket } from 'ws';
import { ALLOWED_MESSAGE_TYPES, ALLOWED_NODE_TYPE } from './allowed_message_types';
import { CertAndKey } from './cert_manager';
import { ProtocolMessageTypes } from './protocol_message_types';
import { v4 as uuidv4 } from 'uuid';
/*
generate a new cert for each client (simulate a new 'peer')
get data from clientWs -> decode + verify -> pass it to nodeWs
receive data from nodeWs -> send it to clientWs
*/

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class Client {
  private readonly clientWs: WebSocket; // user <-> this machine
  private readonly nodeWs: WebSocket; // this process <-> full node 8444
  private readonly apiKey: string;
  private readonly onClose: (id: string) => void;
  private readonly recordUsage: (apiKey: string, bytes: number) => Promise<boolean>;
  public id: string;

  constructor(
    ws: WebSocket,
    certAndKey: CertAndKey,
    apiKey: string,
    onClose: (id: string) => void,
    recordUsage: (apiKey: string, bytes: number) => Promise<boolean>,
  ) {
    this.clientWs = ws;
    this.apiKey = apiKey;
    this.onClose = onClose;
    this.id = uuidv4();
    this.recordUsage = recordUsage;

    // setup ASAP
    this.clientWs.on('message', async (msg: Buffer) => {
      if (!(await this.recordUsage(this.apiKey, msg.length))) {
        this.clientWs.close();
      }

      const msgType = msg.readUInt8();
      if (!ALLOWED_MESSAGE_TYPES.includes(msgType)) {
        await sleep(1000);
        this.clientWs.close();
      }
      if (msgType === ProtocolMessageTypes.handshake && !this.handshakeOk(msg)) {
        await sleep(1000);
        this.clientWs.close();
      }

      while (this.nodeWs === undefined || this.nodeWs.readyState === WebSocket.CONNECTING) {
        await sleep(100);
      }
      this.nodeWs.send(msg);
      this.checkSocketsReadyState();
    });

    this.nodeWs = new WebSocket('wss://localhost:8444/ws', {
      rejectUnauthorized: false,
      cert: certAndKey.certificate,
      key: certAndKey.key,
    });

    this.nodeWs.on('open', () => this.setupSocketStuff());
  }

  private checkSocketsReadyState() {
    if (this.nodeWs.readyState !== WebSocket.OPEN) {
      this.clientWs.close();
    }
    if (this.clientWs.readyState !== WebSocket.OPEN) {
      this.nodeWs.close();
    }
  }

  private setupSocketStuff() {
    const id = this.id;

    this.clientWs.on('close', () => {
      this.checkSocketsReadyState();
      this.onClose(id);
    });
    this.nodeWs.on('close', () => {
      this.checkSocketsReadyState();
    });

    this.nodeWs.on('message', async (msg) => {
      if (!(await this.recordUsage(this.apiKey, msg.toString('hex').length / 2))) {
        this.clientWs.close();
        return;
      }
      this.clientWs.send(msg);
      this.checkSocketsReadyState();
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