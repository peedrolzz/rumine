import { Box, Typography } from "@mui/material";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/contexto";
import Carregando from "../componentes/Carregando";

type Props = {
  /** Quem já está logado não precisa ver login e cadastro: vai para o app (ou para a tela de origem). */
  redirecionarSeLogado?: boolean;
};

/** Moldura das telas de entrada: sem menu, coluna única de até 480 px, centralizada em tela larga. */
export default function LayoutPublico({ redirecionarSeLogado = false }: Props) {
  const { estado } = useAuth();
  const local = useLocation();

  if (redirecionarSeLogado) {
    if (estado.tipo === "carregando") return <Carregando />;
    if (estado.tipo === "autenticado") {
      const de = (local.state as { de?: string } | null)?.de;
      return <Navigate to={de ?? "/"} replace />;
    }
  }

  return (
    <Box
      sx={{
        maxWidth: 480,
        mx: "auto",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: { xs: "flex-start", sm: "center" },
        p: 2,
      }}
    >
      <Typography variant="h4" component="p" sx={{ color: "primary.main", fontWeight: 700, mb: 3, textAlign: "center" }}>
        RU Mine
      </Typography>
      <Outlet />
    </Box>
  );
}
