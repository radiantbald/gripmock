import { Layout, LayoutProps } from "react-admin";
import { GlobalStyles } from "@mui/material";
import { CustomAppBar } from "./CustomAppBar";
import { CustomMenu } from "./CustomMenu";

export const CustomLayout = (props: LayoutProps) => (
  <>
    <GlobalStyles
      styles={{
        "#main-content": {
          padding: "0 !important",
          paddingLeft: "0 !important",
          paddingRight: "0 !important",
        },
        ".RaLayout-content": {
          padding: "0 !important",
          paddingLeft: "0 !important",
          paddingRight: "0 !important",
        },
      }}
    />
    <Layout {...props} appBar={CustomAppBar} menu={CustomMenu} />
  </>
);
