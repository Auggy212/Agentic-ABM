import { Router } from "express";
import { formatSuccess } from "../../utils/response";

export const messagesRouter = Router();

messagesRouter.post("/messages/generate", (req, res) => {
  res.status(201).json(
    formatSuccess({
      generatedFor: req.body?.contactIds ?? [],
      channels: req.body?.channels ?? ["email"]
    })
  );
});

messagesRouter.get("/messages/:contactId", (req, res) => {
  res.json(
    formatSuccess({
      contactId: req.params.contactId,
      messages: [
        { channel: "email", subject: "Quick idea for pipeline lift", body: "..." },
        { channel: "linkedin", subject: "", body: "Hi there..." }
      ]
    })
  );
});

messagesRouter.put("/messages/:contactId", (req, res) => {
  res.json(
    formatSuccess({
      contactId: req.params.contactId,
      updated: true,
      message: req.body
    })
  );
});
