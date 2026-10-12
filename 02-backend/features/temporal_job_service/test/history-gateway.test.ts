import { describe, expect, test } from "bun:test";
import type { PayloadCodec } from "@temporalio/common";
import { temporal } from "@temporalio/proto";

import { resolveHistoryEvents } from "../src/archival/history-gateway.ts";

describe("Temporal Job archive history", () => {
  test("resolves external payloads and emits the incumbent history JSON", async () => {
    const reference = temporal.api.common.v1.Payload.create({
      metadata: {
        encoding: new TextEncoder().encode("binary/s3-reference"),
        "s3-key": new TextEncoder().encode("payloads/test"),
      },
      data: new Uint8Array(),
    });
    const history = temporal.api.history.v1.History.create({
      events: [
        temporal.api.history.v1.HistoryEvent.fromObject({
          eventId: 1,
          eventType: temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
          workflowExecutionStartedEventAttributes: {
            input: { payloads: [reference] },
          },
        }),
      ],
    });
    const decoded = temporal.api.common.v1.Payload.create({
      metadata: { encoding: new TextEncoder().encode("json/plain") },
      data: new TextEncoder().encode('{"hello":"world"}'),
    });
    const codec: PayloadCodec = {
      encode: async (payloads) => payloads,
      async decode(payloads) {
        return payloads.map(() => decoded);
      },
    };

    expect(await resolveHistoryEvents(history, codec)).toEqual([
      {
        event_id: "1",
        event_type: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
        workflow_execution_started_event_attributes: {
          input: {
            payloads: [
              {
                metadata: { encoding: "anNvbi9wbGFpbg==" },
                data: "eyJoZWxsbyI6IndvcmxkIn0=",
                decoded: { hello: "world" },
              },
            ],
          },
        },
      },
    ]);
  });
});
