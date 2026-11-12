import { useState } from "react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

type Props = {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  /** "current-password" no login, "new-password" no cadastro (ajuda o gerenciador de senhas). */
  autoComplete: "current-password" | "new-password";
  name?: string;
  error?: boolean;
  helperText?: string | undefined;
  disabled?: boolean;
  onBlur?: () => void;
};

/** Campo de senha com botão para mostrar e esconder o texto (alvo de toque de 44 px). */
export default function CampoSenha({ label, value, onChange, autoComplete, name, error, helperText, disabled, onBlur }: Props) {
  const [visivel, setVisivel] = useState(false);
  return (
    <TextField
      label={label}
      name={name ?? "senha"}
      type={visivel ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      autoComplete={autoComplete}
      error={error}
      helperText={helperText}
      disabled={disabled}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                onClick={() => setVisivel((v) => !v)}
                aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={visivel}
                sx={{ width: 44, height: 44 }}
              >
                {visivel ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
