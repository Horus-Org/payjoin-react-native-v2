// mockDirectory.ts
import express from 'express';

const app = express();
app.use(express.json());

let storedPsbts: { [key: string]: string } = {};

app.post('/v2/submit', (req, res) => {
  const { psbt } = req.body;
  const requestId = Math.random().toString(36).substring(2);
  storedPsbts[requestId] = psbt; // Store PSBT
  res.json({ requestId });
});

app.get('/v2/response/:requestId', (req, res) => {
  const { requestId } = req.params;
  const psbt = storedPsbts[requestId];
  if (psbt) {
    // Simulate receiver modifying PSBT (echoing back for simplicity)
    res.json({ psbt });
    delete storedPsbts[requestId]; // Clean up
  } else {
    res.status(404).json({ error: 'Not ready' });
  }
});

app.listen(3000, () => console.log('Mock PayJoin V2 Directory running on port 3000'));
