// T-Admin: fila de cadastros pendentes, com a declaração e as ações de aprovar e rejeitar (HU-20).
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ErroApi, requisitar, requisitarArquivo } from "../../api/cliente";
import { formatarDataHora } from "../../utils/data";

type Pendente = {
  usuarioId: string;
  nome: string;
  email: string;
  identificador: string | null;
  declaracaoId: string;
  enviadaEm: string;
};
type Pagina = { itens: Pendente[]; proximoCursor: string | null };
type Carga = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; itens: Pendente[]; proximo: string | null };
type Aviso = { gravidade: "success" | "info"; texto: string };

const POR_PAGINA = 20;
const MOTIVO_MIN = 5;
const MOTIVO_MAX = 300;

const url = (cursor?: string) => {
  const q = new URLSearchParams({ limite: String(POR_PAGINA) });
  if (cursor) q.set("cursor", cursor);
  return `/admin/cadastros?${q.toString()}`;
};
const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function Cadastros() {
  const [carga, setCarga] = useState<Carga>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [errosDeclaracao, setErrosDeclaracao] = useState<Record<string, string>>({});
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState<Pendente | null>(null);
  const [rejeitando, setRejeitando] = useState<Pendente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tentouRejeitar, setTentouRejeitar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  const urlsAbertas = useRef<string[]>([]);

  useEffect(() => {
    let cancelado = false;
    requisitar<Pagina>(url())
      .then((p) => !cancelado && setCarga({ tipo: "ok", itens: p.itens, proximo: p.proximoCursor }))
      .catch((e: unknown) => !cancelado && setCarga({ tipo: "erro", mensagem: mensagemDe(e) }));
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  // Libera da memória os arquivos temporários abertos ao sair da tela.
  useEffect(() => {
    const abertas = urlsAbertas.current;
    return () => abertas.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const recarregar = () => {
    setCarga({ tipo: "carregando" });
    setTentativa((n) => n + 1);
  };

  const carregarMais = async () => {
    if (carga.tipo !== "ok" || !carga.proximo || carregandoMais) return;
    const cursor = carga.proximo;
    setCarregandoMais(true);
    setErroMais(null);
    try {
      const p = await requisitar<Pagina>(url(cursor));
      setCarga((c) => {
        if (c.tipo !== "ok" || c.proximo !== cursor) return c;
        const jaTem = new Set(c.itens.map((i) => i.usuarioId));
        return { tipo: "ok", itens: [...c.itens, ...p.itens.filter((i) => !jaTem.has(i.usuarioId))], proximo: p.proximoCursor };
      });
    } catch (e) {
      setErroMais(mensagemDe(e));
    } finally {
      setCarregandoMais(false);
    }
  };

  /** Tira o cadastro da fila; se a fila local esvaziou mas há mais páginas, busca de novo. */
  const removerDaFila = (usuarioId: string) => {
    if (carga.tipo !== "ok") return;
    const itens = carga.itens.filter((i) => i.usuarioId !== usuarioId);
    if (itens.length === 0 && carga.proximo) recarregar();
    else setCarga({ ...carga, itens });
  };

  const verDeclaracao = async (item: Pendente) => {
    setErrosDeclaracao((e) => ({ ...e, [item.usuarioId]: "" }));
    // Abre a aba já no toque (antes da espera), senão o navegador a trata como pop-up e bloqueia.
    const janela = window.open("", "_blank");
    if (!janela) {
      setErrosDeclaracao((e) => ({ ...e, [item.usuarioId]: "O navegador bloqueou a nova aba. Permita pop-ups e tente de novo." }));
      return;
    }
    setAbrindo(item.usuarioId);
    try {
      const arquivo = await requisitarArquivo(`/admin/declaracoes/${item.declaracaoId}/arquivo`);
      const endereco = URL.createObjectURL(arquivo);
      urlsAbertas.current.push(endereco);
      janela.location.href = endereco;
    } catch (e) {
      janela.close();
      setErrosDeclaracao((x) => ({ ...x, [item.usuarioId]: mensagemDe(e) }));
    } finally {
      setAbrindo(null);
    }
  };

  const fecharDialogos = () => {
    if (enviando) return;
    setAprovando(null);
    setRejeitando(null);
    setMotivo("");
    setTentouRejeitar(false);
    setErroDialogo(null);
  };

  /** Resposta do servidor a uma decisão: sucesso ou "já foi analisado por outro Admin" saem da fila. */
  const decidir = async (item: Pendente, acao: "aprovar" | "rejeitar") => {
    setEnviando(true);
    setErroDialogo(null);
    try {
      await requisitar(`/admin/cadastros/${item.usuarioId}/${acao}`, {
        metodo: "POST",
        ...(acao === "rejeitar" && { corpo: { motivo: motivo.trim() } }),
      });
      setAviso({ gravidade: "success", texto: `Cadastro de ${item.nome} ${acao === "aprovar" ? "aprovado" : "rejeitado"}.` });
      removerDaFila(item.usuarioId);
      setAprovando(null);
      setRejeitando(null);
      setMotivo("");
      setTentouRejeitar(false);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) {
        setAviso({ gravidade: "info", texto: `${e.message} A lista foi atualizada.` });
        setAprovando(null);
        setRejeitando(null);
        setMotivo("");
        recarregar();
      } else {
        setErroDialogo(mensagemDe(e));
      }
    } finally {
      setEnviando(false);
    }
  };

  const motivoLimpo = motivo.trim();
  const erroMotivo =
    motivoLimpo.length < MOTIVO_MIN ? `Informe o motivo da rejeição (de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).` : undefined;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Cadastros
      </Typography>

      {aviso && (
        <Alert severity={aviso.gravidade} onClose={() => setAviso(null)} sx={{ mb: 2 }}>
          {aviso.texto}
        </Alert>
      )}

      <Box aria-live="polite">
        {carga.tipo === "carregando" && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Carregando cadastros">
            <CircularProgress />
          </Box>
        )}

        {carga.tipo === "erro" && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={recarregar}>
                Tentar de novo
              </Button>
            }
          >
            {carga.mensagem}
          </Alert>
        )}

        {carga.tipo === "ok" && carga.itens.length === 0 && <Alert severity="success">Nenhum cadastro aguardando análise.</Alert>}

        {carga.tipo === "ok" && carga.itens.length > 0 && (
          <>
            <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {carga.itens.map((item) => (
                <Paper key={item.usuarioId} component="li" variant="outlined" sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{item.nome}</Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>
                    {item.email}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    RA: {item.identificador ?? "não informado"}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
                    Declaração enviada em {formatarDataHora(item.enviadaEm)}
                  </Typography>

                  {errosDeclaracao[item.usuarioId] && (
                    <Alert severity="error" sx={{ mb: 1.5 }}>
                      {errosDeclaracao[item.usuarioId]}
                    </Alert>
                  )}
                  <Stack spacing={1}>
                    <Button variant="outlined" fullWidth onClick={() => void verDeclaracao(item)} disabled={abrindo === item.usuarioId}>
                      {abrindo === item.usuarioId ? "Abrindo..." : "Ver declaração"}
                    </Button>
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" color="error" fullWidth onClick={() => setRejeitando(item)}>
                        Rejeitar
                      </Button>
                      <Button variant="contained" fullWidth onClick={() => setAprovando(item)}>
                        Aprovar
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            {erroMais && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {erroMais}
              </Alert>
            )}
            {carga.proximo && (
              <Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={carregarMais} disabled={carregandoMais}>
                {carregandoMais ? "Carregando..." : erroMais ? "Tentar de novo" : "Carregar mais"}
              </Button>
            )}
          </>
        )}
      </Box>

      <Dialog open={aprovando !== null} onClose={fecharDialogos} fullWidth maxWidth="xs">
        <DialogTitle>Aprovar cadastro?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {aprovando?.nome} poderá recarregar a carteira e gerar o QR Code.
          </DialogContentText>
          {erroDialogo && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {erroDialogo}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={fecharDialogos} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={() => aprovando && void decidir(aprovando, "aprovar")} disabled={enviando}>
            {enviando ? "Aprovando..." : "Aprovar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejeitando !== null} onClose={fecharDialogos} fullWidth maxWidth="xs">
        <DialogTitle>Rejeitar cadastro</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {rejeitando?.nome} verá este motivo e poderá reenviar o RA e a declaração.
          </DialogContentText>
          {erroDialogo && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erroDialogo}
            </Alert>
          )}
          <TextField
            label="Motivo da rejeição"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErroDialogo(null);
            }}
            multiline
            minRows={3}
            required
            disabled={enviando}
            error={tentouRejeitar && Boolean(erroMotivo)}
            helperText={(tentouRejeitar && erroMotivo) || `${motivo.length}/${MOTIVO_MAX}`}
            slotProps={{ htmlInput: { maxLength: MOTIVO_MAX } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={fecharDialogos} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={enviando}
            onClick={() => {
              setTentouRejeitar(true);
              if (!erroMotivo && rejeitando) void decidir(rejeitando, "rejeitar");
            }}
          >
            {enviando ? "Rejeitando..." : "Rejeitar cadastro"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
