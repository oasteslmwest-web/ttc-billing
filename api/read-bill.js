export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST method required"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Bill image is required"
      });
    }

    const prompt = `
You are an expert Indian handwritten bill reader.

Read the uploaded handwritten vegetable/grocery/dairy/housekeeping bill image carefully.

Your job is to extract the bill table EXACTLY as written.

For every row identify:

1. item
2. qty
3. unit
4. rate
5. amount

IMPORTANT RULES:

- Read handwriting using the complete visual context of the bill.
- Do NOT use OCR-style character guessing alone.
- Understand the table columns and row alignment.
- RATE is the number written in the Rate column.
- AMOUNT is the number written in the Amount column.
- Do NOT calculate Rate from Amount / Qty unless the handwritten rate is genuinely unreadable.
- If the handwritten amount is readable, return that exact amount.
- Preserve decimal values if present.
- Preserve the original row order.
- Ignore empty rows.
- Do not invent products that are not visible.
- If a value is unclear, return an empty string instead of guessing.
- The final total should be read from the bill if visible.

The output must contain ONLY valid JSON matching the requested schema.
`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-6-luna",

          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                },
                {
                  type: "input_image",
                  image_url: image,
                  detail: "high"
                }
              ]
            }
          ],

          text: {
            format: {
              type: "json_schema",
              name: "handwritten_bill",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        item: {
                          type: "string"
                        },
                        qty: {
                          type: "string"
                        },
                        unit: {
                          type: "string"
                        },
                        rate: {
                          type: "string"
                        },
                        amount: {
                          type: "string"
                        }
                      },
                      required: [
                        "item",
                        "qty",
                        "unit",
                        "rate",
                        "amount"
                      ]
                    }
                  },
                  total: {
                    type: "string"
                  }
                },
                required: [
                  "rows",
                  "total"
                ]
              }
            }
          }
        })
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OpenAI API error:", data);

      return res.status(openaiResponse.status).json({
        error: data?.error?.message || "OpenAI API request failed"
      });
    }

    let resultText = data.output_text;

    if (!resultText) {
      return res.status(500).json({
        error: "AI returned no result"
      });
    }

    let billData;

    try {
      billData = JSON.parse(resultText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);

      return res.status(500).json({
        error: "AI returned invalid JSON"
      });
    }

    return res.status(200).json({
      success: true,
      data: billData
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: error?.message || "Server error"
    });
  }
                  }
