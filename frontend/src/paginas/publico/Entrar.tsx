// T01 - Login (HU-01).
import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { Link as LinkRouter } from "react-router-dom";
import { ErroApi } from "../../api/cliente";
import { useAuth } from "../../auth/contexto";
import CampoSenha from "../../componentes/CampoSenha";

export default function Entrar() {
  const { entrar, estado } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A sessão acabou enquanto a pessoa usava o app (ou passou dos 45 dias): pede a senha de novo.
  const sessaoExpirou = estado.tipo === "anonimo" && estado.expirou;

  const enviar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    if (enviando) return;
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      // Dá certo: o estado vira "autenticado" e o layout leva à tela de origem.
      await entrar(email.trim(), senha);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Box component="form" onSubmit={enviar} noValidate>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Entrar
      </Typography>

      <Stack spacing={2}>
        {sessaoExpirou && !erro && <Alert severity="warning">Sua sessão expirou. Entre novamente.</Alert>}
        {erro && <Alert severity="error">{erro}</Alert>}

        <TextField
          label="E-mail"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          disabled={enviando}
          slotProps={{ htmlInput: { inputMode: "email", autoCapitalize: "none" } }}
        />
        <CampoSenha label="Senha" value={senha} onChange={setSenha} autoComplete="current-password" disabled={enviando} />

        <Button type="submit" variant="contained" size="large" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </Button>
        <Button component={LinkRouter} to="/cadastro" variant="text" size="large">
          Criar conta
        </Button>
      </Stack>
    </Box>
  );
}
