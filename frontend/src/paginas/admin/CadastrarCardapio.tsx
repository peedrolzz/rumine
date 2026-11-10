// T15 - Admin cadastra/edita o cardápio de uma data (HU-11).
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { ErroApi, requisitar } from "../../api/cliente";

type Campo = "pratoPrincipal" | "acompanhamentos" | "sobremesa";
type Formulario = Record<Campo, string>;

const VAZIO: Formulario = { pratoPrincipal: "", acompanhamentos: "", sobremesa: "" };
const ROTULOS: Record<Campo, string> = {
  pratoPrincipal: "Prato principal",
  acompanhamentos: "Acompanhamentos",
  sobremesa: "Sobremesa",
};

// Data de hoje no horário local, no formato aaaa-mm-dd.
const hoje = () => {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};

export default function CadastrarCardapio() {
  const [data, setData] = useState(hoje());
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [existe, setExiste] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<{ campo: string; mensagem: string } | null>(null);
  const [sucesso, setSucesso] = useState(false);

  // Ao trocar a data, carrega o cardápio existente (se houver) para edição.
  useEffect(() => {
    if (!data) return;
    let cancelado = false;
    requisitar<Formulario>(`/cardapios/${data}`)
      .then((c) => {
        if (cancelado) return;
        setForm({ pratoPrincipal: c.pratoPrincipal, acompanhamentos: c.acompanhamentos, sobremesa: c.sobremesa });
        setExiste(true);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setForm(VAZIO);
        setExiste(false);
        // 404 = ainda não há cardápio nesta data (estado vazio, não é erro).
        if (!(e instanceof ErroApi && e.status === 404)) {
          setErroGeral(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
        }
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [data]);

  const trocarData = (novaData: string) => {
    setData(novaData);
    setCarregando(Boolean(novaData));
    setErroGeral(null);
    setErroCampo(null);
    setSucesso(false);
  };

  const alterar = (campo: Campo, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setSucesso(false);
    if (erroCampo?.campo === campo) setErroCampo(null);
  };

  const salvar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setErroCampo(null);
    setSucesso(false);
    try {
      await requisitar(`/cardapios/${data}`, { metodo: "PUT", corpo: form });
      setExiste(true);
      setSucesso(true);
    } catch (e) {
      if (e instanceof ErroApi && e.campo) setErroCampo({ campo: e.campo, mensagem: e.message });
      else setErroGeral(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Box component="form" onSubmit={salvar} noValidate sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Cardápio do dia
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Data"
          type="date"
          value={data}
          onChange={(e) => trocarData(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          error={erroCampo?.campo === "data"}
          helperText={erroCampo?.campo === "data" ? erroCampo.mensagem : undefined}
        />

        {carregando && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }} role="status" aria-label="Carregando cardápio">
            <CircularProgress />
          </Box>
        )}

        {!carregando && !existe && !erroGeral && (
          <Alert severity="info">Ainda não há cardápio para esta data. Preencha os campos e salve.</Alert>
        )}
        {!carregando && existe && !sucesso && (
          <Alert severity="info">Já existe cardápio para esta data. Ao salvar, ele será substituído.</Alert>
        )}

        {(Object.keys(ROTULOS) as Campo[]).map((campo) => (
          <TextField
            key={campo}
            label={ROTULOS[campo]}
            value={form[campo]}
            onChange={(e) => alterar(campo, e.target.value)}
            disabled={carregando || salvando}
            multiline
            minRows={2}
            required
            error={erroCampo?.campo === campo}
            helperText={erroCampo?.campo === campo ? erroCampo.mensagem : undefined}
          />
        ))}

        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}
        {sucesso && <Alert severity="success">Cardápio salvo! Os usuários já podem vê-lo.</Alert>}

        <Button type="submit" variant="contained" size="large" disabled={carregando || salvando || !data}>
          {salvando ? "Salvando..." : "Salvar cardápio"}
        </Button>
      </Stack>
    </Box>
  );
}
