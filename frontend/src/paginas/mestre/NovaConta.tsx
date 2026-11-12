// Mestre cria contas de Admin e Operador (HU-03). A conta já nasce ativa, com senha temporária.
import { useState } from "react";
import { Alert, Box, Button, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { ErroApi, requisitar } from "../../api/cliente";
import { validarCadastro, type CamposCadastro, type ErrosCadastro } from "../../auth/validacao";
import CampoSenha from "../../componentes/CampoSenha";
import RegrasSenha from "../../componentes/RegrasSenha";

type PerfilNovo = "ADMIN" | "OPERADOR";
const ROTULO: Record<PerfilNovo, string> = { ADMIN: "Admin", OPERADOR: "Operador" };
const CAMPOS: (keyof CamposCadastro)[] = ["nome", "email", "senha"];
const VAZIO: CamposCadastro = { nome: "", email: "", senha: "" };

export default function NovaConta() {
  const [dados, setDados] = useState<CamposCadastro>(VAZIO);
  const [perfil, setPerfil] = useState<PerfilNovo>("ADMIN");
  const [tocados, setTocados] = useState<Partial<Record<keyof CamposCadastro, boolean>>>({});
  const [tentou, setTentou] = useState(false);
  const [errosServidor, setErrosServidor] = useState<ErrosCadastro>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [criada, setCriada] = useState<{ nome: string; email: string; perfil: PerfilNovo } | null>(null);

  const errosLocais = validarCadastro(dados);
  const erroDe = (campo: keyof CamposCadastro) =>
    errosServidor[campo] ?? (tentou || tocados[campo] ? errosLocais[campo] : undefined);

  const alterar = (campo: keyof CamposCadastro, valor: string) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    setErrosServidor((e) => ({ ...e, [campo]: undefined }));
    setErroGeral(null);
  };
  const sairDoCampo = (campo: keyof CamposCadastro) => setTocados((t) => ({ ...t, [campo]: true }));

  const novaConta = () => {
    setDados(VAZIO);
    setPerfil("ADMIN");
    setTocados({});
    setTentou(false);
    setErrosServidor({});
    setErroGeral(null);
    setCriada(null);
  };

  const enviar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    if (enviando) return;
    setTentou(true);
    if (Object.keys(errosLocais).length > 0) return;

    setEnviando(true);
    setErroGeral(null);
    try {
      const nome = dados.nome.trim();
      const email = dados.email.trim();
      await requisitar("/mestre/contas", { metodo: "POST", corpo: { nome, email, senha: dados.senha, perfil } });
      setCriada({ nome, email: email.toLowerCase(), perfil });
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

  if (criada) {
    return (
      <Stack spacing={2} sx={{ p: 2, alignItems: "center", textAlign: "center" }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 56 }} aria-hidden />
        <Typography variant="h5" component="h1">
          Conta criada
        </Typography>
        <Typography sx={{ overflowWrap: "anywhere" }}>
          {criada.nome} ({ROTULO[criada.perfil]}) já pode entrar com <strong>{criada.email}</strong> e a senha temporária que você definiu.
          Combine com a pessoa um jeito seguro de passar a senha.
        </Typography>
        <Button variant="contained" size="large" fullWidth onClick={novaConta}>
          Criar outra conta
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={enviar} noValidate sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Nova conta
      </Typography>

      <Stack spacing={2}>
        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}

        <FormControl disabled={enviando}>
          <FormLabel id="rotulo-perfil">Perfil</FormLabel>
          <RadioGroup row aria-labelledby="rotulo-perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilNovo)}>
            {(Object.keys(ROTULO) as PerfilNovo[]).map((p) => (
              <FormControlLabel key={p} value={p} control={<Radio />} label={ROTULO[p]} />
            ))}
          </RadioGroup>
        </FormControl>

        <TextField
          label="Nome completo"
          name="nome"
          value={dados.nome}
          onChange={(e) => alterar("nome", e.target.value)}
          onBlur={() => sairDoCampo("nome")}
          disabled={enviando}
          required
          error={Boolean(erroDe("nome"))}
          helperText={erroDe("nome")}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          value={dados.email}
          onChange={(e) => alterar("email", e.target.value)}
          onBlur={() => sairDoCampo("email")}
          disabled={enviando}
          required
          error={Boolean(erroDe("email"))}
          helperText={erroDe("email")}
          slotProps={{ htmlInput: { inputMode: "email", autoCapitalize: "none" } }}
        />
        <Box>
          <CampoSenha
            label="Senha temporária"
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
          {enviando ? "Criando..." : "Criar conta"}
        </Button>
      </Stack>
    </Box>
  );
}
