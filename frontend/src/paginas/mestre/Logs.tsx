// Mestre consulta os logs de auditoria (HU-03): quem fez o quê e quando.
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, Paper, Typography } from "@mui/material";
import { ErroApi, requisitar } from "../../api/cliente";
import { formatarDataHora } from "../../utils/data";

type Log = {
  id: string;
  data: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  detalhes: Record<string, unknown> | null;
  autor: { id: string; nome: string } | null;
};
type Pagina = { itens: Log[]; proximoCursor: string | null };

const POR_PAGINA = 30;
const PERFIS: Record<string, string> = { ADMIN: "Admin", OPERADOR: "Operador", MESTRE: "Mestre" };

const url = (cursor?: string) => {
  const q = new URLSearchParams({ limite: String(POR_PAGINA) });
  if (cursor) q.set("cursor", cursor);
  return `/mestre/logs?${q.toString()}`;
};

/** Texto da linha do log. Ações desconhecidas aparecem pelo código, para nada ficar escondido. */
function descrever(log: Log): string {
  const d = log.detalhes ?? {};
  const perfil = typeof d["perfil"] === "string" ? (PERFIS[d["perfil"]] ?? d["perfil"]) : "";
  const email = typeof d["email"] === "string" ? d["email"] : "";
  if (log.acao === "CRIAR_CONTA") return `Conta criada: ${perfil} ${email}`.trim();
  if (log.acao === "CRIAR_MESTRE") return `Mestre criado: ${email}`.trim();
  return log.acao;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

type Carga = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; itens: Log[]; proximo: string | null };

export default function Logs() {
  const [carga, setCarga] = useState<Carga>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    requisitar<Pagina>(url())
      .then((p) => !cancelado && setCarga({ tipo: "ok", itens: p.itens, proximo: p.proximoCursor }))
      .catch((e: unknown) => !cancelado && setCarga({ tipo: "erro", mensagem: mensagemDe(e) }));
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  const tentarDeNovo = () => {
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
        const jaTem = new Set(c.itens.map((i) => i.id));
        return { tipo: "ok", itens: [...c.itens, ...p.itens.filter((i) => !jaTem.has(i.id))], proximo: p.proximoCursor };
      });
    } catch (e) {
      setErroMais(mensagemDe(e));
    } finally {
      setCarregandoMais(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Logs
      </Typography>

      <Box aria-live="polite">
        {carga.tipo === "carregando" && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Carregando logs">
            <CircularProgress />
          </Box>
        )}

        {carga.tipo === "erro" && (
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

        {carga.tipo === "ok" && carga.itens.length === 0 && <Alert severity="info">Ainda não há ações registradas.</Alert>}

        {carga.tipo === "ok" && carga.itens.length > 0 && (
          <>
            <Paper variant="outlined" component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {carga.itens.map((log, i) => (
                <Box key={log.id} component="li">
                  {i > 0 && <Divider />}
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{descrever(log)}</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>
                      {formatarDataHora(log.data)} · por {log.autor ? log.autor.nome : "instalação do sistema"}
                    </Typography>
                  </Box>
                </Box>
              ))}
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
                Você chegou ao fim dos registros.
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
