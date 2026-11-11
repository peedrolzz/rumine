import { Box, CircularProgress } from "@mui/material";

/** Indicador de progresso de tela inteira (nunca tela em branco). */
export default function Carregando({ rotulo = "Carregando" }: { rotulo?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60dvh" }} role="status" aria-label={rotulo}>
      <CircularProgress />
    </Box>
  );
}
