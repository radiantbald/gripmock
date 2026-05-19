import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import SaveIcon from "@mui/icons-material/Save";
import {
  List,
  Create,
  Edit,
  SimpleForm,
  Toolbar,
  TextInput,
  BooleanInput,
  TopToolbar,
  ExportButton,
  CreateButton,
  AutocompleteInput,
  useGetList,
  useDataProvider,
  useNotify,
  useRecordContext,
  useCreatePath,
  useRedirect,
} from "react-admin";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useFormContext } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";

import { downloadJsonFile } from "./utils/fileDownload";
import { apiClient } from "./dataProvider/apiClient";
import { listContentSx } from "./components/table/listStyles";
import { listActionButtonSx } from "./components/table/listActionButtonSx";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import type { StubRecord } from "./types/entities";
import { StubsDatagrid } from "./features/stubs/components/StubsDatagrid";
import { StubFormLayout, stubFormSx } from "./features/stubs/components/StubFormLayout";
import { setStubCreatedSignal, setStubEditedSignal, setStubReplacedSignal } from "./utils/stubEditSignal";
import { EntityEmptyState } from "./components/empty/EntityEmptyState";
import { getCurrentRoom, subscribeRoomChanges } from "./utils/room";
const stubsListSx = {
  ...listContentSx,
  height: "100%",
  "& .RaList-toolbar": {
    minHeight: 40,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: "center",
  },
  "& .RaList-actions": {
    minHeight: 40,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    display: "flex",
    alignItems: "center",
  },
  "& .RaList-actions .MuiToolbar-root": {
    minHeight: "32px !important",
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
  },
  "& .RaList-main": {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  "& .RaList-content": {
    ...listContentSx["& .RaList-content"],
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
} as const;

// Export function for stubs list
const exportStubs = (stubs: object[]) => {
  downloadJsonFile(stubs, "stubs-export.json");
};

const PLAIN_MILLISECONDS_RE = /^\d+(\.\d+)?$/;
const MATCHER_ANY_OF_MODE_KEY = "__anyOfEnabled";
const MATCHER_SCALAR_KEYS = ["equals", "contains"] as const;

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stripMatcherUiKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripMatcherUiKeys(entry));
  }
  if (!isRecordValue(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === MATCHER_ANY_OF_MODE_KEY) {
      continue;
    }
    next[key] = stripMatcherUiKeys(raw);
  }

  return next;
};

const serializeMatcherForApi = (value: unknown): unknown => {
  const stripped = stripMatcherUiKeys(value);
  if (!isRecordValue(value) || !isRecordValue(stripped)) {
    return stripped;
  }

  const anyOfEnabled = value[MATCHER_ANY_OF_MODE_KEY] === true;
  if (!anyOfEnabled) {
    delete stripped.anyOf;
    return stripped;
  }

  const anyOfRules: Record<string, unknown>[] = [];
  for (const key of MATCHER_SCALAR_KEYS) {
    const section = stripped[key];
    if (!isRecordValue(section) || Object.keys(section).length === 0) {
      continue;
    }
    anyOfRules.push({ [key]: section });
    delete stripped[key];
  }

  if (anyOfRules.length > 0) {
    stripped.anyOf = anyOfRules;
  } else {
    delete stripped.anyOf;
  }

  return stripped;
};

const normalizeDelayValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (!PLAIN_MILLISECONDS_RE.test(trimmed)) {
    return trimmed;
  }

  const numericMilliseconds = Number.parseFloat(trimmed);
  return Number.isNaN(numericMilliseconds) ? trimmed : numericMilliseconds;
};

const normalizeStubDelay = <T extends Record<string, unknown>>(data: T): T => {
  const output = data.output;
  const normalizedInput = serializeMatcherForApi(data.input);
  const normalizedInputs = serializeMatcherForApi(data.inputs);

  return {
    ...data,
    input: normalizedInput,
    inputs: normalizedInputs,
    output: {
      ...(isRecordValue(output) ? output : {}),
      delay: normalizeDelayValue(isRecordValue(output) ? output.delay : undefined),
    },
  };
};

const normalizeTextValue = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const resolveReturnPathFromLocationState = (state: unknown, fallbackPath: string): string =>
  typeof state === "object" &&
  state !== null &&
  "returnTo" in state &&
  typeof (state as { returnTo?: unknown }).returnTo === "string"
    ? (state as { returnTo: string }).returnTo
    : fallbackPath;

const STUBS_SELECTION_STORAGE_KEY = "gripmock.ui.stubs.selectionByRoom";

const selectionRoomKey = (room: string): string => room.trim() || "__global__";

const rememberStubsSelection = (service: unknown, method: unknown): void => {
  const normalizedService = typeof service === "string" ? service.trim() : "";
  const normalizedMethod = typeof method === "string" ? method.trim() : "";
  if (!normalizedService || !normalizedMethod) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  try {
    const room = getCurrentRoom().trim();
    const roomKey = selectionRoomKey(room);
    const raw = window.localStorage.getItem(STUBS_SELECTION_STORAGE_KEY);
    const current =
      raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : {};

    current[roomKey] = { service: normalizedService, method: normalizedMethod };
    window.localStorage.setItem(STUBS_SELECTION_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage failures.
  }
};

const DEFAULT_OUTPUT_TEMPLATE = {
  headers: {},
  error: "",
  code: 0,
};

// Service Autocomplete Filter
const NameFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="name" label="Name" />;

  const names = Array.from(
    new Set(stubs?.map((stub) => stub.name).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="name"
      label="Name"
      choices={names.map((name) => ({ id: name, name }))}
    />
  );
};

// Service Autocomplete Filter
const ServiceFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="service" label="Service" />;

  // Extract unique services from stubs
  const services = Array.from(
    new Set(stubs?.map((stub) => stub.service).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="service"
      label="Service"
      choices={services.map((service) => ({ id: service, name: service }))}
    />
  );
};

// Method Autocomplete Filter
const MethodFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="method" label="Method" />;

  // Extract unique methods from stubs
  const methods = Array.from(
    new Set(stubs?.map((stub) => stub.method).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="method"
      label="Method"
      choices={methods.map((method) => ({ id: method, name: method }))}
    />
  );
};

// Filters for stubs
const stubFilters = [
  <NameFilter key="name" source="name" label="Name" />,
  <ServiceFilter key="service" source="service" label="Service" />,
  <MethodFilter key="method" source="method" label="Method" />,
];

const StubListActions = () => (
  <TopToolbar>
    <ExportButton sx={listActionButtonSx} />
    <CreateButton sx={listActionButtonSx} />
  </TopToolbar>
);

// Custom toolbar for used/unused stubs (without create button)
const UsedUnusedStubListActions = () => (
  <TopToolbar>
    <ExportButton sx={listActionButtonSx} />
  </TopToolbar>
);

const stubToolbarContainerSx = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  minHeight: 54,
  py: 0.625,
  px: 1.25,
  gap: 1.5,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "10px",
  backgroundColor: "transparent",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.04) inset",
  "& .ra-input": {
    my: 0,
  },
} as const;

const primaryToolbarButtonSx = {
  textTransform: "none",
  px: 2.25,
  minWidth: 90,
  fontWeight: 600,
} as const;

const secondaryToolbarButtonSx = {
  textTransform: "none",
  px: 2,
  minWidth: 84,
  borderColor: "divider",
} as const;

const deleteToolbarButtonSx = {
  textTransform: "none",
  px: 2,
  minWidth: 90,
  borderColor: "error.main",
} as const;

const CreateStubToolbar = () => (
  <CreateStubToolbarImpl />
);

const CreateStubToolbarImpl = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const createPath = useCreatePath();
  const {
    formState: { isSubmitting },
  } = useFormContext();
  const stubsListPath = createPath({ resource: "stubs", type: "list" });
  const returnPath = resolveReturnPathFromLocationState(location.state, stubsListPath);

  return (
    <Toolbar
    sx={{
      ...stubToolbarContainerSx,
      justifyContent: "space-between",
      "& .ra-input-enable": {
        my: 0,
        display: "flex",
        alignItems: "center",
        height: "100%",
      },
      "& .MuiFormControlLabel-root": {
        my: 0,
        height: "100%",
        display: "flex",
        alignItems: "center",
      },
      "& .MuiSwitch-root": {
        my: 0,
      },
      "& .MuiFormControlLabel-label": {
        lineHeight: 1,
      },
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <BooleanInput
        source="enabled"
        label="Enable Stub"
        helperText={false}
        defaultValue
        sx={{ my: 0 }}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={isSubmitting}
        sx={primaryToolbarButtonSx}
        startIcon={<SaveIcon />}
      >
        Save
      </Button>
      <Button
        type="button"
        variant="outlined"
        disabled={isSubmitting}
        sx={secondaryToolbarButtonSx}
        onClick={() => navigate(returnPath)}
      >
        Cancel
      </Button>
    </Box>
    <Button
      type="button"
      variant="outlined"
      color="error"
      disabled
      aria-hidden="true"
      tabIndex={-1}
      sx={{ ...deleteToolbarButtonSx, visibility: "hidden", pointerEvents: "none" }}
    >
      Delete
    </Button>
  </Toolbar>
  );
};

const EditStubToolbar = ({ canToggleEnabled }: { canToggleEnabled: boolean }) => (
  <EditStubToolbarImpl canToggleEnabled={canToggleEnabled} />
);

const EditStubToolbarImpl = ({ canToggleEnabled }: { canToggleEnabled: boolean }) => {
  const {
    handleSubmit,
    getValues,
    formState: { isDirty },
  } = useFormContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const location = useLocation();
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const stubsListPath = createPath({ resource: "stubs", type: "list" });
  const returnPath = resolveReturnPathFromLocationState(location.state, stubsListPath);
  const record = useRecordContext<StubRecord>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleSave = handleSubmit(async (formValues) => {
    if (!isDirty) {
      const values = getValues() as Record<string, unknown>;
      rememberStubsSelection(values.service, values.method);
      navigate(returnPath);
      return;
    }

    const id = record?.id;
    if (id === undefined || id === null) {
      notify("Stub id is missing, cannot save", { type: "error" });
      return;
    }

    setSaving(true);
    try {
      const values = normalizeStubDelay(formValues as Record<string, unknown>);
      const response = await dataProvider.update("stubs", {
        id,
        data: values,
        previousData: record as Record<string, unknown>,
      });

      const savedStubId = String((response?.data as { id?: string | number } | undefined)?.id ?? id).trim();
      if (savedStubId) {
        setStubEditedSignal(savedStubId);
      }

      const wasEnabled = record?.enabled === true;
      const becomesEnabled = values.enabled === true;
      const serviceChanged = normalizeTextValue(values.service) !== normalizeTextValue(record?.service);
      const methodChanged = normalizeTextValue(values.method) !== normalizeTextValue(record?.method);
      const shouldSetReplacedSignal = becomesEnabled && (!wasEnabled || serviceChanged || methodChanged);
      if (shouldSetReplacedSignal) {
        setStubReplacedSignal(String(values.service || ""), String(values.method || ""));
      }
      navigate(returnPath);
    } catch (error) {
      notify((error as Error).message || "Failed to save stub", { type: "error" });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Toolbar
      sx={{
        ...stubToolbarContainerSx,
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <BooleanInput
          source="enabled"
          label="Enable Stub"
          helperText={false}
          disabled={!canToggleEnabled}
          sx={{ my: 0 }}
        />
        <Button
          type="button"
          variant="contained"
          disabled={saving || deleting}
          sx={primaryToolbarButtonSx}
          startIcon={<SaveIcon />}
          onClick={() => {
            void handleSave();
          }}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="outlined"
          disabled={saving || deleting}
          sx={secondaryToolbarButtonSx}
          onClick={() => {
            const values = getValues() as Record<string, unknown>;
            rememberStubsSelection(values.service, values.method);
            navigate(returnPath);
          }}
        >
          Cancel
        </Button>
      </Box>
      <Button
        type="button"
        variant="outlined"
        color="error"
        disabled={saving || deleting}
        sx={deleteToolbarButtonSx}
        onClick={async () => {
          const id = record?.id;
          if (id === undefined || id === null) {
            notify("Stub id is missing, cannot delete", { type: "error" });
            return;
          }

          setDeleting(true);
          try {
            await dataProvider.delete("stubs", {
              id,
              previousData: record as StubRecord,
            });
            notify("Stub deleted", { type: "success" });
            const values = getValues() as Record<string, unknown>;
            rememberStubsSelection(values.service, values.method);
            navigate(returnPath);
          } catch (error) {
            notify((error as Error).message || "Failed to delete stub", { type: "error" });
          } finally {
            setDeleting(false);
          }
        }}
      >
        Delete
      </Button>
    </Toolbar>
  );
};

const StubsListPage = ({
  actions,
  allowClone,
  empty,
}: {
  actions: ReactElement;
  allowClone?: boolean;
  empty?: ReactElement;
}) => {
  const gridSize = "small";

  return (
    <List
      filters={stubFilters}
      actions={actions}
      exporter={exportStubs}
      perPage={1000}
      pagination={false}
      empty={empty}
      sx={stubsListSx}
    >
      <ActiveFiltersSummary />
      <StubsDatagrid
        gridSize={gridSize}
        allowClone={allowClone}
      />
    </List>
  );
};

const StubsEmptyState = () => {
  const createPath = useCreatePath();
  const redirect = useRedirect();

  return (
    <EntityEmptyState
      icon={<InboxOutlinedIcon />}
      title="No Stubs yet."
      description="Do you want to add one?"
      actionLabel="Create"
      actionStartIcon={<AddIcon />}
      onAction={() =>
        redirect(
          createPath({
            resource: "stubs",
            type: "create",
          }),
        )
      }
    />
  );
};

// Stub List component
export const StubList = () => {
  return (
    <StubsListPage
      actions={<StubListActions />}
      allowClone
      empty={<StubsEmptyState />}
    />
  );
};

// Used Stubs List component
export const UsedStubList = () => {
  return (
    <StubsListPage
      actions={<UsedUnusedStubListActions />}
    />
  );
};

// Unused Stubs List component
export const UnusedStubList = () => {
  return (
    <StubsListPage
      actions={<UsedUnusedStubListActions />}
    />
  );
};

// Stub Create component
export const StubCreate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const createPath = useCreatePath();
  const stubsListPath = createPath({ resource: "stubs", type: "list" });
  const returnPath = resolveReturnPathFromLocationState(location.state, stubsListPath);
  const prefillService =
    typeof location.state === "object" && location.state !== null
      ? normalizeTextValue((location.state as { prefillService?: unknown }).prefillService)
      : "";
  const prefillMethod =
    typeof location.state === "object" && location.state !== null
      ? normalizeTextValue((location.state as { prefillMethod?: unknown }).prefillMethod)
      : "";

  return (
    <Create
      className="RaEdit-main"
      redirect={false}
      mutationOptions={{
        onSuccess: async (data, variables) => {
          const createdStubId = String((data as { id?: string | number } | undefined)?.id ?? "").trim();
          if (createdStubId) {
            setStubEditedSignal(createdStubId);
          }

          const payloadService = normalizeTextValue(
            (data as { service?: unknown } | undefined)?.service ??
              (variables as { data?: { service?: unknown } } | undefined)?.data?.service ??
              prefillService,
          );
          const payloadMethod = normalizeTextValue(
            (data as { method?: unknown } | undefined)?.method ??
              (variables as { data?: { method?: unknown } } | undefined)?.data?.method ??
              prefillMethod,
          );
          const payloadEnabledRaw =
            (data as { enabled?: unknown } | undefined)?.enabled ??
            (variables as { data?: { enabled?: unknown } } | undefined)?.data?.enabled;
          const payloadEnabled = payloadEnabledRaw === undefined ? true : payloadEnabledRaw === true;
          let shouldSetAssignedSignal = payloadEnabled;
          if (payloadEnabled) {
            const activeRoom = getCurrentRoom().trim();
            const backendId = String(
              (data as { backendId?: unknown; id?: unknown } | undefined)?.backendId ??
                (data as { id?: unknown } | undefined)?.id ??
                "",
            ).trim();
            if (activeRoom && backendId) {
              try {
                const patchResult = await apiClient.request<{ enabled?: boolean }>(
                  `/stubs/${encodeURIComponent(backendId)}?room=${encodeURIComponent(activeRoom)}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ enabled: true }),
                  },
                );
                shouldSetAssignedSignal = patchResult?.enabled !== false;
              } catch {
                shouldSetAssignedSignal = false;
              }
            }
          }
          if (payloadService && payloadMethod) {
            setStubCreatedSignal(payloadService, payloadMethod);
            if (shouldSetAssignedSignal) {
              setStubReplacedSignal(payloadService, payloadMethod);
            }
          }

          navigate(returnPath, {
            state: {
              stubCreated:
                payloadService && payloadMethod
                  ? {
                      service: payloadService,
                      method: payloadMethod,
                      savedAt: Date.now(),
                    }
                  : undefined,
            },
          });
        },
      }}
    >
      <SimpleForm
        toolbar={false}
        transform={normalizeStubDelay}
        warnWhenUnsavedChanges
        defaultValues={{
          service: prefillService,
          method: prefillMethod,
          output: DEFAULT_OUTPUT_TEMPLATE,
          enabled: true,
        }}
        sx={stubFormSx}
      >
        <StubFormLayout mode="create" />
        <CreateStubToolbar />
      </SimpleForm>
    </Create>
  );
};

// Stub Edit component
export const StubEdit = () => {
  const [activeRoom, setActiveRoom] = useState(() => getCurrentRoom().trim());
  useEffect(() => subscribeRoomChanges(() => setActiveRoom(getCurrentRoom().trim())), []);
  const canToggleEnabled = activeRoom !== "";

  return (
    <Edit>
      <SimpleForm
        toolbar={false}
        transform={normalizeStubDelay}
        warnWhenUnsavedChanges
        sx={stubFormSx}
      >
        <StubFormLayout
          mode="edit"
          showId
        />
        <EditStubToolbar canToggleEnabled={canToggleEnabled} />
      </SimpleForm>
    </Edit>
  );
};
