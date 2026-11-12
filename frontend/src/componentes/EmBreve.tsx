import { Box, Stack, Typography } from "@mui/material";
import ConstructionIcon from "@mui/icons-material/Construction";

/** Marcador de tela que chega em uma história futura (o menu do perfil já aponta para ela). */
export default function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {titulo}
      </Typography>
      <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", py: 4 }}>
        <ConstructionIcon color="disabled" sx={{ fontSize: 48 }} aria-hidden />
        <Typography sx={{ fontWeight: 600 }}>Esta tela ainda está em construção.</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {descricao}
        </Typography>
      </Stack>
    </Box>
  );
}
