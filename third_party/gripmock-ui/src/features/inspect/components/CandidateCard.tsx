import { Box, Chip, Typography } from "@mui/material";

import type { InspectCandidate } from "../../../types/inspect";
import type { StubRecord } from "../../../types/entities";

const toJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
};

export const CandidateCard = ({
  candidate,
  stub,
}: {
  candidate: InspectCandidate;
  stub?: StubRecord;
}) => (
  <Box key={candidate.id} p={1} border={1} borderColor="divider" borderRadius={1}>
    <Typography variant="body2" fontWeight={600}>
      {candidate.id}
    </Typography>
    <Typography variant="caption">
      {(candidate.name ? `${candidate.name} - ` : "") + `${candidate.service}/${candidate.method}`} enabled={candidate.enabled ? "true" : "false"} times={candidate.times} used={candidate.used}
    </Typography>
    <Typography variant="caption" display="block">
      specificity={candidate.specificity} score={candidate.score.toFixed(3)}
    </Typography>
    <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
      <Chip
        size="small"
        color={candidate.matched ? "success" : "default"}
        label={candidate.matched ? "matched" : "not matched"}
      />
      <Chip
        size="small"
        color={candidate.visibleBySession ? "success" : "error"}
        label={`session ${candidate.visibleBySession ? "ok" : "fail"}`}
      />
      <Chip
        size="small"
        color={candidate.withinTimes ? "success" : "error"}
        label={`times ${candidate.withinTimes ? "ok" : "fail"}`}
      />
      <Chip
        size="small"
        color={candidate.headersMatched ? "success" : "error"}
        label={`headers ${candidate.headersMatched ? "ok" : "fail"}`}
      />
      <Chip
        size="small"
        color={candidate.inputMatched ? "success" : "error"}
        label={`input ${candidate.inputMatched ? "ok" : "fail"}`}
      />
      {(candidate.excludedBy || []).map((reason) => (
        <Chip key={`${candidate.id}-${reason}`} size="small" color="warning" label={`excluded: ${reason}`} />
      ))}
    </Box>
    {candidate.events && candidate.events.length > 0 && (
      <Box display="flex" gap={0.5} mt={1} flexWrap="wrap">
        {candidate.events.map((event, index) => {
          const color =
            event.result === "passed"
              ? "success"
              : event.result === "failed"
                ? "error"
                : "default";

          return (
            <Chip
              key={`${candidate.id}-${event.stage}-${index}`}
              size="small"
              color={color}
              label={`${event.stage}: ${event.result}${event.reason ? ` (${event.reason})` : ""}`}
            />
          );
        })}
      </Box>
    )}
    {stub ? (
      <Box mt={1}>
        <Typography variant="caption" color="text.secondary">
          Stub matcher/output
        </Typography>
        <Box
          mt={0.5}
          p={0.75}
          border={1}
          borderColor="divider"
          borderRadius={1}
          sx={{
            backgroundColor: "action.hover",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            overflowX: "auto",
          }}
        >
          <pre style={{ margin: 0 }}>
            {toJson({
              headers: stub.headers,
              input: stub.input,
              inputs: stub.inputs,
              output: stub.output,
              options: stub.options,
            })}
          </pre>
        </Box>
      </Box>
    ) : null}
  </Box>
);
