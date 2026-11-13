// T06 - QR Code de acesso do Usuário (HU-06): código de 30 s que se renova sozinho.
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";

/** Renova o código quando faltam menos que isso para vencer (RNF-12: a PWA renova antes de expirar). */
export const RENOVAR_ANTES_MS = 5000;
/** Se a renovação falhar, tenta de novo a cada tanto (o código atual continua valendo até vencer). */
export const REPETIR_APOS_ERRO_MS = 3000;

type QrEmitido = { token: string; expiraEm: string; validadeSegundos: number };
/** `venceEm` usa o relógio DESTE aparelho (recebido + validade), para não depender do relógio do servidor. */
type QrAtual = { token: string; venceEm: number };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function QrCode() {
  const [qr, setQr] = useState<QrAtual | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Conta ainda não aprovada: a API recusa com o motivo (CADASTRO_PENDENTE).
  const [pendente, setPendente] = useState<string | null>(null);

  const buscando = useRef(false);
  const ultimaTentativa = useRef(0);
  const montado = useRef(true);
  const qrRef = useRef<QrAtual | null>(null);

  const buscar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    ultimaTentativa.current = Date.now();
    try {
      const emitido = await requisitar<QrEmitido>("/qr", { metodo: "POST" });
      if (!montado.current) return;
      const agoraLocal = Date.now();
      const novo = { token: emitido.token, venceEm: agoraLocal + emitido.validadeSegundos * 1000 };
      setAgora(agoraLocal); // o relógio da tela acompanha o QR novo (sem mostrar 31 s)
      qrRef.current = novo;
      setQr(novo);
      setErro(null);
      setPendente(null);
    } catch (e) {
      if (!montado.current) return;
      if (e instanceof ErroApi && e.codigo === "CADASTRO_PENDENTE") {
        qrRef.current = null;
        setQr(null);
        setPendente(e.message);
      } else {
        setErro(mensagemDe(e));
      }
    } finally {
      buscando.current = false;
      if (montado.current) setCarregando(false);
    }
  }, []);

  // Primeiro código ao abrir a tela.
  useEffect(() => {
    montado.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial; o estado só muda depois da resposta
    void buscar();
    return () => {
      montado.current = false;
    };
  }, [buscar]);

  // Relógio da tela e renovação automática. Com a aba escondida não consulta (renova ao voltar).
  useEffect(() => {
    const passo = () => {
      const t = Date.now();
      setAgora(t);
      if (document.visibilityState !== "visible" || pendente !== null) return;
      const atual = qrRef.current;
      const precisa = !atual || atual.venceEm - t <= RENOVAR_ANTES_MS;
      if (precisa && atual && t - ultimaTentativa.current >= REPETIR_APOS_ERRO_MS) void buscar();
    };
    const intervalo = setInterval(passo, 1000);
    document.addEventListener("visibilitychange", passo);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", passo);
    };
  }, [buscar, pendente]);

  // Mantém a tela acesa enquanto o QR está aberto (quando o navegador permite).
  useEffect(() => {
    let trava: { release(): Promise<void> } | null = null;
    let encerrado = false;
    const pedir = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request(tipo: "screen"): Promise<{ release(): Promise<void> }> } };
        const t = await nav.wakeLock?.request("screen");
        if (!t) return;
        if (encerrado) void t.release();
        else trava = t;
      } catch {
        // Sem permissão ou sem suporte: o QR funciona do mesmo jeito.
      }
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    void pedir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      encerrado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release().catch(() => undefined);
    };
  }, []);

  const restanteMs = qr ? qr.venceEm - agora : 0;
  const vencido = qr !== null && restanteMs <= 0;
  const segundos = Math.max(0, Math.ceil(restanteMs / 1000));
  const gerarDeNovo = () => {
    setCarregando(true);
    setErro(null);
    void buscar();
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        QR Code
      </Typography>

      {carregando && !qr && !pendente && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Gerando QR Code">
          <CircularProgress />
        </Box>
      )}

      {pendente && (
        <Stack spacing={2}>
          <Alert severity="warning">{pendente}</Alert>
          <Button component={Link} to="/status-cadastro" variant="contained" size="large" fullWidth>
            Ver situação do cadastro
          </Button>
        </Stack>
      )}

      {!carregando && !qr && !pendente && erro && (
        <Stack spacing={2}>
          <Alert severity="error">{erro}</Alert>
          <Button variant="contained" size="large" fullWidth startIcon={<RefreshIcon />} onClick={gerarDeNovo}>
            Tentar de novo
          </Button>
        </Stack>
      )}

      {qr && !vencido && (
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: "#ffffff", width: "100%", maxWidth: 320, boxSizing: "border-box" }}>
            <QRCodeSVG
              value={qr.token}
              size={256}
              level="L"
              marginSize={1}
              bgColor="#ffffff"
              fgColor="#000000"
              title="QR Code de acesso ao RU"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </Paper>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            Expira em {segundos} s
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
            Mostre este código ao operador. Ele se atualiza sozinho: não tire print, pois cada código vale uma só vez e por poucos segundos.
          </Typography>
          {erro && <Alert severity="warning" sx={{ width: "100%" }}>Não foi possível renovar agora: {erro} Vamos tentar de novo.</Alert>}
        </Stack>
      )}

      {vencido && (
        <Stack spacing={2}>
          <Alert severity="warning">QR Code expirado.{erro ? ` ${erro}` : ""}</Alert>
          <Button variant="contained" size="large" fullWidth startIcon={<RefreshIcon />} onClick={gerarDeNovo} disabled={carregando}>
            {carregando ? "Gerando..." : "Gerar de novo"}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
