import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  Button,
  FormHelperText,
  IconButton,
  InputBase,
  Modal,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { InputProps, useInput } from "react-admin";

type KeyValueTableInputProps = {
  source: string;
  label?: string;
  helperText?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  maxTableHeight?: number;
} & InputProps;

type KeyValueRow = {
  id: number;
  key: string;
  value: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const rowsFromValue = (value: unknown): KeyValueRow[] => {
  if (!isPlainObject(value)) {
    return [{ id: 1, key: "", value: "" }];
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return [{ id: 1, key: "", value: "" }];
  }

  return entries.map(([key, rawValue], index) => ({
    id: index + 1,
    key,
    value: typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue),
  }));
};

const valueFromRows = (rows: KeyValueRow[]) => {
  const payload: Record<string, string> = {};

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }

    payload[key] = row.value;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
};

const normalizedJson = (value: unknown) => JSON.stringify(value ?? {});
const canonicalObjectValue = (value: unknown) => valueFromRows(rowsFromValue(value));

const normalizeKey = (key: string) => key.trim().toLowerCase();

export const KeyValueTableInput = (props: KeyValueTableInputProps) => {
  const {
    source,
    label,
    helperText,
    keyPlaceholder = "Header name",
    valuePlaceholder = "Header value",
    maxTableHeight = 170,
  } = props;

  const {
    field: { value, onChange },
    fieldState: { isTouched, error },
    formState: { isSubmitted },
    isRequired,
  } = useInput(props);

  const initialRows = useMemo(() => rowsFromValue(value), [value]);
  const [rows, setRows] = useState<KeyValueRow[]>(initialRows);
  const [expanded, setExpanded] = useState(false);
  const duplicateKeySet = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of rows) {
      const key = normalizeKey(row.key);
      if (!key) {
        continue;
      }

      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const duplicates = new Set<string>();
    for (const [key, count] of counts) {
      if (count > 1) {
        duplicates.add(key);
      }
    }

    return duplicates;
  }, [rows]);

  useEffect(() => {
    const normalizedIncomingValue = normalizedJson(canonicalObjectValue(value));

    // Do not reset local editing rows when form value is semantically unchanged.
    // This keeps newly added empty rows visible until user fills them.
    if (normalizedJson(valueFromRows(rows)) === normalizedIncomingValue) {
      return;
    }

    setRows(initialRows);
  }, [initialRows, rows, value]);

  const commitRows = (nextRows: KeyValueRow[]) => {
    setRows(nextRows);
    onChange(valueFromRows(nextRows));
  };

  const updateRow = (id: number, field: "key" | "value", fieldValue: string) => {
    const nextRows = rows.map((row) =>
      row.id === id ? { ...row, [field]: fieldValue } : row,
    );

    commitRows(nextRows);
  };

  const addRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    commitRows([...rows, { id: nextId, key: "", value: "" }]);
  };

  const removeRow = (id: number) => {
    const filteredRows = rows.filter((row) => row.id !== id);
    commitRows(filteredRows.length > 0 ? filteredRows : [{ id: 1, key: "", value: "" }]);
  };

  const isDuplicateRowKey = (key: string) => duplicateKeySet.has(normalizeKey(key));

  return (
    <div>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Box sx={{ fontSize: 14, color: "text.secondary" }}>
          {label || source}
          {isRequired ? " *" : ""}
        </Box>
        <IconButton
          size="small"
          aria-label="Expand table"
          onClick={() => {
            setExpanded(true);
          }}
          sx={{
            m: 0,
            p: 0,
            width: 14,
            height: 14,
            borderRadius: 0,
            bgcolor: "transparent",
            color: "text.secondary",
            transition: "color 0.15s ease",
            "&:hover": {
              color: "primary.main",
              bgcolor: "transparent",
            },
          }}
        >
          <OpenInFullRoundedIcon sx={{ fontSize: 12, display: "block" }} />
        </IconButton>
      </Box>
      <Stack spacing={0.5}>
        <Stack spacing={0.5}>
          <Box
            sx={{
              maxHeight: maxTableHeight,
              overflowY: "auto",
              overflowX: "hidden",
              pr: 0.25,
              "&::-webkit-scrollbar": {
                width: 8,
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 8,
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: "transparent",
              },
            }}
          >
            <Table
              size="small"
              sx={{
                tableLayout: "fixed",
                borderCollapse: "collapse",
                "& .MuiTableCell-root": {
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  px: 1,
                  py: 0.5,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{ width: "35%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                  >
                    Key
                  </TableCell>
                  <TableCell
                    sx={{ width: "50%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                  >
                    Value
                  </TableCell>
                  <TableCell sx={{ width: "15%" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{
                      "& .kv-remove": {
                        opacity: 0,
                        pointerEvents: "none",
                        transition: "opacity 0.15s ease",
                      },
                      "&:hover .kv-remove, &:focus-within .kv-remove": {
                        opacity: 1,
                        pointerEvents: "auto",
                      },
                    }}
                  >
                    <TableCell>
                      <InputBase
                        fullWidth
                        placeholder={keyPlaceholder}
                        value={row.key}
                        onChange={(event) => {
                          updateRow(row.id, "key", event.target.value);
                        }}
                        sx={{
                          fontSize: 13,
                          lineHeight: 1.2,
                          color: isDuplicateRowKey(row.key) ? "error.main" : "inherit",
                          "& input": { py: 0.5 },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <InputBase
                        fullWidth
                        placeholder={valuePlaceholder}
                        value={row.value}
                        onChange={(event) => {
                          updateRow(row.id, "value", event.target.value);
                        }}
                        sx={{
                          fontSize: 13,
                          lineHeight: 1.2,
                          "& input": { py: 0.5 },
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ textAlign: "center" }}>
                      <IconButton
                        className="kv-remove"
                        size="small"
                        onClick={() => {
                          removeRow(row.id);
                        }}
                        aria-label="Remove row"
                        sx={{
                          color: "text.secondary",
                          "&:hover": {
                            color: "error.main",
                            bgcolor: "transparent",
                          },
                        }}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box>
            <Button
              variant="text"
              type="button"
              onClick={addRow}
              sx={{ minWidth: 0, px: 0.5, fontSize: 18, lineHeight: 1, color: "text.secondary" }}
            >
              +
            </Button>
          </Box>
        </Stack>
      </Stack>
      <FormHelperText error={(isTouched || isSubmitted) && !!error}>
        {error?.message || helperText}
      </FormHelperText>
      {duplicateKeySet.size > 0 ? (
        <FormHelperText error>
          Duplicate keys detected. Header keys must be unique.
        </FormHelperText>
      ) : null}
      <Modal
        open={expanded}
        onClose={() => {
          setExpanded(false);
        }}
      >
        <Box
          sx={{
            position: "fixed",
            top: 20,
            right: 20,
            width: { xs: "calc(100vw - 24px)", md: "max(33vw, 400px)" },
            height: "calc(100dvh - 40px)",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: 1.5,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Box sx={{ fontSize: 14, color: "text.secondary" }}>{label || source}</Box>
            <IconButton
              size="small"
              aria-label="Close table"
              onClick={() => {
                setExpanded(false);
              }}
              sx={{
                m: 0,
                p: 0,
                width: 14,
                height: 14,
                borderRadius: 0,
                bgcolor: "transparent",
                color: "text.secondary",
                transition: "color 0.15s ease",
                "&:hover": {
                  color: "primary.main",
                  bgcolor: "transparent",
                },
              }}
            >
              <CloseRoundedIcon sx={{ fontSize: 12, display: "block" }} />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                pr: 0.25,
              }}
            >
              <Table
                size="small"
                sx={{
                  tableLayout: "fixed",
                  borderCollapse: "collapse",
                  "& .MuiTableCell-root": {
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    px: 1,
                    py: 0.5,
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{ width: "35%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                    >
                      Key
                    </TableCell>
                    <TableCell
                      sx={{ width: "50%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                    >
                      Value
                    </TableCell>
                    <TableCell sx={{ width: "15%" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <InputBase
                          fullWidth
                          placeholder={keyPlaceholder}
                          value={row.key}
                          onChange={(event) => {
                            updateRow(row.id, "key", event.target.value);
                          }}
                          sx={{
                            fontSize: 13,
                            lineHeight: 1.2,
                            color: isDuplicateRowKey(row.key) ? "error.main" : "inherit",
                            "& input": { py: 0.5 },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <InputBase
                          fullWidth
                          placeholder={valuePlaceholder}
                          value={row.value}
                          onChange={(event) => {
                            updateRow(row.id, "value", event.target.value);
                          }}
                          sx={{
                            fontSize: 13,
                            lineHeight: 1.2,
                            "& input": { py: 0.5 },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: "center" }}>
                        <IconButton
                          size="small"
                          onClick={() => {
                            removeRow(row.id);
                          }}
                          aria-label="Remove row"
                          sx={{
                            color: "text.secondary",
                            "&:hover": {
                              color: "error.main",
                              bgcolor: "transparent",
                            },
                          }}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Box>
              <Button
                variant="text"
                type="button"
                onClick={addRow}
                sx={{ minWidth: 0, px: 0.5, fontSize: 18, lineHeight: 1, color: "text.secondary" }}
              >
                +
              </Button>
            </Box>
          </Box>
        </Box>
      </Modal>
    </div>
  );
};
