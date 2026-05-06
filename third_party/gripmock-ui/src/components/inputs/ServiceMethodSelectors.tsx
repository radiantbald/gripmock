import { Dispatch, SetStateAction, useMemo } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { useGetList } from "react-admin";

type ServiceMethodSelectorsProps = {
  service: string;
  method: string;
  onServiceChange: Dispatch<SetStateAction<string>>;
  onMethodChange: Dispatch<SetStateAction<string>>;
  serviceLabel?: string;
  methodLabel?: string;
};

type ServiceMethod = { id?: string; name?: string };
type ServiceRecord = {
  id?: string;
  name?: string;
  methods?: ServiceMethod[];
};

export const ServiceMethodSelectors = ({
  service,
  method,
  onServiceChange,
  onMethodChange,
  serviceLabel = "Service",
  methodLabel = "Method",
}: ServiceMethodSelectorsProps) => {
  const { data: servicesData } = useGetList("services", {
    pagination: { page: 1, perPage: 9999 },
  });

  const services = useMemo(() => {
    const rows = Array.isArray(servicesData) ? (servicesData as ServiceRecord[]) : [];

    return rows
      .map((item) => item.id || item.name)
      .filter((value): value is string => Boolean(value));
  }, [servicesData]);

  const methods = useMemo(() => {
    const rows = Array.isArray(servicesData) ? (servicesData as ServiceRecord[]) : [];
    const currentService = rows.find((item) => item.id === service || item.name === service);
    const methodRows = Array.isArray(currentService?.methods) ? currentService.methods : [];

    return methodRows
      .map((item) => item.name || item.id?.split("/").pop())
      .filter((value): value is string => Boolean(value));
  }, [service, servicesData]);

  return (
    <>
      <Autocomplete
        freeSolo
        options={services}
        value={service}
        onInputChange={(_, value) => onServiceChange(value)}
        onChange={(_, value) => onServiceChange(typeof value === "string" ? value : "")}
        renderInput={(params) => (
          <TextField {...params} label={serviceLabel} placeholder="Select or enter custom service" fullWidth />
        )}
      />
      <Autocomplete
        freeSolo
        options={methods}
        value={method}
        onInputChange={(_, value) => onMethodChange(value)}
        onChange={(_, value) => onMethodChange(typeof value === "string" ? value : "")}
        renderInput={(params) => (
          <TextField {...params} label={methodLabel} placeholder="Select or enter custom method" fullWidth />
        )}
      />
    </>
  );
};
