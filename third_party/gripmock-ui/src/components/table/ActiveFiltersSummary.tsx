import ClearAllIcon from "@mui/icons-material/ClearAll";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { useListContext } from "react-admin";

const ignoredKeys = new Set(["_"]);

const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

export const ActiveFiltersSummary = () => {
  const { filterValues, setFilters, data, total, isPending } = useListContext();
  const showEmptyWarning = isPending === false && (total || 0) === 0;

  const entries = Object.entries(filterValues || {}).filter(([key, value]) => {
    if (ignoredKeys.has(key)) {
      return false;
    }

    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  });

  if (entries.length === 0) {
    return null;
  }

  return (
    <Box
      px={1}
      py={0.75}
      mb={0.5}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "wrap",
        borderBottom: "1px dashed",
        borderColor: "divider",
      }}
    >
      <FilterAltIcon fontSize="small" color="primary" />
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Active filters:
      </Typography>
      <Chip
        size="small"
        color="primary"
        variant="outlined"
        label={isPending ? "loading..." : `${data?.length || 0}/${total || 0}`}
      />
      {entries.map(([key, value]) => (
        <Chip
          key={key}
          size="small"
          variant="outlined"
          label={`${key}: ${formatValue(value)}`}
        />
      ))}
      <Tooltip title="Clear all filters">
        <IconButton
          size="small"
          onClick={() => setFilters({})}
          aria-label="clear active filters"
        >
          <ClearAllIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {showEmptyWarning ? (
        <Typography variant="caption" color="warning.main">
          No results match current filters.
        </Typography>
      ) : null}
    </Box>
  );
};
