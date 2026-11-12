// Formulário de RA e declaração (T04, HU-02): primeiro acesso e reenvio depois de rejeição.
import { useRef, useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { ErroApi, requisitar } from "../../api/cliente";
import { ACEITA, formatarTamanho, validarVinculo, type ErrosVinculo } from "../../vinculo/validacao";

type Props = {
  /** RA já informado antes (reenvio): vem preenchido. */
  identificadorInicial: string;
  /** Chamado quando o servidor aceitou o envio. */
  aoEnviar: () => void;
  /** Chamado quando o servidor diz que a situação mudou (ex.: já está em análise). */
  aoConflito: () => void;
  rotuloBotao: string;
};

export default function FormularioVinculo({ identificadorInicial, aoEnviar, aoConflito, rotuloBotao }: Props) {
  const [identificador, setIdentificador] = useState(identificadorInicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tentou, setTentou] = useState(false);
  const [errosServidor, setErrosServidor] = useState<ErrosVinculo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const errosLocais = validarVinculo(identificador, arquivo);
  const erroDe = (campo: keyof ErrosVinculo) => errosServidor[campo] ?? (tentou ? errosLocais[campo] : undefined);

  const enviar = async (evento: React.SyntheticEvent) => {
    evento.preventDefault();
    if (enviando) return;
    setTentou(true);
    if (Object.keys(errosLocais).length > 0 || !arquivo) return;

    setEnviando(true);
    setErroGeral(null);
    try {
      const corpo = new FormData();
      corpo.append("identificador", identificador.trim());
      corpo.append("declaracao", arquivo);
      await requisitar("/vinculo", { metodo: "POST", corpo });
      aoEnviar();
    } catch (e) {
      if (e instanceof ErroApi && (e.campo === "identificador" || e.campo === "declaracao")) {
        setErrosServidor({ [e.campo]: e.message });
      } else if (e instanceof ErroApi && e.status === 409) {
        setErroGeral(e.message);
        aoConflito(); // a situação mudou no servidor: a tela se atualiza
      } else {
        setErroGeral(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  };

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    setArquivo(e.target.files?.[0] ?? null);
    setErrosServidor((x) => ({ ...x, declaracao: undefined }));
    setErroGeral(null);
  };

  return (
    <Box component="form" onSubmit={enviar} noValidate sx={{ width: "100%", textAlign: "left" }}>
      <Stack spacing={2}>
        {erroGeral && <Alert severity="error">{erroGeral}</Alert>}

        <TextField
          label="RA"
          name="identificador"
          value={identificador}
          onChange={(e) => {
            setIdentificador(e.target.value);
            setErrosServidor((x) => ({ ...x, identificador: undefined }));
            setErroGeral(null);
          }}
          disabled={enviando}
          required
          error={Boolean(erroDe("identificador"))}
          helperText={erroDe("identificador") ?? "Registro Acadêmico, por exemplo a1234567"}
          slotProps={{ htmlInput: { autoCapitalize: "none", autoComplete: "off", maxLength: 40 } }}
        />

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }} id="rotulo-declaracao">
            Declaração de matrícula
          </Typography>
          {/* O campo de arquivo fica escondido; o botão grande (44 px) abre a escolha de arquivo. */}
          <input
            ref={entradaArquivo}
            type="file"
            accept={ACEITA}
            hidden
            disabled={enviando}
            onChange={escolher}
            aria-labelledby="rotulo-declaracao"
            data-testid="campo-arquivo"
          />
          <Button
            variant="outlined"
            size="large"
            fullWidth
            startIcon={<UploadFileIcon />}
            onClick={() => entradaArquivo.current?.click()}
            disabled={enviando}
            color={erroDe("declaracao") ? "error" : "primary"}
          >
            {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
          </Button>
          {arquivo && (
            <Typography variant="body2" sx={{ mt: 1, overflowWrap: "anywhere" }}>
              {arquivo.name} ({formatarTamanho(arquivo.size)})
            </Typography>
          )}
          <Typography
            variant="body2"
            sx={{ mt: 0.5, color: erroDe("declaracao") ? "error.main" : "text.secondary" }}
            role={erroDe("declaracao") ? "alert" : undefined}
          >
            {erroDe("declaracao") ?? "PDF, JPG ou PNG, até 5 MB."}
          </Typography>
        </Box>

        <Button type="submit" variant="contained" size="large" disabled={enviando}>
          {enviando ? "Enviando..." : rotuloBotao}
        </Button>
      </Stack>
    </Box>
  );
}
