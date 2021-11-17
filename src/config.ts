export const MAX_WALLET_CLIENTS = 2; // todo: change to 20

export async function isAPIKeyAllowed(apiKey: string): Promise<boolean> {
  if (apiKey === 'TEST-API-KEY') {
    return true;
  }
  return false;
}

export async function recordUsage(apiKey: string, bytes: number) {
  console.log(`Key ${apiKey}; add usage: ${bytes}`);
}

export async function onClientsChanged() {

}

export async function canReceiveClient() {
  
}