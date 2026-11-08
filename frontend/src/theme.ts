// frontend/src/theme.ts - tema único do RU Mine (ver documento de padronização de UX)
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#1f6f43", dark: "#15502f", contrastText: "#ffffff" },
    success: { main: "#1a7f37" },
    error: { main: "#b42318" },
    warning: { main: "#9a6700" },
    text: { primary: "#1b1f1d", secondary: "#5b6560" },
    background: { default: "#f4f6f5", paper: "#ffffff" },
    divider: "#dde3df",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: 16,
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiTextField: { defaultProps: { fullWidth: true, size: "medium" } },
  },
});
