// T14 - Usuário consulta o cardápio de uma data (HU-12).
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ErroApi, requisitar } from "../../api/cliente";
import { GRUPOS, ROTULOS, type Cardapio as CardapioDia } from "../../cardapio/campos";
import {
  ANO_MAX,
  ANO_MIN,
  aplicarMascara,
  dentroDoIntervalo,
  diaDaSemana,
  hojeIso,
  paraBr,
  paraIso,
  somarDias,
} from "../../utils/data";

// Resultado da consulta de uma data. `iso` diz a qual data ele pertence:
// enquanto não coincide com a data escolhida, a tela está carregando.
type Resultado =
  | { iso: string; tipo: "ok"; cardapio: CardapioDia }
  | { iso: string; tipo: "vazio" }
  | { iso: string; tipo: "erro"; mensagem: string };

export default function Cardapio() {
  const [dataIso, setDataIso] = useState(() => hojeIso());
  const [texto, setTexto] = useState(() => paraBr(hojeIso()));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    requisitar<CardapioDia>(`/cardapios/${dataIso}`)
      .then((cardapio) => !cancelado && setResultado({ iso: dataIso, tipo: "ok", cardapio }))
      .catch((e: unknown) => {
        if (cancelado) return;
        // 404 = ainda não publicado (estado vazio, não é erro).
        if (e instanceof ErroApi && e.status === 404) setResultado({ iso: dataIso, tipo: "vazio" });
        else {
          const mensagem = e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.";
          setResultado({ iso: dataIso, tipo: "erro", mensagem });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [dataIso, tentativa]);

  const carregando = resultado?.iso !== dataIso;
  const hoje = hojeIso();

  const irPara = (iso: string) => {
    setDataIso(iso);
    setTexto(paraBr(iso));
  };

  const digitar = (valor: string) => {
    const mascarado = aplicarMascara(valor);
    setTexto(mascarado);
    const iso = paraIso(mascarado);
    if (iso && dentroDoIntervalo(iso)) setDataIso(iso);
  };

  const tentarDeNovo = () => {
    setResultado(null);
    setTentativa((n) => n + 1);
  };

  const isoDigitado = paraIso(texto);
  const erroData =
    texto.length < 10
      ? undefined
      : !isoDigitado
        ? "Informe uma data válida, no formato dd/mm/aaaa."
        : !dentroDoIntervalo(isoDigitado)
          ? `Use uma data entre os anos ${ANO_MIN} e ${ANO_MAX}.`
          : undefined;

  const legenda = dataIso === hoje ? "Hoje" : dataIso === somarDias(hoje, 1) ? "Amanhã" : dataIso === somarDias(hoje, -1) ? "Ontem" : " ";

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Cardápio
      </Typography>

      {/* Navegação por dia: setas para o dia anterior e o próximo (wireframe T14) */}
      <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, mb: 2 }}>
        <IconButton
          aria-label="Dia anterior"
          onClick={() => irPara(somarDias(dataIso, -1))}
          disabled={!dentroDoIntervalo(somarDias(dataIso, -1))}
          sx={{ width: 44, height: 44 }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {diaDaSemana(dataIso)}, {paraBr(dataIso)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {legenda}
          </Typography>
        </Box>
        <IconButton
          aria-label="Próximo dia"
          onClick={() => irPara(somarDias(dataIso, 1))}
          disabled={!dentroDoIntervalo(somarDias(dataIso, 1))}
          sx={{ width: 44, height: 44 }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Paper>

      {/* Ir direto para outra data */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 3 }}>
        <TextField
          label="Ir para a data"
          placeholder="dd/mm/aaaa"
          value={texto}
          onChange={(e) => digitar(e.target.value)}
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 10 } }}
          error={Boolean(erroData)}
          helperText={erroData ?? "Dia, mês e ano. Exemplo: 10/11/2026"}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button variant="outlined" onClick={() => irPara(hoje)} disabled={dataIso === hoje && texto === paraBr(hoje)} sx={{ height: 56, flexShrink: 0 }}>
          Hoje
        </Button>
      </Stack>

      <Box aria-live="polite">
        {carregando && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }} role="status" aria-label="Carregando cardápio">
            <CircularProgress />
          </Box>
        )}

        {!carregando && resultado?.tipo === "vazio" && (
          <Alert severity="info">
            {dataIso === hoje ? "O cardápio de hoje ainda não foi publicado." : "O cardápio desta data ainda não foi publicado."}
            <br />
            Volte mais tarde ou escolha outra data.
          </Alert>
        )}

        {!carregando && resultado?.tipo === "erro" && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={tentarDeNovo}>
                Tentar de novo
              </Button>
            }
          >
            {resultado.mensagem}
          </Alert>
        )}

        {!carregando && resultado?.tipo === "ok" && (
          <Stack spacing={2}>
            {GRUPOS.map((grupo) => (
              <Paper key={grupo.titulo} variant="outlined" component="section" sx={{ p: 2 }}>
                <Typography variant="subtitle1" component="h2" sx={{ color: "primary.main", fontWeight: 700, mb: 1 }}>
                  {grupo.titulo}
                </Typography>
                {grupo.campos.map((campo, i) => (
                  <Box key={campo}>
                    {i > 0 && <Divider sx={{ my: 1 }} />}
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {ROTULOS[campo]}
                    </Typography>
                    <Typography sx={{ overflowWrap: "anywhere" }}>{resultado.cardapio[campo] || "Não informado"}</Typography>
                  </Box>
                ))}
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
