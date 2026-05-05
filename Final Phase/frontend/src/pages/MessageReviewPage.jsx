import MessageReviewPanel from "../components/MessageReviewPanel";

const sampleMessages = [
  {
    id: "msg_1",
    channel: "email",
    subject: "Quick question about pipeline visibility",
    body: "Hi Rahul, noticed ABC is growing quickly. Teams with a strong champion in RevOps often look for cleaner ways to connect attribution, routing, and pipeline reporting.",
    cta: "Would it be useful if I sent over a short example?",
    dayNumber: 1,
    reviewStatus: "approved"
  },
  {
    id: "msg_2",
    channel: "linkedin_dm",
    subject: "",
    body: "Rahul, I had one idea for how ABC could reduce manual reporting overhead while keeping sales and marketing aligned.",
    cta: "Happy to send the short version here.",
    dayNumber: 4,
    reviewStatus: "pending"
  },
  {
    id: "msg_3",
    channel: "whatsapp",
    subject: "",
    body: "Hi Rahul, sharing a quick thought on improving follow-up speed for teams where the champion is driving internal alignment.",
    cta: "Can send details if useful.",
    dayNumber: 7,
    reviewStatus: "rejected"
  }
];

export default function MessageReviewPage() {
  return <MessageReviewPanel contactId="con_2" messages={sampleMessages} />;
}
