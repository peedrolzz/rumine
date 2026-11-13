// T05 - Início do Usuário: saldo da carteira e atalho para recarregar (HU-04).
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Link } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";
import { formatarDataHora } from "../../utils/data";
import { formatarReais } from "../../utils/moeda";

type Saldo = { saldoCentavos: number; atualizadoEm: string | null };
type Carga = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; saldo: Saldo };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function Inicio() {
  const [carga, setCarga] = useState<Carga>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  // Só a resposta da consulta mais recente vale (evita um saldo velho sobrescrever um novo).
  const consulta = useRef(0);

  // Primeira carga (e "Tentar de novo"): mostra o carregando até chegar.
  useEffect(() => {
    let cancelado = false;
    const minha = ++consulta.current;
    requisitar<Saldo>("/carteira")
      .then((saldo) => !cancelado && minha === consulta.current && setCarga({ tipo: "ok", saldo }))
      .catch((e: unknown) => !cancelado && minha === consulta.current && setCarga({ tipo: "erro", mensagem: mensagemDe(e) }));
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  /** Busca o saldo de novo sem trocar a tela por "carregando": o saldo antigo continua visível. */
  const atualizar = useCallback(async () => {
    const minha = ++consulta.current;
    setAtualizando(true);
    setErroAtualizar(null);
    try {
      const saldo = await requisitar<Saldo>("/carteira");
      if (minha === consulta.current) setCarga({ tipo: "ok", saldo });
    } catch (e) {
      if (minha === consulta.current) setErroAtualizar(mensagemDe(e));
    } finally {
      if (minha === consulta.current) setAtualizando(false);
    }
  }, []);

  // Ao voltar para o app (outra aba, tela desbloqueada), busca o saldo de novo: depois de
  // recarregar ou consumir uma refeição ele já aparece atualizado.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [atualizar]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Início
      </Typography>

      {carga.tipo === "carregando" && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Carregando saldo">
          <CircularProgress />
        </Box>
      )}

      {carga.tipo === "erro" && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              onClick={() => {
                setCarga({ tipo: "carregando" });
                setTentativa((n) => n + 1);
              }}
            >
              Tentar de novo
            </Button>
          }
        >
          {carga.mensagem}
        </Alert>
      )}

      {carga.tipo === "ok" && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Seu saldo
            </Typography>
            <Typography
              variant="h3"
              component="p"
              aria-live="polite"
              sx={{ fontWeight: 700, color: carga.saldo.saldoCentavos === 0 ? "text.secondary" : "primary.main", overflowWrap: "anywhere" }}
            >
              {formatarReais(carga.saldo.saldoCentavos)}
            </Typography>
            {carga.saldo.atualizadoEm && (
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                Atualizado em {formatarDataHora(carga.saldo.atualizadoEm)}
              </Typography>
            )}
          </Paper>

          {carga.saldo.saldoCentavos === 0 && (
            <Alert severity="info">Seu saldo está zerado. Recarregue para entrar no RU.</Alert>
          )}
          {erroAtualizar && <Alert severity="warning">Não foi possível atualizar o saldo: {erroAtualizar}</Alert>}

          <Button component={Link} to="/qr" variant="contained" size="large" fullWidth startIcon={<QrCode2Icon />}>
            Mostrar QR Code
          </Button>
          <Button component={Link} to="/recarga" variant="outlined" size="large" fullWidth startIcon={<AddCircleOutlinedIcon />}>
            Recarregar
          </Button>
          <Button variant="text" size="large" fullWidth startIcon={<RefreshIcon />} onClick={() => void atualizar()} disabled={atualizando}>
            {atualizando ? "Atualizando..." : "Atualizar saldo"}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
