const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

app.post('/ai-categorizer', async (req, res) => {
  const { ticket_id, subject, description, requester_id } = req.body;

  try {
    // Step 1: Get recent tickets
    const historyResp = await axios.get(
      `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/tickets?requester_id=${requester_id}&per_page=3`,
      {
        auth: { username: FRESHDESK_API_KEY, password: 'X' },
      }
    );

    const recentTickets = historyResp.data
      .map((t) => `• ${t.subject}: ${t.description}`)
      .join('\n');

    // Step 2: Ask OpenAI for ticket type
    const prompt = `
Classify the ticket into one of the following types: "Benefits", "IT", "Payroll", "Hospital Integration". If none match, return "Other".
Ticket description: ${description}
Recent tickets:
${recentTickets}
Return only one of the five options on a single line.
    `;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a support ticket classification assistant.' },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      }
    );

    let category = openaiResp.data.choices[0].message.content.trim();

    // Step 3: Sanitize/validate the result
    const validTypes = ['Benefits', 'IT', 'Payroll', 'Hospital Integration'];
    if (!validTypes.includes(category)) {
      category = 'Other';
    }

    // Step 4: Update the ticket's built-in Type field
    await axios.put(
      `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/tickets/${ticket_id}`,
      { type: category },
      {
        auth: { username: FRESHDESK_API_KEY, password: 'X' },
      }
    );

    res.status(200).send({ message: 'Ticket type updated successfully', type: category });
  } catch (err) {
    console.error('Error updating ticket:', err.response?.data || err.message);
    res.status(500).send({ error: 'Something went wrong', details: err.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
