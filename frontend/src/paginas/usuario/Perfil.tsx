// T16 - Perfil e sair (versão mínima da HU-01: o necessário para encerrar a sessão).
import { useState } from "react";
import { Alert, Box, Button, Divider, Stack, Typography } from "@mui/material";
import { ErroApi } from "../../api/cliente";
import { useAuth } from "../../auth/contexto";

const CATEGORIAS = { DISCENTE: "Discente", DOCENTE: "Docente", SERVIDOR: "Servidor", VISITANTE: "Visitante" } as const;

export default function Perfil() {
  const { estado, sair } = useAuth();
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (estado.tipo !== "autenticado") return null; // a guarda de rota já trata esses casos
  const { usuario } = estado;

  const fazerSair = async () => {
    setSaindo(true);
    setErro(null);
    try {
      await sair(); // dá certo: o estado vira "anonimo" e a guarda leva ao login
    } catch (e) {
      // Sem internet o servidor não recebeu o pedido: a sessão continua valendo, e a pessoa precisa saber.
      setErro(e instanceof ErroApi ? e.message : "Não foi possível sair. Tente de novo.");
      setSaindo(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Perfil
      </Typography>

      <Stack spacing={1} divider={<Divider flexItem />} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nome
          </Typography>
          <Typography sx={{ overflowWrap: "anywhere" }}>{usuario.nome}</Typography>
        </Box>
        <Box>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            E-mail
          </Typography>
          <Typography sx={{ overflowWrap: "anywhere" }}>{usuario.email}</Typography>
        </Box>
        <Box>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Categoria
          </Typography>
          <Typography>{CATEGORIAS[usuario.categoria]}</Typography>
        </Box>
      </Stack>

      {erro && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}
      <Button variant="outlined" color="error" size="large" fullWidth onClick={fazerSair} disabled={saindo}>
        {saindo ? "Saindo..." : "Sair"}
      </Button>
    </Box>
  );
}
