// T07 - Leitura do QR Code pelo Operador (HU-07) e resultado do débito (HU-08).
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Collapse, Paper, Stack, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { Scanner } from "@yudiel/react-qr-scanner";
import { ErroApi, requisitar } from "../../api/cliente";
import { formatarReais } from "../../utils/moeda";

/** Depois de mostrar o resultado, a tela volta a ler sozinha (o Operador atende uma fila). */
export const VOLTAR_A_LER_MS = 5000;

type Resposta = {
  resultado: string;
  liberado: boolean;
  mensagem: string;
  aluno?: { nome: string };
  valorCobradoCentavos?: number;
};
type Estado = { tipo: "lendo" } | { tipo: "enviando" } | { tipo: "resultado"; resposta: Resposta } | { tipo: "erro"; mensagem: string };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function Leitura() {
  const [estado, setEstado] = useState<Estado>({ tipo: "lendo" });
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [mostrarManual, setMostrarManual] = useState(false);
  const ocupado = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const enviar = useCallback(async (token: string) => {
    // Um código por vez: a câmera pode detectar o mesmo QR várias vezes seguidas.
    if (ocupado.current) return;
    ocupado.current = true;
    setEstado({ tipo: "enviando" });
    try {
      const resposta = await requisitar<Resposta>("/leituras", { metodo: "POST", corpo: { token } });
      if (montado.current) setEstado({ tipo: "resultado", resposta });
    } catch (e) {
      if (montado.current) setEstado({ tipo: "erro", mensagem: mensagemDe(e) });
    } finally {
      ocupado.current = false;
    }
  }, []);

  const lerOutro = useCallback(() => {
    setManual("");
    setEstado({ tipo: "lendo" });
  }, []);

  // Volta a ler sozinho depois do resultado.
  useEffect(() => {
    if (estado.tipo !== "resultado") return;
    const t = setTimeout(lerOutro, VOLTAR_A_LER_MS);
    return () => clearTimeout(t);
  }, [estado, lerOutro]);

  const enviarManual = () => {
    const texto = manual.trim();
    if (texto) void enviar(texto);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Ler QR Code
      </Typography>

      {estado.tipo === "resultado" && <Resultado resposta={estado.resposta} onProximo={lerOutro} />}

      {estado.tipo === "erro" && (
        <Stack spacing={2}>
          <Alert severity="error">{estado.mensagem}</Alert>
          <Button variant="contained" size="large" fullWidth onClick={lerOutro}>
            Tentar de novo
          </Button>
        </Stack>
      )}

      {estado.tipo === "enviando" && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 2 }} role="status" aria-label="Conferindo o código">
          <CircularProgress />
          <Typography>Conferindo o código...</Typography>
        </Box>
      )}

      {estado.tipo === "lendo" && (
        <Stack spacing={2}>
          {erroCamera ? (
            <Alert severity="warning">{erroCamera} Use o campo abaixo para colar o código.</Alert>
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 2 }}>
              <Scanner
                onScan={(codigos) => {
                  const lido = codigos[0]?.rawValue;
                  if (lido) void enviar(lido);
                }}
                onError={(e) => {
                  const nome = (e as { name?: string } | null)?.name;
                  setErroCamera(
                    nome === "NotAllowedError"
                      ? "Permita o uso da câmera no navegador para ler o QR Code."
                      : "Não foi possível abrir a câmera deste aparelho.",
                  );
                  setMostrarManual(true);
                }}
                formats={["qr_code"]}
                constraints={{ facingMode: "environment" }}
                sound={false}
              />
            </Paper>
          )}
          {!erroCamera && <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>Aponte a câmera para o QR Code do aluno.</Typography>}

          <Button variant="text" size="large" fullWidth onClick={() => setMostrarManual((v) => !v)} aria-expanded={mostrarManual}>
            Colar o código manualmente
          </Button>
          <Collapse in={mostrarManual} unmountOnExit>
            <Stack spacing={1}>
              <TextField
                label="Código do QR"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                multiline
                minRows={2}
                fullWidth
                slotProps={{ htmlInput: { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } }}
              />
              <Button variant="contained" size="large" fullWidth onClick={enviarManual} disabled={!manual.trim()}>
                Conferir código
              </Button>
            </Stack>
          </Collapse>
        </Stack>
      )}
    </Box>
  );
}

function Resultado({ resposta, onProximo }: { resposta: Resposta; onProximo: () => void }) {
  const ok = resposta.liberado;
  return (
    <Stack spacing={2}>
      <Paper
        role="status"
        aria-live="assertive"
        sx={{ p: 3, textAlign: "center", bgcolor: ok ? "primary.main" : "error.main", color: "#fff" }}
      >
        {ok ? <CheckCircleIcon sx={{ fontSize: 72 }} /> : <CancelIcon sx={{ fontSize: 72 }} />}
        <Typography variant="h4" component="h2" sx={{ fontWeight: 700 }}>
          {ok ? "Liberado" : "Negado"}
        </Typography>
        {!ok && <Typography variant="h6" component="p">{resposta.mensagem}</Typography>}
        {resposta.aluno && (
          <Typography variant="h6" component="p" sx={{ mt: 1, overflowWrap: "anywhere" }}>
            {resposta.aluno.nome}
          </Typography>
        )}
        {ok && resposta.valorCobradoCentavos !== undefined && (
          <Typography variant="body1" sx={{ mt: 0.5 }}>
            {resposta.valorCobradoCentavos === 0 ? "Refeição isenta (PAE)" : `Cobrado ${formatarReais(resposta.valorCobradoCentavos)}`}
          </Typography>
        )}
      </Paper>
      <Button variant="contained" size="large" fullWidth onClick={onProximo}>
        Ler próximo
      </Button>
    </Stack>
  );
}
