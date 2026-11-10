// T13 - Usuário consulta o histórico de recargas, refeições e estornos (HU-09).
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, Paper, Tab, Tabs, Typography } from "@mui/material";
import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import UndoIcon from "@mui/icons-material/Undo";
import { ErroApi, requisitar } from "../../api/cliente";
import { formatarDataHora } from "../../utils/data";
import { formatarReais } from "../../utils/moeda";

type Filtro = "todos" | "recargas" | "consumo" | "estornos";
type TipoMovimento = "RECARGA" | "DEBITO_REFEICAO" | "ESTORNO" | "REFEICAO_ISENTA";

type Item = {
  id: string;
  tipo: TipoMovimento;
  valorCentavos: number;
  saldoAposCentavos: number | null;
  data: string;
};
type Pagina = { itens: Item[]; proximoCursor: string | null };

const POR_PAGINA = 20;

const ABAS: { filtro: Filtro; rotulo: string; vazio: string }[] = [
  { filtro: "todos", rotulo: "Tudo", vazio: "Você ainda não tem movimentações." },
  { filtro: "recargas", rotulo: "Recargas", vazio: "Você ainda não fez nenhuma recarga." },
  { filtro: "consumo", rotulo: "Consumo", vazio: "Você ainda não consumiu nenhuma refeição." },
  { filtro: "estornos", rotulo: "Estornos", vazio: "Você não tem nenhum estorno." },
];

// Como cada tipo aparece: nome, ícone e sinal do valor (+ entra dinheiro, - sai, sem sinal = isento).
const TIPOS: Record<TipoMovimento, { nome: string; icone: React.ReactNode; sinal: "+" | "-" | "" }> = {
  RECARGA: { nome: "Recarga", icone: <AddCircleOutlinedIcon />, sinal: "+" },
  DEBITO_REFEICAO: { nome: "Refeição", icone: <RestaurantIcon />, sinal: "-" },
  ESTORNO: { nome: "Estorno", icone: <UndoIcon />, sinal: "+" },
  REFEICAO_ISENTA: { nome: "Refeição (PAE)", icone: <RestaurantIcon />, sinal: "" },
};

const COR_SINAL = { "+": "success.main", "-": "error.main", "": "text.secondary" } as const;

// Primeira página de um filtro. `filtro` diz a qual aba o resultado pertence:
// enquanto não coincide com a aba escolhida, a tela está carregando.
type Carga =
  | { filtro: Filtro; tipo: "ok"; itens: Item[]; proximo: string | null }
  | { filtro: Filtro; tipo: "erro"; mensagem: string };

const url = (filtro: Filtro, cursor?: string) => {
  const q = new URLSearchParams({ tipo: filtro, limite: String(POR_PAGINA) });
  if (cursor) q.set("cursor", cursor);
  return `/historico?${q.toString()}`;
};

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function Historico() {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [carga, setCarga] = useState<Carga | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState<string | null>(null);
  // Muda a cada troca de aba: respostas de "carregar mais" de uma aba antiga são descartadas.
  const geracao = useRef(0);

  useEffect(() => {
    let cancelado = false;
    requisitar<Pagina>(url(filtro))
      .then((p) => !cancelado && setCarga({ filtro, tipo: "ok", itens: p.itens, proximo: p.proximoCursor }))
      .catch((e: unknown) => !cancelado && setCarga({ filtro, tipo: "erro", mensagem: mensagemDe(e) }));
    return () => {
      cancelado = true;
    };
  }, [filtro, tentativa]);

  const carregando = carga?.filtro !== filtro;

  const trocarAba = (novo: Filtro) => {
    if (novo === filtro) return;
    geracao.current++;
    setFiltro(novo);
    setCarregandoMais(false);
    setErroMais(null);
  };

  const tentarDeNovo = () => {
    setCarga(null);
    setTentativa((n) => n + 1);
  };

  const carregarMais = async () => {
    if (carga?.tipo !== "ok" || !carga.proximo || carregandoMais) return;
    const cursor = carga.proximo;
    const g = geracao.current;
    setCarregandoMais(true);
    setErroMais(null);
    try {
      const p = await requisitar<Pagina>(url(filtro, cursor));
      if (g !== geracao.current) return; // trocou de aba enquanto carregava
      setCarga((c) => {
        if (c?.tipo !== "ok" || c.proximo !== cursor) return c;
        const jaTem = new Set(c.itens.map((i) => i.id));
        return { ...c, itens: [...c.itens, ...p.itens.filter((i) => !jaTem.has(i.id))], proximo: p.proximoCursor };
      });
    } catch (e) {
      if (g === geracao.current) setErroMais(mensagemDe(e));
    } finally {
      if (g === geracao.current) setCarregandoMais(false);
    }
  };

  const aba = ABAS.find((a) => a.filtro === filtro)!;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Histórico
      </Typography>

      <Tabs
        value={filtro}
        onChange={(_, v: Filtro) => trocarAba(v)}
        variant="scrollable"
        scrollButtons={false}
        aria-label="Filtrar movimentações"
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        {ABAS.map((a) => (
          <Tab key={a.filtro} value={a.filtro} label={a.rotulo} />
        ))}
      </Tabs>

      <Box aria-live="polite">
        {carregando && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Carregando histórico">
            <CircularProgress />
          </Box>
        )}

        {!carregando && carga?.tipo === "erro" && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={tentarDeNovo}>
                Tentar de novo
              </Button>
            }
          >
            {carga.mensagem}
          </Alert>
        )}

        {!carregando && carga?.tipo === "ok" && carga.itens.length === 0 && <Alert severity="info">{aba.vazio}</Alert>}

        {!carregando && carga?.tipo === "ok" && carga.itens.length > 0 && (
          <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {carga.itens.map((item, i) => {
                const tipo = TIPOS[item.tipo];
                return (
                  <Box key={item.id} component="li">
                    {i > 0 && <Divider />}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}>
                      <Box sx={{ color: COR_SINAL[tipo.sinal], display: "flex", flexShrink: 0 }} aria-hidden>
                        {tipo.icone}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }}>{tipo.nome}</Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {formatarDataHora(item.data)}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: 700, color: COR_SINAL[tipo.sinal] }}>
                          {tipo.sinal && `${tipo.sinal} `}
                          {formatarReais(item.valorCentavos)}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {item.saldoAposCentavos === null ? "Isenta" : `Saldo: ${formatarReais(item.saldoAposCentavos)}`}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Paper>

            {erroMais && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {erroMais}
              </Alert>
            )}

            {carga.proximo ? (
              <Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={carregarMais} disabled={carregandoMais}>
                {carregandoMais ? "Carregando..." : erroMais ? "Tentar de novo" : "Carregar mais"}
              </Button>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", mt: 2 }}>
                Você chegou ao fim do histórico.
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
