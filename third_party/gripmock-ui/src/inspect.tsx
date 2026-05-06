import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  FormControlLabel,
  Switch,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDataProvider, useGetMany, useNotify } from "react-admin";
import type { InspectResponse } from "./types/inspect";
import { ServiceMethodSelectors } from "./components/inputs/ServiceMethodSelectors";
import { buildCandidateStats, candidateMatchesFilter, parseJsonObject } from "./features/inspect/utils";
import { CandidateCard } from "./features/inspect/components/CandidateCard";
import type { StubRecord } from "./types/entities";

export const InspectPage = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [service, setService] = useState("");
  const [method, setMethod] = useState("");
  const [payload, setPayload] = useState('{\n  "name": "Alex"\n}');
  const [headers, setHeaders] = useState("{}");
  const [session, setSession] = useState("");
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  const [strictRouteOnly, setStrictRouteOnly] = useState(true);
  const [loadStubDetails, setLoadStubDetails] = useState(true);
  const [result, setResult] = useState<InspectResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const payloadValidation = useMemo(() => parseJsonObject(payload), [payload]);
  const headersValidation = useMemo(() => parseJsonObject(headers), [headers]);

  const filteredCandidates = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.candidates.filter((candidate) => {
      if (strictRouteOnly && (candidate.service !== service || candidate.method !== method)) {
        return false;
      }

      return candidateMatchesFilter(candidate, candidateQuery, onlyMatched, onlyExcluded);
    });
  }, [candidateQuery, method, onlyExcluded, onlyMatched, result, service, strictRouteOnly]);

  const visibleCandidates = showAllCandidates ? filteredCandidates : filteredCandidates.slice(0, 10);

  const candidateStats = useMemo(() => buildCandidateStats(result), [result]);

  const detailIDs = useMemo(
    () =>
      loadStubDetails && result
        ? Array.from(new Set(result.candidates.map((candidate) => candidate.id).filter(Boolean)))
        : [],
    [loadStubDetails, result],
  );

  const {
    data: stubDetailsData = [],
    isPending: stubDetailsLoading,
    error: stubDetailsError,
  } = useGetMany<StubRecord>(
    "stubs",
    { ids: detailIDs },
    {
      enabled: loadStubDetails && detailIDs.length > 0,
      retry: false,
    },
  );

  const stubDetailsByID = useMemo(
    () =>
      (stubDetailsData || []).reduce<Record<string, StubRecord>>((carry, stub) => {
        if (stub?.id) {
          carry[String(stub.id)] = stub;
        }

        return carry;
      }, {}),
    [stubDetailsData],
  );

  const onSubmit = async () => {
    const parsedPayload = payloadValidation;
    if (parsedPayload.error) {
      setErrorMessage(parsedPayload.error);
      setResult(null);
      return;
    }

    const parsedHeaders = headersValidation;
    if (parsedHeaders.error) {
      setErrorMessage(parsedHeaders.error);
      setResult(null);
      return;
    }

    try {
      const response = await dataProvider.create("inspect", {
        data: {
          service,
          method,
          input: [parsedPayload.value],
          headers:
            Object.keys(parsedHeaders.value).length === 0
              ? undefined
              : parsedHeaders.value,
          session: session || undefined,
        },
      });

      setResult(response.data as InspectResponse);
      setErrorMessage(null);
      setShowAllCandidates(false);
      setCandidateQuery("");
      setOnlyMatched(false);
      setOnlyExcluded(false);
    } catch (error) {
      const message = (error as Error).message;
      setErrorMessage(message);
      setResult(null);
      notify(message, { type: "error" });
    }
  };

  return (
    <Box p={1.5}>
      <Stack spacing={1.5}>
        <Card>
          <CardHeader title="Stub Inspector (Experimental API)" />
          <CardContent>
            <Stack spacing={1.5}>
              <Alert severity="warning">
                The inspect API is experimental and may change or be removed in future releases.
              </Alert>
              <ServiceMethodSelectors
                service={service}
                method={method}
                onServiceChange={setService}
                onMethodChange={setMethod}
              />
              <TextField
                label="Session (optional)"
                value={session}
                onChange={(event) => setSession(event.target.value)}
                fullWidth
              />
              <TextField
                label="Request payload JSON"
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                error={Boolean(payloadValidation.error)}
                helperText={payloadValidation.error || "Unary call: one object. Streaming can be tested via input[] in raw API."}
                fullWidth
                multiline
                minRows={6}
              />
              <TextField
                label="Request headers JSON (optional)"
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
                error={Boolean(headersValidation.error)}
                helperText={headersValidation.error || "These are matching headers inside request body, not HTTP transport headers."}
                fullWidth
                multiline
                minRows={3}
              />
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button
                  size="small"
                  onClick={() => {
                    setPayload('{\n  "name": "Alex"\n}');
                    setHeaders("{}");
                    setSession("");
                  }}
                >
                  Load default example
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setPayload('{\n  "name": "Alex"\n}');
                    setHeaders('{\n  "x-env": "prod"\n}');
                  }}
                >
                  Header match example
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setPayload("{}");
                    setHeaders("{}");
                    setSession("");
                  }}
                >
                  Clear form
                </Button>
              </Box>
              <Button variant="contained" onClick={onSubmit} disabled={!service || !method}>
                Inspect matching
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        {result && (
          <Card>
            <CardHeader title="Inspection result" />
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {result.error && <Chip color="error" label={`Error: ${result.error}`} />}
                  <Chip
                    color={result.matchedStubId ? "success" : "default"}
                    label={result.matchedStubId ? `Matched: ${result.matchedStubId}` : "Matched: none"}
                  />
                  {result.similarStubId && <Chip color="warning" label={`Next: ${result.similarStubId}`} />}
                  {result.fallbackToMethod && <Chip color="info" label="Fallback: method-only" />}
                </Box>

                {candidateStats && (
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip size="small" label={`Candidates: ${candidateStats.total}`} />
                    <Chip size="small" color="success" label={`Matched: ${candidateStats.matched}`} />
                    <Chip size="small" label={`Visible by session: ${candidateStats.visibleBySession}`} />
                    <Chip size="small" label={`Within times: ${candidateStats.withinTimes}`} />
                    <Chip size="small" label={`Headers matched: ${candidateStats.headersMatched}`} />
                    <Chip size="small" label={`Input matched: ${candidateStats.inputMatched}`} />
                  </Box>
                )}

                <Divider />

                <Box>
                  <Typography variant="subtitle1">Filter stages</Typography>
                  <Stack spacing={1}>
                    {result.stages.map((stage) => (
                      <Box key={stage.name} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography variant="body2" fontWeight={600} minWidth={140}>
                          {stage.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {stage.before} in
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          -&gt; {stage.after} left
                        </Typography>
                        {stage.removed > 0 && <Chip size="small" color="warning" label={`removed ${stage.removed}`} />}
                      </Box>
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle1">Candidates</Typography>
                  <Stack spacing={1} mb={1}>
                    <TextField
                      label="Search candidates"
                      value={candidateQuery}
                      onChange={(event) => setCandidateQuery(event.target.value)}
                      size="small"
                      fullWidth
                    />
                    <Box display="flex" gap={1} flexWrap="wrap">
                      <FormControlLabel
                        control={<Switch checked={onlyMatched} onChange={(event) => setOnlyMatched(event.target.checked)} />}
                        label="Only matched"
                      />
                      <FormControlLabel
                        control={<Switch checked={onlyExcluded} onChange={(event) => setOnlyExcluded(event.target.checked)} />}
                        label="Only excluded"
                      />
                      <FormControlLabel
                        control={<Switch checked={strictRouteOnly} onChange={(event) => setStrictRouteOnly(event.target.checked)} />}
                        label="Only this service/method"
                      />
                      <FormControlLabel
                        control={<Switch checked={loadStubDetails} onChange={(event) => setLoadStubDetails(event.target.checked)} />}
                        label="Load stub payload details"
                      />
                      <Chip size="small" label={`Visible: ${filteredCandidates.length}/${result.candidates.length}`} />
                      {loadStubDetails && <Chip size="small" label={stubDetailsLoading ? "details: loading" : "details: loaded"} />}
                    </Box>
                    {stubDetailsError ? <Alert severity="warning">{(stubDetailsError as Error).message || "Failed to load stub details"}</Alert> : null}
                  </Stack>
                  <Stack spacing={1}>
                    {visibleCandidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        stub={stubDetailsByID[candidate.id]}
                      />
                    ))}
                    {filteredCandidates.length === 0 && (
                      <Alert severity="info">No candidates match current filters.</Alert>
                    )}
                    {filteredCandidates.length > 10 && (
                      <Button size="small" onClick={() => setShowAllCandidates((value) => !value)}>
                        {showAllCandidates
                          ? "Show less"
                          : `Show all (${filteredCandidates.length})`}
                      </Button>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
};
