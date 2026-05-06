import { lazy, Suspense, type ComponentType } from "react";
import { Admin, Resource } from "react-admin";
import { Box, CircularProgress } from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import PrivacyTipIcon from "@mui/icons-material/PrivacyTip";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import DescriptionIcon from "@mui/icons-material/Description";
import HistoryIcon from "@mui/icons-material/History";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import BugReportIcon from "@mui/icons-material/BugReport";
import HubIcon from "@mui/icons-material/Hub";

import dataProvider from "./gripmock";
import { CustomLayout } from "./components/Layout/CustomLayout";
import { customTheme, customDarkTheme } from "./theme";

const Loader = () => (
  <Box p={1.5} display="flex" alignItems="center" justifyContent="center">
    <CircularProgress size={20} />
  </Box>
);

const wrapLazy = <P extends object>(
  LazyComponent: ComponentType<P>,
): ComponentType<P> =>
  function WrappedComponent(props: P) {
    return (
      <Suspense fallback={<Loader />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

const Dashboard = wrapLazy(
  lazy(async () => {
    const module = await import("./dashboard");
    return { default: module.Dashboard };
  }),
);
const ServiceList = wrapLazy(
  lazy(async () => {
    const module = await import("./services");
    return { default: module.ServiceList };
  }),
);
const StubList = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.StubList };
  }),
);
const StubEdit = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.StubEdit };
  }),
);
const StubShow = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.StubShow };
  }),
);
const StubCreate = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.StubCreate };
  }),
);
const UsedStubList = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.UsedStubList };
  }),
);
const UnusedStubList = wrapLazy(
  lazy(async () => {
    const module = await import("./stubs");
    return { default: module.UnusedStubList };
  }),
);
const DescriptorList = wrapLazy(
  lazy(async () => {
    const module = await import("./descriptors");
    return { default: module.DescriptorList };
  }),
);
const HistoryList = wrapLazy(
  lazy(async () => {
    const module = await import("./history");
    return { default: module.HistoryList };
  }),
);
const SessionScopePage = wrapLazy(
  lazy(async () => {
    const module = await import("./session");
    return { default: module.SessionScopePage };
  }),
);
const VerifyPage = wrapLazy(
  lazy(async () => {
    const module = await import("./verify");
    return { default: module.VerifyPage };
  }),
);
const InspectPage = wrapLazy(
  lazy(async () => {
    const module = await import("./inspect");
    return { default: module.InspectPage };
  }),
);

export const App = () => {
  return (
    <Admin
      disableTelemetry
      dataProvider={dataProvider}
      layout={CustomLayout}
      theme={customTheme}
      darkTheme={customDarkTheme}
      dashboard={Dashboard as any}
    >
      <Resource
        icon={PrivacyTipIcon}
        name="services"
        list={ServiceList}
        options={{ label: "Services" }}
      />
      <Resource
        icon={StorageIcon}
        name="stubs"
        list={StubList}
        edit={StubEdit}
        show={StubShow}
        create={StubCreate}
        options={{ label: "Stubs" }}
      />
      <Resource
        icon={CheckCircleIcon}
        name="stubs/used"
        list={UsedStubList}
        options={{ label: "Used Stubs" }}
      />
      <Resource
        icon={CancelIcon}
        name="stubs/unused"
        list={UnusedStubList}
        options={{ label: "Unused Stubs" }}
      />
      <Resource
        icon={DescriptionIcon}
        name="descriptors"
        list={DescriptorList}
        options={{ label: "Descriptors" }}
      />
      <Resource
        icon={HistoryIcon}
        name="history"
        list={HistoryList}
        options={{ label: "History" }}
      />
      <Resource
        icon={HubIcon}
        name="session"
        list={SessionScopePage}
        options={{ label: "Session Scope" }}
      />
      <Resource
        icon={FactCheckIcon}
        name="verify"
        list={VerifyPage}
        options={{ label: "Verify" }}
      />
      <Resource
        icon={BugReportIcon}
        name="inspect"
        list={InspectPage}
        options={{ label: "Inspector" }}
      />
    </Admin>
  );
};
