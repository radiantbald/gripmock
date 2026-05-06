import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import ViewCompactIcon from "@mui/icons-material/ViewCompact";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";

import type { GridDensity } from "../../utils/uiPreferences";

export const DensityToolbarControl = ({
  density,
  onChange,
}: {
  density: GridDensity;
  onChange: (next: GridDensity) => void;
}) => (
  <ToggleButtonGroup
    size="small"
    value={density}
    exclusive
    onChange={(_, value: GridDensity | null) => {
      if (value) {
        onChange(value);
      }
    }}
  >
    <Tooltip title="Compact density">
      <ToggleButton value="compact" aria-label="compact density">
        <ViewCompactIcon fontSize="small" />
      </ToggleButton>
    </Tooltip>
    <Tooltip title="Comfortable density">
      <ToggleButton value="comfortable" aria-label="comfortable density">
        <ViewAgendaIcon fontSize="small" />
      </ToggleButton>
    </Tooltip>
  </ToggleButtonGroup>
);
