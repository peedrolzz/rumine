// T04 - Primeiro acesso e status do cadastro (HU-02): envio do RA e da declaração, "em análise"
// e "rejeitado" (com o motivo e reenvio). A decisão do Admin é da HU-20.
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { Navigate } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";
import { useAuth } from "../../auth/contexto";
import Carregando from "../../componentes/Carregando";
import { formatarDataHora } from "../../utils/data";
import FormularioVinculo from "./FormularioVinculo";

type Vinculo = {
  status: "PENDENTE_EMAIL" | "PENDENTE_APROVACAO" | "ATIVO" | "REJEITADO" | "DESATIVADO";
  identificador: string | null;
  declaracaoEnviadaEm: string | null;
  motivoRejeicao: string | null;
};
type Carga = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; vinculo: Vinculo };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");

export default function StatusCadastro() {
  const { estado, recarregar, sair } = useAuth();
  const [carga, setCarga] = useState<Carga>({ tipo: "carregando" });
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(() => requisitar<Vinculo>("/vinculo"), []);

  useEffect(() => {
    let cancelado = false;
    buscar()
      .then((vinculo) => !cancelado && setCarga({ tipo: "ok", vinculo }))
      .catch((e: unknown) => !cancelado && setCarga({ tipo: "erro", mensagem: mensagemDe(e) }));
    return () => {
      cancelado = true;
    };
  }, [buscar]);

  if (estado.tipo !== "autenticado") return null; // a guarda de rota já trata esses casos
  if (estado.usuario.status === "ATIVO") return <Navigate to="/" replace />;

  /** Atualiza a sessão e o vínculo em silêncio (sem trocar a tela por "carregando"). */
  const atualizarTudo = async () => {
    await recarregar({ silencioso: true });
    try {
      setCarga({ tipo: "ok", vinculo: await buscar() });
    } catch (e) {
      setCarga({ tipo: "erro", mensagem: mensagemDe(e) });
    }
  };

  const atualizar = async () => {
    setAtualizando(true);
    setAviso(null);
    setEnviado(false);
    await atualizarTudo();
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

  const botaoSair = (
    <Button variant="outlined" size="large" fullWidth onClick={fazerSair} disabled={saindo}>
      {saindo ? "Saindo..." : "Sair"}
    </Button>
  );

  if (carga.tipo === "carregando") return <Carregando rotulo="Carregando seu cadastro" />;

  if (carga.tipo === "erro") {
    return (
      <Stack spacing={2} sx={{ p: 2, maxWidth: 480, mx: "auto", pt: 4 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              onClick={() => {
                setCarga({ tipo: "carregando" });
                void atualizarTudo();
              }}
            >
              Tentar de novo
            </Button>
          }
        >
          {carga.mensagem}
        </Alert>
        {botaoSair}
      </Stack>
    );
  }

  const { vinculo } = carga;
  const rejeitado = vinculo.status === "REJEITADO";
  const semDeclaracao = !rejeitado && !vinculo.declaracaoEnviadaEm;

  const aoEnviar = async () => {
    setEnviado(true);
    setAviso(null);
    await atualizarTudo();
  };

  return (
    <Box sx={{ p: 2, maxWidth: 480, mx: "auto" }}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", pt: 4 }}>
        {rejeitado ? (
          <ErrorOutlinedIcon color="error" sx={{ fontSize: 56 }} aria-hidden />
        ) : semDeclaracao ? (
          <AssignmentIcon color="primary" sx={{ fontSize: 56 }} aria-hidden />
        ) : (
          <HourglassTopIcon color="primary" sx={{ fontSize: 56 }} aria-hidden />
        )}

        <Typography variant="h5" component="h1">
          {rejeitado ? "Cadastro não aprovado" : semDeclaracao ? "Comprove seu vínculo" : "Cadastro em análise"}
        </Typography>

        {rejeitado && (
          <>
            <Typography>
              {vinculo.motivoRejeicao ? (
                <>
                  Motivo: <strong>{vinculo.motivoRejeicao}</strong>
                </>
              ) : (
                "Seu cadastro não foi aprovado. Fale com o RU para saber o motivo."
              )}
            </Typography>
            <Typography>Corrija o que for preciso e envie de novo seu RA e a declaração de matrícula.</Typography>
          </>
        )}
        {semDeclaracao && (
          <Typography>
            Seu e-mail foi confirmado. Para usar o app, informe seu RA e envie a declaração de matrícula. Você só faz isso uma vez.
          </Typography>
        )}
        {!rejeitado && !semDeclaracao && (
          <>
            {enviado && <Alert severity="success">Declaração enviada!</Alert>}
            <Typography>
              Recebemos seu RA e sua declaração. Eles aguardam a análise do Admin. Quando for aprovado, você poderá usar o app.
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              RA {vinculo.identificador} · enviada em {formatarDataHora(vinculo.declaracaoEnviadaEm!)}
            </Typography>
          </>
        )}
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Conta: {estado.usuario.email}
        </Typography>

        {(rejeitado || semDeclaracao) && (
          <FormularioVinculo
            // Reinicia o formulário quando a situação muda (ex.: depois de um reenvio).
            key={`${vinculo.status}-${vinculo.declaracaoEnviadaEm ?? "sem"}`}
            identificadorInicial={vinculo.identificador ?? ""}
            aoEnviar={() => void aoEnviar()}
            aoConflito={() => void atualizarTudo()}
            rotuloBotao={rejeitado ? "Reenviar para análise" : "Enviar para análise"}
          />
        )}

        {aviso && <Alert severity="info">{aviso}</Alert>}
        {erro && <Alert severity="error">{erro}</Alert>}

        {!rejeitado && !semDeclaracao && (
          <Button variant="contained" size="large" fullWidth onClick={atualizar} disabled={atualizando}>
            {atualizando ? "Atualizando..." : "Atualizar"}
          </Button>
        )}
        {botaoSair}
      </Stack>
    </Box>
  );
}
