// T06 - Recarga da carteira por Pix (HU-05): valor, pagamento e resultado (sucesso ou falha).
import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import { Link } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";
import { formatarReais, lerReais } from "../../utils/moeda";

// Mesmos limites do servidor (que é quem decide): aqui só avisam antes de enviar.
export const VALOR_MINIMO_CENTAVOS = 500;
export const VALOR_MAXIMO_CENTAVOS = 20000;
export const INTERVALO_CONSULTA_MS = 3000;
const ATALHOS = [1000, 2000, 5000];
const CHAVE_SESSAO = "rumine_recarga_pendente";

type Recarga = {
  id: string;
  valorCentavos: number;
  status: "PENDENTE" | "CONFIRMADA" | "RECUSADA" | "EXPIRADA";
  motivoFalha: string | null;
  codigoPagamento: string | null;
  expiraEm: string;
  simulacao: boolean;
};

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

// Guarda só o id da recarga em andamento (nunca o código) para retomar se a página recarregar.
const guardarId = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(CHAVE_SESSAO, id);
    else sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* sem armazenamento (modo privado): a recarga só não é retomada */
  }
};
const lerId = () => {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO);
  } catch {
    return null;
  }
};

function validarValor(texto: string): string | undefined {
  const centavos = lerReais(texto);
  if (texto.trim() === "") return "Informe o valor da recarga.";
  if (centavos === null) return "Digite um valor válido, por exemplo 20 ou 20,50.";
  if (centavos < VALOR_MINIMO_CENTAVOS) return `O valor mínimo da recarga é ${formatarReais(VALOR_MINIMO_CENTAVOS)}.`;
  if (centavos > VALOR_MAXIMO_CENTAVOS) return `O valor máximo da recarga é ${formatarReais(VALOR_MAXIMO_CENTAVOS)}.`;
  return undefined;
}

const horaDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Recarga() {
  const [recarga, setRecarga] = useState<Recarga | null>(null);
  // Ao abrir, confere se havia uma recarga em andamento (página recarregada no meio do pagamento).
  const [retomando, setRetomando] = useState(() => lerId() !== null);

  const [texto, setTexto] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const [copiado, setCopiado] = useState<"sim" | "nao" | null>(null);
  const [erroConsulta, setErroConsulta] = useState<string | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);

  // Retoma a recarga guardada.
  useEffect(() => {
    const id = lerId();
    if (!id) return;
    let cancelado = false;
    requisitar<Recarga>(`/recargas/${id}`)
      .then((r) => {
        if (cancelado) return;
        if (r.status === "PENDENTE") setRecarga(r);
        else guardarId(null);
      })
      .catch(() => !cancelado && guardarId(null))
      .finally(() => !cancelado && setRetomando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const idPendente = recarga?.status === "PENDENTE" ? recarga.id : null;

  // Enquanto espera o pagamento, pergunta ao servidor de tempos em tempos (e para ao sair da tela).
  useEffect(() => {
    if (!idPendente) return;
    let cancelado = false;
    let espera: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      try {
        const r = await requisitar<Recarga>(`/recargas/${idPendente}`);
        if (cancelado) return;
        setErroConsulta(null);
        setRecarga(r);
        if (r.status !== "PENDENTE") {
          guardarId(null);
          return;
        }
      } catch (e) {
        if (cancelado) return;
        setErroConsulta(mensagemDe(e));
      }
      espera = setTimeout(() => void ciclo(), INTERVALO_CONSULTA_MS);
    };
    espera = setTimeout(() => void ciclo(), INTERVALO_CONSULTA_MS);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [idPendente]);

  const erroValor = erroServidor ?? (tentou ? validarValor(texto) : undefined);

  const gerar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    if (criando) return;
    setTentou(true);
    const centavos = lerReais(texto);
    if (validarValor(texto) || centavos === null) return;

    setCriando(true);
    setErroGeral(null);
    try {
      const r = await requisitar<Recarga>("/recargas", { metodo: "POST", corpo: { valorCentavos: centavos } });
      guardarId(r.id);
      setCopiado(null);
      setErroConsulta(null);
      setErroSimulacao(null);
      setRecarga(r);
    } catch (e) {
      if (e instanceof ErroApi && e.campo === "valorCentavos") setErroServidor(e.message);
      else setErroGeral(mensagemDe(e));
    } finally {
      setCriando(false);
    }
  };

  const copiar = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado("sim");
    } catch {
      setCopiado("nao"); // sem permissão para copiar: a pessoa seleciona o código na tela
    }
  };

  const simular = async (resultado: "CONFIRMADA" | "RECUSADA") => {
    if (!recarga || simulando) return;
    setSimulando(true);
    setErroSimulacao(null);
    try {
      await requisitar(`/dev/recargas/${recarga.id}/simular`, { metodo: "POST", corpo: { resultado } });
      setRecarga(await requisitar<Recarga>(`/recargas/${recarga.id}`));
      guardarId(null);
    } catch (e) {
      setErroSimulacao(mensagemDe(e));
    } finally {
      setSimulando(false);
    }
  };

  const novaRecarga = () => {
    guardarId(null);
    setRecarga(null);
    setTentou(false);
    setErroServidor(null);
    setErroGeral(null);
  };

  if (retomando) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }} role="status" aria-label="Carregando recarga">
        <CircularProgress />
      </Box>
    );
  }

  // ----- resultado: sucesso -----
  if (recarga?.status === "CONFIRMADA") {
    return (
      <Stack spacing={2} sx={{ p: 2, alignItems: "center", textAlign: "center", pt: 4 }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 56 }} aria-hidden />
        <Typography variant="h5" component="h1">
          Recarga confirmada
        </Typography>
        <Typography>
          Recebemos o pagamento de <strong>{formatarReais(recarga.valorCentavos)}</strong>. O valor já está no seu saldo.
        </Typography>
        <Button component={Link} to="/" variant="contained" size="large" fullWidth>
          Ver meu saldo
        </Button>
        <Button variant="outlined" size="large" fullWidth onClick={novaRecarga}>
          Fazer outra recarga
        </Button>
      </Stack>
    );
  }

  // ----- resultado: falha ou prazo vencido -----
  if (recarga && (recarga.status === "RECUSADA" || recarga.status === "EXPIRADA")) {
    const recusada = recarga.status === "RECUSADA";
    return (
      <Stack spacing={2} sx={{ p: 2, alignItems: "center", textAlign: "center", pt: 4 }}>
        <ErrorOutlinedIcon color="error" sx={{ fontSize: 56 }} aria-hidden />
        <Typography variant="h5" component="h1">
          {recusada ? "Pagamento não concluído" : "Prazo do pagamento encerrado"}
        </Typography>
        <Typography>
          {recarga.motivoFalha ?? (recusada ? "O pagamento foi recusado." : "O prazo para pagar terminou.")}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Seu saldo não foi alterado.
        </Typography>
        <Button variant="contained" size="large" fullWidth onClick={novaRecarga}>
          Tentar de novo
        </Button>
      </Stack>
    );
  }

  // ----- aguardando o pagamento -----
  if (recarga) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          Pague com Pix
        </Typography>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Valor da recarga
            </Typography>
            <Typography variant="h4" component="p" sx={{ fontWeight: 700, color: "primary.main" }}>
              {formatarReais(recarga.valorCentavos)}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Pague até as {horaDe(recarga.expiraEm)}
            </Typography>
          </Paper>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }} id="rotulo-codigo">
              Código Pix (copia e cola)
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, wordBreak: "break-all", fontFamily: "monospace" }} aria-labelledby="rotulo-codigo">
              {recarga.codigoPagamento}
            </Paper>
          </Box>
          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={<ContentCopyIcon />}
            onClick={() => void copiar(recarga.codigoPagamento ?? "")}
            disabled={!recarga.codigoPagamento}
          >
            Copiar código
          </Button>
          {copiado === "sim" && <Alert severity="success">Código copiado. Cole no app do seu banco.</Alert>}
          {copiado === "nao" && <Alert severity="warning">Não foi possível copiar. Selecione o código acima e copie manualmente.</Alert>}

          <Alert severity="info" icon={<HourglassTopIcon />} role="status">
            Aguardando o pagamento. O saldo só aumenta depois que o banco confirmar.
          </Alert>
          {erroConsulta && <Alert severity="warning">Não foi possível verificar o pagamento agora: {erroConsulta} Vamos tentar de novo.</Alert>}

          {recarga.simulacao && (
            <Paper variant="outlined" sx={{ p: 2, borderStyle: "dashed" }}>
              <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                Modo demonstração: simule a resposta do banco. Nenhum dinheiro de verdade é usado.
              </Typography>
              {erroSimulacao && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {erroSimulacao}
                </Alert>
              )}
              <Stack spacing={1}>
                <Button variant="outlined" fullWidth onClick={() => void simular("CONFIRMADA")} disabled={simulando}>
                  Simular pagamento aprovado
                </Button>
                <Button variant="outlined" color="error" fullWidth onClick={() => void simular("RECUSADA")} disabled={simulando}>
                  Simular pagamento recusado
                </Button>
              </Stack>
            </Paper>
          )}

          <Button variant="text" size="large" fullWidth onClick={novaRecarga}>
            Escolher outro valor
          </Button>
        </Stack>
      </Box>
    );
  }

  // ----- escolher o valor -----
  return (
    <Box component="form" onSubmit={gerar} noValidate sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Recarregar
      </Typography>

      <Stack spacing={2}>
        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}

        <TextField
          label="Valor da recarga"
          name="valor"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErroServidor(null);
            setErroGeral(null);
          }}
          disabled={criando}
          required
          error={Boolean(erroValor)}
          helperText={erroValor ?? `De ${formatarReais(VALOR_MINIMO_CENTAVOS)} a ${formatarReais(VALOR_MAXIMO_CENTAVOS)}`}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> },
            htmlInput: { inputMode: "decimal", autoComplete: "off" },
          }}
        />

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }} role="group" aria-label="Valores sugeridos">
          {ATALHOS.map((c) => (
            <Chip
              key={c}
              label={formatarReais(c)}
              onClick={() => {
                setTexto((c / 100).toFixed(2).replace(".", ","));
                setErroServidor(null);
              }}
              disabled={criando}
              sx={{ minHeight: 44, px: 1 }}
              variant={lerReais(texto) === c ? "filled" : "outlined"}
              color={lerReais(texto) === c ? "primary" : "default"}
            />
          ))}
        </Stack>

        <Button type="submit" variant="contained" size="large" disabled={criando}>
          {criando ? "Gerando..." : "Gerar pagamento Pix"}
        </Button>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          O saldo só é creditado depois que o banco confirmar o pagamento.
        </Typography>
      </Stack>
    </Box>
  );
}
