// T15 - Admin cadastra/edita o cardápio de uma data (HU-11).
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { ErroApi, requisitar } from "../../api/cliente";

const CAMPOS = [
  { chave: "proteinaAnimal", rotulo: "Proteína animal" },
  { chave: "proteinaVegetariana", rotulo: "Proteína vegetariana" },
  { chave: "carboidrato1", rotulo: "Carboidrato 1" },
  { chave: "carboidrato2", rotulo: "Carboidrato 2" },
  { chave: "carboidrato3", rotulo: "Carboidrato 3" },
  { chave: "salada1", rotulo: "Salada 1" },
  { chave: "salada2", rotulo: "Salada 2" },
  { chave: "sobremesa", rotulo: "Sobremesa" },
  { chave: "suco", rotulo: "Suco" },
] as const;

type Campo = (typeof CAMPOS)[number]["chave"];
type Formulario = Record<Campo, string>;

const VAZIO = Object.fromEntries(CAMPOS.map((c) => [c.chave, ""])) as Formulario;

// Datas: a tela usa dd/mm/aaaa; a API usa aaaa-mm-dd.
const dois = (n: number) => String(n).padStart(2, "0");
const hoje = () => {
  const d = new Date();
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Converte "dd/mm/aaaa" em "aaaa-mm-dd"; devolve null se incompleta ou inexistente (ex.: 31/02). */
function paraIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  const valida = d.getFullYear() === Number(ano) && d.getMonth() === Number(mes) - 1 && d.getDate() === Number(dia);
  return valida ? `${ano}-${mes}-${dia}` : null;
}

/** Máscara: aceita só números e insere as barras (dd/mm/aaaa). */
function aplicarMascara(texto: string): string {
  const n = texto.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

export default function CadastrarCardapio() {
  const [dataTexto, setDataTexto] = useState(hoje());
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [existe, setExiste] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<{ campo: string; mensagem: string } | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const dataIso = paraIso(dataTexto);
  const dataIncompleta = dataTexto.length === 10 && !dataIso;

  // Ao trocar a data, carrega o cardápio existente (se houver) para edição.
  useEffect(() => {
    if (!dataIso) return;
    let cancelado = false;
    requisitar<Formulario>(`/cardapios/${dataIso}`)
      .then((c) => {
        if (cancelado) return;
        setForm(Object.fromEntries(CAMPOS.map((f) => [f.chave, c[f.chave] ?? ""])) as Formulario);
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
  }, [dataIso]);

  const trocarData = (valor: string) => {
    const texto = aplicarMascara(valor);
    setDataTexto(texto);
    setCarregando(Boolean(paraIso(texto)));
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
    if (!dataIso) return;
    setSalvando(true);
    setErroGeral(null);
    setErroCampo(null);
    setSucesso(false);
    try {
      await requisitar(`/cardapios/${dataIso}`, { metodo: "PUT", corpo: form });
      setExiste(true);
      setSucesso(true);
    } catch (e) {
      if (e instanceof ErroApi && e.campo) setErroCampo({ campo: e.campo, mensagem: e.message });
      else setErroGeral(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const erroData = dataIncompleta
    ? "Informe uma data válida, no formato dd/mm/aaaa."
    : erroCampo?.campo === "data"
      ? erroCampo.mensagem
      : undefined;

  return (
    <Box component="form" onSubmit={salvar} noValidate sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Cardápio do dia
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Data"
          placeholder="dd/mm/aaaa"
          value={dataTexto}
          onChange={(e) => trocarData(e.target.value)}
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 10 } }}
          error={Boolean(erroData)}
          helperText={erroData ?? "Dia, mês e ano. Exemplo: 10/11/2026"}
        />

        {carregando && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }} role="status" aria-label="Carregando cardápio">
            <CircularProgress />
          </Box>
        )}

        {dataIso && !carregando && !existe && !erroGeral && (
          <Alert severity="info">Ainda não há cardápio para esta data. Preencha os campos e salve.</Alert>
        )}
        {dataIso && !carregando && existe && !sucesso && (
          <Alert severity="info">Já existe cardápio para esta data. Ao salvar, ele será substituído.</Alert>
        )}

        {CAMPOS.map(({ chave, rotulo }) => (
          <TextField
            key={chave}
            label={rotulo}
            value={form[chave]}
            onChange={(e) => alterar(chave, e.target.value)}
            disabled={carregando || salvando || !dataIso}
            required
            error={erroCampo?.campo === chave}
            helperText={erroCampo?.campo === chave ? erroCampo.mensagem : undefined}
          />
        ))}

        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}
        {sucesso && <Alert severity="success">Cardápio salvo! Os usuários já podem vê-lo.</Alert>}

        <Button type="submit" variant="contained" size="large" disabled={carregando || salvando || !dataIso}>
          {salvando ? "Salvando..." : "Salvar cardápio"}
        </Button>
      </Stack>
    </Box>
  );
}
