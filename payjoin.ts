import bitcoin from 'bitcoinjs-lib';
import axios from 'axios';
import { Buffer } from 'buffer';

// Define types for UTXO and PayJoin responses
interface Utxo {
  txid: string;
  vout: number;
  hex: string;
  timelock: number;
  amount: number;
  address: string;
  preimage: string;
  scriptPubKey: string;
  confirmations: number;
  is_coinbase: boolean;
  mempool: string;
  height: number;
}

interface PayJoinRequest {
  psbt: string;
}

interface PayJoinResponse {
  psbt: string;
}

interface V2SubmitResponse {
  requestId: string;
}

// Configure Bitcoin network (using testnet as example)
const network = bitcoin.networks.testnet;

// Simulated PayJoin V2 Directory URL (replace with real directory in production)
const PAYJOIN_V2_DIRECTORY = 'https://payjoin.directory/v2'; // Hypothetical URL

// Fetch UTXOs from a blockchain API (Blockstream)
async function fetchUtxos(senderAddress: string): Promise<Utxo[]> {
  try {
    const response = await axios.get(`https://blockstream.info/testnet/api/address/${senderAddress}/utxo`);
    const utxos = response.data.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      hex: '',
      timelock: 0,
      amount: utxo.value,
      address: senderAddress,
      preimage: '',
      scriptPubKey: '',
      confirmations: utxo.status.confirmed ? 6 : 0,
      is_coinbase: false,
      mempool: utxo.status.confirmed ? 'confirmed' : 'pending',
      height: utxo.status.block_height || 0,
    }));

    for (const utxo of utxos) {
      const txResponse = await axios.get(`https://blockstream.info/testnet/api/tx/${utxo.txid}/hex`);
      utxo.hex = txResponse.data;
    }

    return utxos;
  } catch (error) {
    throw new Error(`Failed to fetch UTXOs: ${error}`);
  }
}

// Create initial PSBT (same for V1 and V2)
async function createInitialPayJoinTx(
  senderAddress: string,
  receiverAddress: string,
  amountToSend: number,
  feeRate: number = 1000
): Promise<bitcoin.Psbt> {
  try {
    const psbt = new bitcoin.Psbt({ network });

    const utxos = await fetchUtxos(senderAddress);
    if (!utxos.length) throw new Error('No UTXOs available');

    let totalInput = 0;
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.hex, 'hex'),
      });
      totalInput += utxo.amount;
    }

    psbt.addOutput({ address: receiverAddress, value: amountToSend });

    const estimatedFee = feeRate * 200;
    const change = totalInput - amountToSend - estimatedFee;
    if (change > 546) {
      psbt.addOutput({ address: senderAddress, value: change });
    }

    return psbt;
  } catch (error) {
    throw new Error(`Failed to create initial PSBT: ${error}`);
  }
}

// Send PSBT to PayJoin V1 endpoint
async function sendPayJoinV1Request(psbt: bitcoin.Psbt, endpoint: string): Promise<bitcoin.Psbt> {
  try {
    const response = await axios.post<PayJoinResponse>(
      endpoint,
      { psbt: psbt.toBase64() },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return bitcoin.Psbt.fromBase64(response.data.psbt, { network });
  } catch (error) {
    throw new Error(`PayJoin V1 request failed: ${error}`);
  }
}

// Send PSBT to PayJoin V2 Directory and poll for response (without OHTTP)
async function sendPayJoinV2Request(psbt: bitcoin.Psbt): Promise<bitcoin.Psbt> {
  try {
    // Step 1: Post PSBT to the V2 Directory
    // In a real V2 setup, this would use OHTTP to encapsulate the request
    const postResponse = await axios.post<V2SubmitResponse>(
      `${PAYJOIN_V2_DIRECTORY}/submit`,
      { psbt: psbt.toBase64() },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const requestId = postResponse.data.requestId;
    console.log(`V2 Request submitted, ID: ${requestId}`);

    // Step 2: Poll the directory for the receiver's response
    // With OHTTP, this would involve fetching via an OHTTP relay
    const maxAttempts = 10;
    const pollInterval = 5000; // 5 seconds
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Polling attempt ${attempt}/${maxAttempts}...`);
      try {
        const pollResponse = await axios.get<PayJoinResponse>(
          `${PAYJOIN_V2_DIRECTORY}/response/${requestId}`
        );

        if (pollResponse.data.psbt) {
          console.log('V2 Response received');
          return bitcoin.Psbt.fromBase64(pollResponse.data.psbt, { network });
        }
      } catch (pollError) {
        console.log(`Poll attempt ${attempt} failed, retrying...`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('V2 response timeout: Receiver did not respond');
  } catch (error) {
    throw new Error(`PayJoin V2 request failed: ${error}`);
  }
}

// Broadcast transaction
async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await axios.post('https://blockstream.info/testnet/api/tx', txHex);
    return response.data; // Returns txid
  } catch (error) {
    throw new Error(`Broadcast failed: ${error}`);
  }
}

// Finalize, sign, and broadcast
async function finalizeAndBroadcast(
  modifiedPsbt: bitcoin.Psbt,
  senderKeyPair: bitcoin.ECPairInterface
): Promise<string> {
  try {
    modifiedPsbt.signAllInputs(senderKeyPair);
    modifiedPsbt.finalizeAllInputs();
    const tx = modifiedPsbt.extractTransaction();
    const txHex = tx.toHex();
    return await broadcastTransaction(txHex);
  } catch (error) {
    throw new Error(`Failed to finalize and broadcast: ${error}`);
  }
}

// Execute PayJoin (V1 or V2 based on version parameter)
async function executePayJoin(
  senderWIF: string,
  senderAddress: string,
  receiverAddress: string,
  amount: number,
  payjoinEndpoint: string,
  version: 'v1' | 'v2' = 'v1'
) {
  try {
    const senderKeyPair = bitcoin.ECPair.fromWIF(senderWIF, network);
    const initialPsbt = await createInitialPayJoinTx(senderAddress, receiverAddress, amount);

    let modifiedPsbt: bitcoin.Psbt;
    if (version === 'v2') {
      console.log('Executing PayJoin V2 (simulated without OHTTP)...');
      modifiedPsbt = await sendPayJoinV2Request(initialPsbt);
    } else {
      console.log('Executing PayJoin V1...');
      modifiedPsbt = await sendPayJoinV1Request(initialPsbt, payjoinEndpoint);
    }

    const txid = await finalizeAndBroadcast(modifiedPsbt, senderKeyPair);
    console.log(`Transaction broadcasted: ${txid}`);
    return txid;
  } catch (error) {
    console.error(`PayJoin failed: ${error}`);
    throw error;
  }
}

// Generate a PayJoin V2 URI (for receiver to share)
function generatePayJoinV2Uri(receiverAddress: string, amount: number): string {
  // In a real V2 setup, this would include OHTTP relay info and directory-specific params
  return `bitcoin:${receiverAddress}?amount=${amount / 100000000}&pj=${PAYJOIN_V2_DIRECTORY}`;
}

// Example usage with V2 preview
async function runExample() {
  const senderWIF = 'cYourTestnetWIF'; // Replace with real testnet WIF
  const senderAddress = 'tb1q...'; // Replace with sender address
  const receiverAddress = 'tb1q6rz28mcfaxtmd6v789l9rrlrusd9rarc0mh4d0';
  const amount = 100000; // 0.001 BTC in satoshis

  // Generate V2 URI (for receiver to share with sender)
  const v2Uri = generatePayJoinV2Uri(receiverAddress, amount);
  console.log(`PayJoin V2 URI: ${v2Uri}`);

  // V1 Example
  await executePayJoin(
    senderWIF,
    senderAddress,
    receiverAddress,
    amount,
    'https://example.com/payjoin', // V1 endpoint
    'v1'
  );

  // V2 Preview (simulated without OHTTP)
  await executePayJoin(
    senderWIF,
    senderAddress,
    receiverAddress,
    amount,
    '', // Endpoint ignored for V2
    'v2'
  );
}

// Run the example
runExample().catch(console.error);

export {
  createInitialPayJoinTx,
  sendPayJoinV1Request,
  sendPayJoinV2Request,
  finalizeAndBroadcast,
  broadcastTransaction,
  fetchUtxos,
  executePayJoin,
  generatePayJoinV2Uri,
};
