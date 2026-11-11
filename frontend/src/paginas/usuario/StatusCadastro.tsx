// Status do cadastro (provisório). A tela completa, com envio de RA e declaração e o motivo da
// rejeição, é a T04 da HU-02 e da HU-20.
import { useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import { Navigate } from "react-router-dom";
import { ErroApi } from "../../api/cliente";
import { useAuth } from "../../auth/contexto";

export default function StatusCadastro() {
  const { estado, recarregar, sair } = useAuth();
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (estado.tipo !== "autenticado") return null; // a guarda de rota já trata esses casos
  if (estado.usuario.status === "ATIVO") return <Navigate to="/" replace />;

  const rejeitado = estado.usuario.status === "REJEITADO";

  const atualizar = async () => {
    setAtualizando(true);
    setAviso(null);
    await recarregar({ silencioso: true });
    setAviso("Seu cadastro ainda está em análise. Tente de novo mais tarde.");
    setAtualizando(false);
  };

  const fazerSair = async () => {
    setSaindo(true);
    setErro(null);
    try {
      await sair();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível sair. Tente de novo.");
      setSaindo(false);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 480, mx: "auto" }}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", pt: 4 }}>
        {rejeitado ? (
          <ErrorOutlinedIcon color="error" sx={{ fontSize: 56 }} aria-hidden />
        ) : (
          <HourglassTopIcon color="primary" sx={{ fontSize: 56 }} aria-hidden />
        )}
        <Typography variant="h5" component="h1">
          {rejeitado ? "Cadastro não aprovado" : "Cadastro em análise"}
        </Typography>
        <Typography>
          {rejeitado
            ? "Seu cadastro não foi aprovado. Fale com o RU para saber o motivo."
            : "Recebemos seu cadastro e ele aguarda a análise do Admin. Quando for aprovado, você poderá usar o app."}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Conta: {estado.usuario.email}
        </Typography>

        {aviso && <Alert severity="info">{aviso}</Alert>}
        {erro && <Alert severity="error">{erro}</Alert>}

        <Button variant="contained" size="large" fullWidth onClick={atualizar} disabled={atualizando}>
          {atualizando ? "Atualizando..." : "Atualizar"}
        </Button>
        <Button variant="outlined" size="large" fullWidth onClick={fazerSair} disabled={saindo}>
          {saindo ? "Saindo..." : "Sair"}
        </Button>
      </Stack>
    </Box>
  );
}
