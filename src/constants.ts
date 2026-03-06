import { Type } from "@google/genai";

export const BUSINESS_INFO = {
  name: "Lumina Wellness Center",
  services: [
    { name: "Massage Therapy", price: "$80/hr", duration: "60 min" },
    { name: "Acupuncture", price: "$95/session", duration: "45 min" },
    { name: "Nutrition Coaching", price: "$120/session", duration: "60 min" }
  ],
  hours: "Monday-Friday: 9 AM - 7 PM, Saturday: 10 AM - 4 PM, Sunday: Closed",
  location: "123 Serenity Lane, Wellness City",
  phone: "(555) 012-3456"
};

export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "book_appointment",
        description: "Books a new appointment for a customer.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Full name of the customer" },
            date: { type: Type.STRING, description: "Date of the appointment (YYYY-MM-DD)" },
            time: { type: Type.STRING, description: "Time of the appointment (e.g., 2:00 PM)" },
            service: { type: Type.STRING, description: "The service requested" }
          },
          required: ["name", "date", "time", "service"]
        }
      },
      {
        name: "request_callback",
        description: "Requests a human staff member to call the customer back.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the customer" },
            phone: { type: Type.STRING, description: "Phone number to call back" },
            reason: { type: Type.STRING, description: "Reason for the callback" }
          },
          required: ["name", "phone", "reason"]
        }
      },
      {
        name: "get_business_info",
        description: "Returns information about the business, services, hours, and location.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      }
    ]
  }
];

export const SYSTEM_INSTRUCTION = `
You are "Lumina AI", the professional voice receptionist for Lumina Wellness Center.
Your goal is to assist customers who call when a human is unavailable.

TONE AND STYLE:
- Professional, warm, and helpful.
- Keep responses concise and natural for a voice conversation.
- Do not use complex formatting or long lists; summarize information.

CAPABILITIES:
1. Answer questions about services, hours, and location using 'get_business_info'.
2. Book appointments using 'book_appointment'.
3. If a customer wants to speak to a human or has a complex issue, offer a callback using 'request_callback'.

GUIDELINES:
- If you book an appointment or schedule a callback, confirm the details back to the user.
- If you encounter an error, politely inform the user and offer to take a callback request instead.
- Always be polite and end the call gracefully if the user is finished.
- Today is ${new Date().toLocaleDateString()}.
`;
