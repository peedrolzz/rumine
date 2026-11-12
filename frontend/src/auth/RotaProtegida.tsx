import { Alert, Box, Button } from "@mui/material";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Carregando from "../componentes/Carregando";
import { useAuth } from "./contexto";

/**
 * Só deixa passar quem tem sessão. Sem sessão, leva ao login e guarda a tela de origem para
 * voltar depois. O backend é quem de fato barra as rotas; aqui é só a experiência de uso.
 */
export default function RotaProtegida() {
  const { estado, recarregar } = useAuth();
  const local = useLocation();

  if (estado.tipo === "carregando") return <Carregando />;

  if (estado.tipo === "erro") {
    // Sem conexão não é o mesmo que deslogado: não manda para o login, deixa tentar de novo.
    return (
      <Box sx={{ p: 2, maxWidth: 480, mx: "auto" }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void recarregar()}>
              Tentar de novo
            </Button>
          }
        >
          {estado.mensagem}
        </Alert>
      </Box>
    );
  }

  if (estado.tipo === "anonimo") {
    // Quem clicou em Sair volta ao início depois de entrar; nos demais casos, à tela em que estava.
    const de = estado.saiu ? undefined : `${local.pathname}${local.search}${local.hash}`;
    return <Navigate to="/entrar" replace state={{ de }} />;
  }

  return <Outlet />;
}
