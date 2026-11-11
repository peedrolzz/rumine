// T02 - Cadastro (HU-01).
import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import { Link as LinkRouter } from "react-router-dom";
import { ErroApi, requisitar } from "../../api/cliente";
import { validarCadastro, type CamposCadastro, type ErrosCadastro } from "../../auth/validacao";
import CampoSenha from "../../componentes/CampoSenha";
import RegrasSenha from "../../componentes/RegrasSenha";

const CAMPOS: (keyof CamposCadastro)[] = ["nome", "email", "senha"];

export default function Cadastro() {
  const [dados, setDados] = useState<CamposCadastro>({ nome: "", email: "", senha: "" });
  const [tocados, setTocados] = useState<Partial<Record<keyof CamposCadastro, boolean>>>({});
  const [tentou, setTentou] = useState(false);
  const [errosServidor, setErrosServidor] = useState<ErrosCadastro>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  const errosLocais = validarCadastro(dados);
  // Erro do campo: o do servidor (até a pessoa editar) ou o da conferência local,
  // este só depois de a pessoa sair do campo ou tentar enviar.
  const erroDe = (campo: keyof CamposCadastro) =>
    errosServidor[campo] ?? (tentou || tocados[campo] ? errosLocais[campo] : undefined);

  const alterar = (campo: keyof CamposCadastro, valor: string) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    setErrosServidor((e) => ({ ...e, [campo]: undefined }));
    setErroGeral(null);
  };
  const sairDoCampo = (campo: keyof CamposCadastro) => setTocados((t) => ({ ...t, [campo]: true }));

  const enviar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    if (enviando) return;
    setTentou(true);
    if (Object.keys(errosLocais).length > 0) return;

    setEnviando(true);
    setErroGeral(null);
    try {
      await requisitar("/auth/cadastro", {
        metodo: "POST",
        corpo: { nome: dados.nome.trim(), email: dados.email.trim(), senha: dados.senha },
      });
      setEnviadoPara(dados.email.trim().toLowerCase());
    } catch (e) {
      if (e instanceof ErroApi && e.campo && (CAMPOS as string[]).includes(e.campo)) {
        setErrosServidor({ [e.campo]: e.message });
      } else {
        setErroGeral(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  };

  if (enviadoPara) {
    return (
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <MarkEmailReadIcon color="primary" sx={{ fontSize: 56 }} aria-hidden />
        <Typography variant="h5" component="h1">
          Verifique seu e-mail
        </Typography>
        <Typography>
          Enviamos um link de confirmação para <strong>{enviadoPara}</strong>. Abra a mensagem e toque em <em>Confirmar e-mail</em> para
          concluir seu cadastro.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Não chegou? Veja a caixa de spam ou faça o cadastro de novo com o mesmo e-mail para receber outro link.
        </Typography>
        <Button component={LinkRouter} to="/entrar" variant="contained" size="large" fullWidth>
          Ir para o login
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={enviar} noValidate>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Criar conta
      </Typography>

      <Stack spacing={2}>
        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}

        <TextField
          label="Nome completo"
          name="nome"
          value={dados.nome}
          onChange={(e) => alterar("nome", e.target.value)}
          onBlur={() => sairDoCampo("nome")}
          autoComplete="name"
          disabled={enviando}
          required
          error={Boolean(erroDe("nome"))}
          helperText={erroDe("nome")}
        />
        <TextField
          label="E-mail institucional"
          name="email"
          type="email"
          value={dados.email}
          onChange={(e) => alterar("email", e.target.value)}
          onBlur={() => sairDoCampo("email")}
          autoComplete="email"
          disabled={enviando}
          required
          error={Boolean(erroDe("email"))}
          helperText={erroDe("email") ?? "Use seu e-mail @alunos.utfpr.edu.br"}
          slotProps={{ htmlInput: { inputMode: "email", autoCapitalize: "none" } }}
        />
        <Box>
          <CampoSenha
            label="Senha"
            value={dados.senha}
            onChange={(v) => alterar("senha", v)}
            onBlur={() => sairDoCampo("senha")}
            autoComplete="new-password"
            disabled={enviando}
            error={Boolean(erroDe("senha"))}
            helperText={erroDe("senha")}
          />
          <Box sx={{ mt: 1 }}>
            <RegrasSenha senha={dados.senha} />
          </Box>
        </Box>

        <Button type="submit" variant="contained" size="large" disabled={enviando}>
          {enviando ? "Enviando..." : "Continuar"}
        </Button>
        <Button component={LinkRouter} to="/entrar" variant="text" size="large">
          Já tenho conta
        </Button>
      </Stack>
    </Box>
  );
}
