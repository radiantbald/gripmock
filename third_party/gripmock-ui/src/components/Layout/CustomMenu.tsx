import { Menu, useSidebarState } from "react-admin";
import StorageIcon from "@mui/icons-material/Storage";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DevicesIcon from "@mui/icons-material/Devices";

export const CustomMenu = () => {
  const [sidebarOpen] = useSidebarState();

  return (
    <Menu
      sx={{
        "& .RaMenuItemLink-root, & .MuiMenuItem-root": {
          borderRadius: 1.5,
          mx: 1,
          my: 0.25,
          px: sidebarOpen ? 1.25 : 0.75,
          justifyContent: sidebarOpen ? "flex-start" : "center",
          transition: "background-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
        },
        "& .RaMenuItemLink-root .MuiListItemIcon-root, & .MuiMenuItem-root .MuiListItemIcon-root": {
          minWidth: sidebarOpen ? 34 : 0,
          mr: sidebarOpen ? 1 : 0,
          justifyContent: "center",
        },
        "& .RaMenuItemLink-root[aria-current='page'], & .MuiMenuItem-root[aria-current='page']": {
          backgroundColor: "rgba(255, 108, 55, 0.16)",
          color: "primary.main",
          borderLeft: "3px solid",
          borderColor: "primary.main",
        },
        "& .RaMenuItemLink-root[aria-current='page'] .MuiListItemIcon-root, & .MuiMenuItem-root[aria-current='page'] .MuiListItemIcon-root": {
          color: "primary.main",
        },
      }}
    >
      <Menu.Item to="/sniffer" primaryText="Sniffer" leftIcon={<TravelExploreIcon />} />
      <Menu.Item to="/stubs" primaryText="Stubs" leftIcon={<StorageIcon />} />
      <Menu.Item to="/protofiles" primaryText="Protofiles" leftIcon={<DescriptionOutlinedIcon />} />
      <Menu.Item to="/clients" primaryText="Clients" leftIcon={<DevicesIcon />} />
    </Menu>
  );
};
