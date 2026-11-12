// Confirmação de e-mail (HU-01): abre pelo link enviado ao e-mail do cadastro.
import { useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Link as LinkRouter, useSearchParams } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";

type Etapa = { tipo: "pronto" } | { tipo: "enviando" } | { tipo: "ok"; mensagem: string } | { tipo: "erro"; mensagem: string };

export default function ConfirmarEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "pronto" });
  const jaEnviou = useRef(false);

  // A confirmação só acontece no toque do botão, e não ao abrir a página: o link é de uso único,
  // e programas de e-mail que abrem links para checar vírus o gastariam antes da pessoa.
  const confirmar = async () => {
    if (!token || jaEnviou.current) return;
    jaEnviou.current = true;
    setEtapa({ tipo: "enviando" });
    try {
      const r = await requisitar<{ mensagem: string }>("/auth/confirmar-email", { metodo: "POST", corpo: { token } });
      setEtapa({ tipo: "ok", mensagem: r.mensagem });
    } catch (e) {
      jaEnviou.current = false; // erro de conexão: pode tentar de novo
      setEtapa({ tipo: "erro", mensagem: e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente." });
    }
  };

  if (!token) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          Confirmar e-mail
        </Typography>
        <Alert severity="error">Link de confirmação inválido. Use o link que enviamos para o seu e-mail.</Alert>
        <Button component={LinkRouter} to="/cadastro" variant="contained" size="large">
          Fazer cadastro
        </Button>
      </Stack>
    );
  }

  if (etapa.tipo === "ok") {
    return (
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 56 }} aria-hidden />
        <Typography variant="h5" component="h1">
          E-mail confirmado
        </Typography>
        <Typography>{etapa.mensagem}</Typography>
        <Button component={LinkRouter} to="/entrar" variant="contained" size="large" fullWidth>
          Ir para o login
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Confirmar e-mail
      </Typography>
      <Typography>Toque no botão para confirmar seu e-mail e concluir o cadastro.</Typography>
      {etapa.tipo === "erro" && (
        <Alert severity="error">
          {etapa.mensagem}
        </Alert>
      )}
      <Button variant="contained" size="large" onClick={confirmar} disabled={etapa.tipo === "enviando"}>
        {etapa.tipo === "enviando" ? "Confirmando..." : "Confirmar e-mail"}
      </Button>
      {etapa.tipo === "erro" && (
        <Button component={LinkRouter} to="/cadastro" variant="text" size="large">
          Fazer cadastro de novo
        </Button>
      )}
    </Stack>
  );
}
