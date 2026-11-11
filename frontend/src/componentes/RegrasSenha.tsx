import { Box, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { REGRAS_SENHA } from "../auth/senha";

const OCULTO = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

/** Lista as regras da senha e marca ao vivo as que já foram cumpridas (ícone e texto, não só cor). */
export default function RegrasSenha({ senha }: { senha: string }) {
  return (
    <Box component="ul" aria-label="Regras da senha" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {REGRAS_SENHA.map((regra) => {
        const cumprida = regra.ok(senha);
        return (
          <Box
            key={regra.id}
            component="li"
            sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.25, color: cumprida ? "success.main" : "text.secondary" }}
          >
            {cumprida ? <CheckCircleIcon fontSize="small" aria-hidden /> : <RadioButtonUncheckedIcon fontSize="small" aria-hidden />}
            <Typography variant="body2" component="span">
              {regra.texto}
            </Typography>
            <Box component="span" sx={OCULTO}>
              {cumprida ? " (cumprida)" : " (pendente)"}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
