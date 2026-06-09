# CP3 Dry-Run (60 min, 3 people)

1. (10 min) Open `/storyteller` and review aggregate output. Discuss cost projections versus a full pipeline run. Spot-check one Tier 1 hard-fail message and agree on the regeneration strategy.

2. (20 min) Open `/checkpoint-3`. Walk through Message View:
   - Filter to Hard Fail and regenerate or reject.
   - Filter to Soft Fail and spot check five examples.
   - Filter to Diversity Collision and decide tolerance.
   - Spot-check five Tier 1 messages from the highest-quality bucket.

3. (10 min) Switch to Buyer View. Approve buyers whose messages are all reviewed. Note any buyers with persistent issues.

4. (5 min) Mark Operator Review Complete. Curate five sample messages for the client, preferably one LinkedIn connection, one LinkedIn DM, two emails, and one WhatsApp.

5. (10 min) Send to client. Open `/client-review/{token}` in another browser and submit two or three feedback items, including one change request.

6. (5 min) Back in the Operator console, address the change request, edit the message, and resolve feedback.

7. Simulate client final approval by typing a signature name and approving.

8. Operator approves CP3. Verify the Phase 5 Campaign card unlocks on `/pipeline`.

