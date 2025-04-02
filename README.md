# Payjoin React Native V2

>This project implements Bitcoin PayJoin transactions in TypeScript, supporting both PayJoin V1 (BIP-78) and a preview of PayJoin V2 (BIP-77) using `bitcoinjs-lib` and `axios`. PayJoin enhances transaction privacy by allowing the receiver to contribute inputs to a payment.

#### Features
- **PayJoin V1**: Direct PSBT exchange with a receiver endpoint.
- **PayJoin V2 Preview**: Simulated asynchronous flow via a directory, without Oblivious HTTP (OHTTP) due to lack of native JS support.
- Creates, signs, and broadcasts PSBTs using testnet (configurable for mainnet).
- Fetches UTXOs from Blockstream’s API.
- Generates V2-compatible BIP-21 URIs.

#### Installation
```bash
npm install bitcoinjs-lib axios buffer typescript ts-node
```

#### Usage
1. Save the code as `payjoin.ts`.
2. Replace `senderWIF` and `senderAddress` with testnet credentials.
3. Run:
   ```bash
   ts-node payjoin.ts
   ```

#### Example
```typescript
await executePayJoin(
  'cYourTestnetWIF',           // Sender private key (WIF)
  'tb1q...',                  // Sender address
  'tb1q6rz28mcfaxtmd6v789l9rrlrusd9rarc0mh4d0', // Receiver address
  100000,                     // Amount (satoshis)
  'https://example.com/payjoin', // V1 endpoint
  'v1'                        // Version ('v1' or 'v2')
);
```

#### PayJoin V2 Preview
- **Simulation**: Uses plain HTTP to a mock directory (`http://localhost:3000`) instead of OHTTP.
- **Flow**: Posts PSBT to directory, polls for response, and broadcasts the result.
- **Mock Directory**: Run a local server for testing:
  ```bash
  npm install express
  ts-node mockDirectory.ts
  ```
  Update `PAYJOIN_V2_DIRECTORY` to `http://localhost:3000`.

#### Limitations
- **V2**: Lacks OHTTP (not available in JS). Full V2 requires an OHTTP client and real directory (e.g., `payjoin.org`).
- **Directory**: Simulated; replace with a real V2 directory URL for production.

#### Dependencies
- `bitcoinjs-lib`: Bitcoin transaction handling.
- `axios`: HTTP requests.
- `buffer`: Hex encoding/decoding.

#### Notes
- Tested on testnet; adapt `network` for mainnet.
- Extend with OHTTP support when a JS library becomes available.

--- 
**Warning: This is only preview implementation. It's not live yet.**
